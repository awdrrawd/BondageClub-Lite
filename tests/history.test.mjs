import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { Window } from 'happy-dom';
import LZString from 'lz-string';
import { history, sessionClass, decodeFriendNames, contactName } from './history-helper.mjs';
const {HistoryStore,historyBatch,historyPolicy,localDay,exportHistory} = history;
const DAY=86400000, policy=historyPolicy();
function snapshot(member=123, time=Date.now(), environment='PROD') {
  return {player:{MemberNumber:member,Name:'Me',Environment:environment,FriendNames:{55:'Saved friend'}},characters:[],friends:[],room:{Name:'Room <script>'},
    messages:[{id:'chat',sender:55,senderName:'Friend',text:'hello <img src="https://tracker.example">',type:'Chat',time:new Date(time),translation:{dictionary:[{secret:'never store'}]}}],
    whispers:[],beeps:[{id:'beep',memberNumber:55,name:'Friend',text:'private secret',incoming:true,time:new Date(time)}]};
}

test('FriendNames decodes BC UTF16 pairs, rejects malformed data and prefers live room names', () => {
  const names=decodeFriendNames(LZString.compressToUTF16(JSON.stringify([[55,'Cached'],[-1,'bad'],['56','bad'],[66,{}]])));
  assert.deepEqual(names,{55:'Cached'});
  assert.deepEqual(decodeFriendNames('broken'),{});
  const state=snapshot(); state.player.FriendNames=names;
  assert.equal(contactName(state,55),'Cached');
  state.characters=[{MemberNumber:55,Name:'Live',Nickname:'Live nickname'}];
  assert.equal(contactName(state,55),'Live nickname');
});

test('IndexedDB survives new instances, scopes account/environment and stores only message fields', async () => {
  const factory=new IDBFactory(), store=new HistoryStore(factory), state=snapshot();
  const batch=historyBatch(state);
  assert.equal(JSON.stringify(batch).includes('dictionary'),false);
  await store.write(batch,policy);
  await store.write(historyBatch(snapshot(999)),policy);
  await store.write(historyBatch(snapshot(123,Date.now(),'DEV')),policy);
  const reopened=new HistoryStore(factory), data=await reopened.read('PROD:123');
  assert.equal(data.messages.length,2); assert.equal(data.contacts.length,1);
  assert.ok(data.messages[0].message.time instanceof Date);
  assert.equal((await reopened.read('PROD:123',true)).messages.length,1);
  assert.equal((await reopened.read('PROD:555')).messages.length,0);
  assert.equal(data.messages.every(row=>row.owner==='PROD:123'),true);
});

test('expiry removes individual records, separates 7-day messages from 30-day contacts and never renews timestamps', async () => {
  const store=new HistoryStore(new IDBFactory()), now=Date.now(), old=now-8*DAY;
  await store.write(historyBatch(snapshot(123,old)),policy,old);
  await store.write(historyBatch(snapshot(999,now)),policy,now);
  await store.prune('PROD:123',policy,now);
  let data=await store.read('PROD:123');
  assert.equal(data.messages.length,0); assert.equal(data.contacts[0].timestamp,old);
  assert.equal((await store.read('PROD:999')).messages.length,2);
  await store.write(historyBatch(snapshot(123,old-1)),policy,old);
  assert.equal((await store.read('PROD:123')).contacts[0].timestamp,old);
  await store.prune('',policy,now+23*DAY);
  data=await store.read('PROD:123'); assert.equal(data.contacts.length,0);
});

test('shorter retention persists after logout and disabled categories leave no saved bodies', async () => {
  const store=new HistoryStore(new IDBFactory()), now=Date.now();
  await store.write(historyBatch(snapshot()),{recentDays:7,roomDays:0,privateDays:1},now);
  assert.equal((await store.read('PROD:123')).messages.length,1);
  await store.prune('PROD:999',policy,now+2*DAY);
  assert.equal((await store.read('PROD:123')).messages.length,0);
  await store.prune('PROD:123',{recentDays:0,roomDays:0,privateDays:0},now+2*DAY);
  assert.equal((await store.read('PROD:123')).contacts.length,0);
});

test('history sessions rehydrate private messages, reject stale loads, and clearing cannot delete a switched account', async () => {
  const window=new Window(), factory=new IDBFactory(), store=new HistoryStore(factory), Session=sessionClass(window);
  let errors=0;
  const session=new Session(store,()=>{},()=>errors++);
  session.observe(snapshot()); await session.flush();
  const restored=new Session(new HistoryStore(factory),()=>{},()=>errors++);
  restored.observe({...snapshot(),messages:[],beeps:[]}); await restored.flush();
  assert.equal(restored.contacts[0].peer,55); assert.equal(restored.messages[0].message.text,'private secret');
  const stale=restored.read();
  restored.observe({...snapshot(777),messages:[],beeps:[]});
  assert.deepEqual(await stale,{messages:[],contacts:[]}); await restored.flush(); assert.equal(restored.messages.length,0);
  const clearing=session.clear(); session.observe(snapshot(999)); await clearing; await session.flush();
  assert.equal((await store.read('PROD:123')).messages.length,0);
  assert.equal((await store.read('PROD:999')).messages.length,2);
  await session.clear(); session.observe(snapshot(999)); await session.flush();
  assert.equal((await store.read('PROD:999')).messages.length,0,'live ring must not refill a cleared archive');
  assert.equal(errors,0); await window.happyDOM.close();
});

test('storage failures are surfaced without leaking drafts and failed clear rejects', async () => {
  const window=new Window(), Session=sessionClass(window); let errors=0;
  const store={prune:async()=>{throw Error('denied');},read:async()=>({messages:[],contacts:[]}),write:async()=>{throw Error('quota');}};
  const session=new Session(store,()=>{},()=>errors++); session.observe(snapshot()); await session.flush();
  assert.ok(errors>0); await assert.rejects(session.clear(),/denied/);
  await window.happyDOM.close();
});

test('public history restores with its original room and manual clearing suppresses in-flight restoration', async () => {
  const window=new Window(), store=new HistoryStore(new IDBFactory()), Session=sessionClass(window), restored=[];
  await store.write(historyBatch(snapshot()),policy);
  const s=new Session(store,()=>{},()=>{},(owner,rows)=>restored.push({owner,rows}));
  s.observe({...snapshot(),messages:[],beeps:[]}); await s.flush();
  assert.equal(restored[0].owner,'PROD:123'); assert.equal(restored[0].rows[0].roomName,'Room <script>');
  const next=new Session(store,()=>{},()=>{},()=>assert.fail('must not restore after manual clear'));
  next.observe({...snapshot(),messages:[],beeps:[]}); await next.clearRoom();
  const data=await store.read('PROD:123'); assert.equal(data.messages.length,1); assert.equal(data.messages[0].kind,'private');
  await window.happyDOM.close();
});

test('daily export groups by room, preserves plain text and excludes private content unless selected', () => {
  const state=snapshot(), batch=historyBatch(state), day=localDay(Date.now());
  const text=exportHistory(batch.messages,day,false,type=>type);
  assert.match(text,/Room <script>/); assert.match(text,/hello <img/); assert.doesNotMatch(text,/private secret/);
  assert.match(exportHistory(batch.messages,day,true,type=>type),/private secret/);
  assert.equal(exportHistory(batch.messages,'2000-01-01',true,type=>type).includes('secret'),false);
  assert.deepEqual(historyPolicy({recentDays:900,roomDays:30,privateDays:-1}),policy);
});
