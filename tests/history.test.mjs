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

test('unchanged immutable history records are not serialized again when one message arrives', async () => {
  const window=new Window(), store=new HistoryStore(new IDBFactory()), Session=sessionClass(window), state=snapshot();
  state.beeps=[];
  let reads=0;
  state.messages=Array.from({length:3000},(_,i)=>({...state.messages[0],id:`incremental-${i}`,get text(){ reads++; return 'old'; }}));
  const session=new Session(store,()=>{},()=>assert.fail('storage failed'));
  session.observe(state); await session.flush(); const initialReads=reads;
  state.messages=[...state.messages.slice(1),{...state.messages[0],id:'new',text:'new'}];
  const before=reads; session.observe(state); await session.flush();
  assert.equal(reads,before,'old message fields must not be re-read to build or serialize records');
  assert.ok(initialReads>=3000);
  state.messages=[{...state.messages[0],text:'corrected'},...state.messages.slice(1)];
  session.observe(state); await session.flush();
  const saved=await store.read('PROD:123'); assert.equal(saved.messages.find(row=>row.message.id==='incremental-1').message.text,'corrected');
  await window.happyDOM.close();
});

test('private cache windows stay bounded and traverse both directions without gaps at equal timestamps', async () => {
  const window=new Window(), store=new HistoryStore(new IDBFactory()), Session=sessionClass(window), state=snapshot(), now=Date.now()-1000;
  state.messages=[];
  state.beeps=Array.from({length:725},(_,i)=>({...state.beeps[0],id:`window-${String(i).padStart(4,'0')}`,time:new Date(now)}));
  await store.write(historyBatch(state),policy);
  const session=new Session(store,()=>{},()=>assert.fail('storage failed'));
  session.observe({...state,beeps:[]}); await session.flush(); await session.loadPrivate(55);
  const seen=new Set(session.messages.map(row=>row.message.id));
  for (let i=0;i<20 && session.hasOlderPrivate(55);i++) {
    await session.loadPrivate(55,true);
    assert.ok(session.messages.length<=600);
    session.messages.forEach(row=>seen.add(row.message.id));
  }
  assert.equal(seen.size,725); assert.equal(session.hasOlderPrivate(55),false); assert.equal(session.hasNewerPrivate(55),true);
  const end=session.privateWindowEnd(55); assert.ok(end);
  session.observe({...state,beeps:[{...state.beeps[0],id:'window-new',time:new Date()}]}); await session.flush();
  assert.equal(session.messages.some(row=>row.message.id==='window-new'),false,'new live messages must not displace a historical window');
  for (let i=0;i<20 && session.hasNewerPrivate(55);i++) { await session.loadPrivate(55,false,true); assert.ok(session.messages.length<=600); }
  assert.equal(session.hasNewerPrivate(55),false); assert.equal(session.messages.at(-1).message.id,'window-new');
  assert.equal(session.hasOlderPrivate(55),true,'evicted older pages must become loadable again');
  assert.equal((await store.read('PROD:123')).messages.length,726);
  await window.happyDOM.close();
});

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

test('failed writes retry unchanged snapshots and corrected text upserts without extending expiry', async () => {
  const window=new Window(), store=new HistoryStore(new IDBFactory()), Session=sessionClass(window), state=snapshot();
  const write=store.write.bind(store); let attempts=0, errors=0;
  store.write=async (...args)=>{ if (++attempts===1) throw Error('temporary'); return write(...args); };
  const session=new Session(store,()=>{},()=>errors++);
  session.observe(state); await session.flush();
  assert.equal((await store.read('PROD:123')).messages.length,0);
  session.observe(state); await session.flush();
  const first=(await store.read('PROD:123')).messages.find(row=>row.kind==='room');
  assert.ok(first); assert.equal(errors,1);
  state.messages=[{...state.messages[0],text:'翻譯完成',time:new Date(+state.messages[0].time+1000)}];
  session.observe(state); await session.flush();
  const updated=(await store.read('PROD:123')).messages.find(row=>row.kind==='room');
  assert.equal(updated.message.text,'翻譯完成'); assert.equal(updated.timestamp,first.timestamp); assert.equal(updated.expiresAt,first.expiresAt);
  await session.clearRoom();
  state.messages=[{...state.messages[0],text:'再次翻譯'}]; session.observe(state); await session.flush();
  assert.equal((await store.read('PROD:123')).messages.some(row=>row.kind==='room'),false);
  await window.happyDOM.close();
});

test('a failed in-flight version cannot overwrite a newer queued correction across an account switch', async () => {
  const window=new Window(), store=new HistoryStore(new IDBFactory()), Session=sessionClass(window), state=snapshot();
  const write=store.write.bind(store); let fail, entered;
  const started=new Promise(resolve=>entered=resolve); let first=true;
  store.write=async (...args)=>{ if (first) { first=false; entered(); await new Promise((resolve,reject)=>fail=reject); } return write(...args); };
  const session=new Session(store,()=>{},()=>{}); session.observe(state); const initial=session.flush(); await started;
  state.messages=[{...state.messages[0],text:'new revision'}]; session.observe(state); const second=session.flush();
  session.observe(snapshot(999)); fail(Error('quota')); await initial; await second; await session.flush(); await session.flush();
  const old=(await store.read('PROD:123')).messages.find(row=>row.kind==='room');
  assert.equal(old.message.text,'new revision'); assert.equal((await store.read('PROD:999')).messages.length,2);
  await window.happyDOM.close();
});

test('clearing failed pending data preserves messages received after the clear request', async () => {
  const window=new Window(), store=new HistoryStore(new IDBFactory()), Session=sessionClass(window), state=snapshot();
  const write=store.write.bind(store); let first=true;
  store.write=async (...args)=>{ if (first) { first=false; throw Error('quota'); } return write(...args); };
  const session=new Session(store,()=>{},()=>{}); session.observe(state); await session.flush();
  const clearing=session.clear();
  state.messages=[...state.messages,{...state.messages[0],id:'after-clear',text:'new message'}];
  session.observe(state); await clearing; await session.flush();
  const data=await store.read('PROD:123'); assert.deepEqual(data.messages.map(row=>row.message.id),['after-clear']);
  await window.happyDOM.close();
});

test('indexed startup is bounded, equal-time private pages do not overlap and daily queries stay scoped', async () => {
  const store=new HistoryStore(new IDBFactory()), state=snapshot(), now=Date.now();
  state.messages=Array.from({length:205},(_,i)=>({...state.messages[0],id:`r-${String(i).padStart(4,'0')}`,time:new Date(now)}));
  state.beeps=Array.from({length:125},(_,i)=>({...state.beeps[0],id:`p-${String(i).padStart(4,'0')}`,time:new Date(now)}));
  await store.write(historyBatch(state),policy); await store.write(historyBatch(snapshot(999)),policy);
  const initial=await store.initial('PROD:123',100); assert.equal(initial.messages.filter(row=>row.kind==='room').length,100);
  const newest=await store.page('PROD:123','private',60,undefined,55), older=await store.page('PROD:123','private',60,newest[0],55);
  assert.equal(newest.length,60); assert.equal(older.length,60); assert.equal(new Set([...newest,...older].map(row=>row.key)).size,120);
  assert.deepEqual(await store.days('PROD:123',false),[{day:localDay(now),count:205}]);
  assert.equal((await store.day('PROD:123',localDay(now),false)).length,205);
  assert.equal((await store.day('PROD:123',localDay(now),true)).length,330);
});

test('v1 migration preserves original bodies, timestamps and shorter expiry while adding indexes', async () => {
  const factory=new IDBFactory(), state=snapshot(), batch=historyBatch(state), expiry=+state.messages[0].time+DAY;
  await new Promise((resolve,reject)=>{
    const request=factory.open('bc-lite-history',1); request.onerror=()=>reject(request.error);
    request.onupgradeneeded=()=>{
      for (const name of ['messages','contacts']) {
        const store=request.result.createObjectStore(name,{keyPath:'key'}); store.createIndex('owner','owner'); store.createIndex('timestamp','timestamp');
        if (name==='messages') store.createIndex('ownerKind',['owner','kind']);
        for (const row of batch[name]) store.put({...row,expiresAt:expiry});
      }
    };
    request.onsuccess=()=>{request.result.close();resolve();};
  });
  const store=new HistoryStore(factory), rows=await store.page('PROD:123','private',60,undefined,55);
  assert.equal(rows[0].message.text,'private secret'); assert.equal(rows[0].expiresAt,expiry);
  assert.equal(rows[0].timestamp,+state.beeps[0].time); assert.equal((await store.days('PROD:123',true))[0].count,2);
});

test('clearing during startup cannot restore old private records or contacts', async () => {
  const window=new Window(), store=new HistoryStore(new IDBFactory()), Session=sessionClass(window);
  await store.write(historyBatch(snapshot()),policy);
  const session=new Session(store,()=>{},()=>{},()=>assert.fail('cleared history restored'));
  session.observe({...snapshot(),messages:[],beeps:[]}); await session.clear();
  assert.deepEqual(session.messages,[]); assert.deepEqual(session.contacts,[]);
  assert.equal((await store.read('PROD:123')).messages.length,0);
  await window.happyDOM.close();
});

test('private archive loads older per-peer pages and manual clear also removes those loaded rows', async () => {
  const window=new Window(), store=new HistoryStore(new IDBFactory()), Session=sessionClass(window), state=snapshot(), now=Date.now();
  state.messages=[]; state.beeps=Array.from({length:125},(_,i)=>({...state.beeps[0],id:`p-${String(i).padStart(4,'0')}`,time:new Date(now)}));
  await store.write(historyBatch(state),policy);
  const initial=store.initial.bind(store); store.initial=owner=>initial(owner,60);
  const session=new Session(store,()=>{},()=>{}); session.observe({...state,beeps:[]}); await session.flush();
  assert.equal(session.messages.length,60);
  await session.loadPrivate(55,true); assert.equal(session.messages.length,120);
  await session.loadPrivate(55,true); assert.equal(session.messages.length,125); assert.equal(session.hasOlderPrivate(55),false);
  await session.clear(); assert.equal(session.messages.length,0); assert.equal((await store.read('PROD:123')).messages.length,0);
  await window.happyDOM.close();
});
