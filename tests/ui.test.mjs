import { loadTypeScript } from './load-typescript.mjs';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import { IDBFactory } from 'fake-indexeddb';
import LZString from 'lz-string';
import { t, getLocale, setLocale } from './i18n-helper.mjs';
import { appendChatLinks, MediaConsent } from './links-helper.mjs';
import { afcLovers } from './community-helper.mjs';
import { definitions } from './native-helper.mjs';
import { canonicalPartGroup } from './activity-helper.mjs';
import { uiIcons } from './icons-helper.mjs';
import { history, sessionClass, contactName } from './history-helper.mjs';
import { dialogs } from './dialogs-helper.mjs';
const activitySource = loadTypeScript('src/ui/activity-dialog.ts');
const nameColor = new Function(loadTypeScript('src/ui/name-color.ts') + ';return nameColor;')();
const stabilitySource = loadTypeScript(new URL('../src/platform/stability.ts', import.meta.url));

const bioCode = loadTypeScript(new URL('../src/profile/biography.ts', import.meta.url));
const decodeBiography = new Function('LZString', 't', bioCode + '; return decodeBiography;')(LZString, t);

const source = loadTypeScript(new URL('../src/ui/app.ts', import.meta.url));
const roomListSource = loadTypeScript('src/ui/room-list.ts');
const { sortRooms, canJoinRoom } = new Function(roomListSource + ';return {sortRooms,canJoinRoom};')();
const mobileSource = loadTypeScript('src/platform/mobile.ts');

const fixtureCleanup = new Set();
afterEach(async () => {
  const cleanup = [...fixtureCleanup];
  fixtureCleanup.clear();
  const results = await Promise.allSettled(cleanup.map(dispose => dispose()));
  for (const result of results) if (result.status === 'rejected') throw result.reason;
});

function setup(savedAccount, savedPerformance, indexedDBFactory) {
  setLocale('zh');
  const window = new Window({ url: 'https://lite.example', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  const intervalHandles = new Set();
  // Register before initializing LiteApp so assertion/setup failures cannot
  // leave its periodic history observer running in a test worker.
  let instance;
  fixtureCleanup.add(async () => {
    await instance?.dispose();
    for (const handle of intervalHandles) window.clearInterval(handle);
    intervalHandles.clear();
    if (!window.closed) await window.happyDOM.close();
  });
  const Lifetime = new Function("window",loadTypeScript("src/platform/lifetime.ts")+";return Lifetime;")(window);
  const { icon, iconSelect } = uiIcons(window);
  if (indexedDBFactory) Object.defineProperty(window,'indexedDB',{value:indexedDBFactory});
  const intervals=[];
  const setInterval=window.setInterval.bind(window);
  window.setInterval=(callback,delay,...args)=>{
    intervals.push({callback,delay});
    const handle = setInterval(callback,delay,...args);
    intervalHandles.add(handle);
    return handle;
  };
  const openActivityDialog = new Function('document', 'window', 't', 'definitions', 'canonicalPartGroup', activitySource + ';return openActivityDialog;')(window.document, window, t, definitions, canonicalPartGroup);
  const StabilityControls = new Function('document', 'window', 't', 'URL', stabilitySource + ';return StabilityControls;')(window.document, window, t, window.URL);
  window.document.body.innerHTML = '<div id="app"></div>';
  if (savedAccount) window.localStorage.setItem('bc-lite-account-v1', savedAccount);
  if (savedPerformance) window.localStorage.setItem('bc-lite-performance-v1', savedPerformance);
  let current = { phase: 'ready', status: 'Ready', player: { Name: 'Tester', MemberNumber: 123, FriendList: [55], Appearance: [] }, room: null, rooms: [], characters: [], messages: [], friends: [], friendsQueryState: 'idle', friendsStatus: '尚未查詢', beeps: [] };
  let listener;
  const calls = [], replies = [];
  const bcClient = {
    subscribe(callback) { listener = callback; listener(current); return () => { listener = () => {}; }; },
    refreshFriends() { calls.push('friends'); },
    sendChat(text, replyId) { calls.push(text); replies.push({text,replyId}); },
    activityOptions() { return [{ group: 'ItemHead', groupLabel: '頭部', name: 'Pet', label: '撫摸', reason: null }]; },
    sendActivity(id, group, name) { calls.push({ activity: name, group, id }); },
    setTextCatalog() {},
    restoreMessages() {},
    cuddleInfo() { return {token:'test',text:'Both ItemMisc slots'}; },
    respondCuddle(accept) { calls.push({ cuddle: accept }); current = { ...current, cuddleRequest: null }; listener(current); },
    setMessageLimit(value) { calls.push({ historyLimit: value }); if (current.messages.length > value) { current = { ...current, messages: current.messages.slice(-value) }; listener?.(current); } },
    clearMessages() { current = { ...current, messages: [] }; listener(current); },
    configureSummons() {}, dismissSummon() {}, acceptSummon() {}, requestLoverRoom(id) { calls.push({ lover: id }); }, sendInteraction(id, action) { calls.push({ interaction: action, id }); },
    recordLifecycle(event) { calls.push({ lifecycle: event }); },
    resumeConnection() { calls.push('resume'); },
    connectionDiagnostics() { return 'test-event'; },
    activateSafeword(mode) { calls.push({ safeword: mode }); },
    relocalize() {},
    sendBeep(id, text) { calls.push({ id, text }); },
    async login(account) { calls.push({ login: account }); },
    setFriend() {}, clearBeeps() {}, leave() {}, disconnect() {}, search(request) { calls.push({ search:request }); }, join() {}, createRoom() {},
  };
  const {isMobileLayout, bindPageSwipe} = new Function('window', mobileSource + ';return {isMobileLayout,bindPageSwipe};')(window);
  const uiSource = path => loadTypeScript(path);
  const dom = new Function('document',uiSource('src/ui/dom.ts')+';return {el,select,field,button,checkbox,input};')(window.document);
  const buildSettingsView = new Function("t", "localStorage", ...Object.keys(dom), loadTypeScript("src/ui/settings-view.ts")+";return buildSettingsView;")(t,window.localStorage,...Object.values(dom));
  const modal=dialogs(window.document);
  const deps = {...history,...dom,...modal,t,window,document:window.document};
  Object.assign(deps,new Function('localDay',uiSource('src/storage/history-export.ts')+';return {exportHistoryHTML,exportHistoryXLSX};')(history.localDay));
  const buildHistorySettings = new Function(...Object.keys(deps),uiSource('src/ui/history-settings.ts')+';return buildHistorySettings;')(...Object.values(deps));
  const MessageSounds = new Function('window','localStorage',uiSource('src/platform/message-sounds.ts')+';return MessageSounds;')(window,window.localStorage);
  const openHistorySearch = new Function(...Object.keys(deps),uiSource('src/ui/history-search.ts')+';return openHistorySearch;')(...Object.values(deps));
  const contactCard = new Function('t','el',uiSource('src/ui/contact-card.ts')+';return contactCard;')(t,dom.el);
  const UnreadState = new Function(uiSource('src/ui/unread-state.ts')+';return UnreadState;')();
  const PrivateMessages = new Function(...Object.keys(history),uiSource('src/ui/private-messages.ts')+';return PrivateMessages;')(...Object.values(history));
  instance = vm.runInNewContext(source + "\nnew LiteApp(bcClient);", { UnreadState, Lifetime, buildSettingsView, ...history, ...dom, ...modal, MessageSounds, openHistorySearch, buildHistorySettings, contactCard, PrivateMessages, HistorySession:sessionClass(window), contactName, window, document: window.document, localStorage: window.localStorage, bcClient, decodeBiography, appendChatLinks, MediaConsent, afcLovers, StabilityControls, openActivityDialog, icon, iconSelect, nameColor, sortRooms, canJoinRoom, isMobileLayout, bindPageSwipe, loadTextCatalog: async () => ({}), t, getLocale, setLocale });
  return { instance, window, document: window.document, calls, replies, intervals, client:bcClient, state: () => current, emit(change) { if (change.friendsStatus === '查詢完成') change.friendsQueryState = 'ready'; current = { ...current, ...change }; listener(current); } };
}

test('same-room synchronization preserves shell, composer, log, selection and unchanged member nodes', async () => {
  const f=setup(), character={MemberNumber:55,Name:'Friend',Description:'Original bio'};
  const message={id:'stable',sender:55,senderName:'Friend',text:'Keep this text',type:'Chat',time:new Date()};
  f.emit({phase:'in-room',room:{Name:'Here',Limit:10,Language:'EN',Description:'Old description'},characters:[character],messages:[message]});
  const shell=f.document.querySelector('.app-shell'), input=f.document.getElementById('InputChat'), log=f.document.getElementById('TextAreaChatLog');
  const row=log.firstChild, member=f.document.querySelector('.member-row');
  input.value='中文草稿'; input.dispatchEvent(new f.window.Event('input')); input.focus(); input.setSelectionRange(1,3);
  input.dispatchEvent(new f.window.CompositionEvent('compositionstart',{bubbles:true}));
  for (let i=0;i<5;i++) f.emit({characters:[{...character,Appearance:[{Group:'ItemArms',Name:`Item${i}`}]}],room:{...f.state().room},player:{...f.state().player},status:`Sync ${i}`,onlinePlayers:i});
  for (const timer of f.intervals.filter(timer=>timer.delay===60000)) timer.callback();
  assert.ok(shell); assert.equal(f.document.querySelector('.app-shell'),shell);
  assert.equal(f.document.getElementById('InputChat'),input); assert.equal(f.document.getElementById('TextAreaChatLog'),log);
  assert.equal(log.firstChild,row); assert.equal(f.document.querySelector('.member-row'),member);
  assert.equal(input.value,'中文草稿'); assert.equal(input.selectionStart,1); assert.equal(f.document.activeElement,input);
  f.emit({characters:[{...character,Nickname:'Updated',Description:'Current bio'},{MemberNumber:66,Name:'New member'}],room:{...f.state().room,Limit:5,Description:'Updated description'}});
  assert.equal(f.document.querySelector('.member-row'),member); assert.match(member.textContent,/Updated/);
  assert.equal(f.document.querySelector('.room-population').textContent,'2/5'); assert.match(f.document.querySelector('.room-info').textContent,/Updated description/);
  member.click(); assert.match(f.document.querySelector('.profile-dialog').textContent,/Updated/);
  input.dispatchEvent(new f.window.CompositionEvent('compositionend',{bubbles:true}));
  await new Promise(resolve=>f.window.setTimeout(resolve,5));
  assert.equal(f.document.getElementById('InputChat'),input);
  f.emit({characters:[{MemberNumber:66,Name:'New member'}]}); assert.equal(member.isConnected,false); assert.equal(log.firstChild,row);
  f.emit({room:{Name:'Other',Limit:10}}); assert.notEqual(f.document.getElementById('InputChat'),input);
  await f.window.happyDOM.close();
});

test('message corrections and member drawer toggles retain the composer and unrelated rows', async () => {
  const f=setup(), messages=['one','two'].map(id=>({id,sender:55,senderName:'Friend',text:id,type:'Chat',time:new Date()}));
  f.emit({phase:'in-room',room:{Name:'Here',Limit:10},messages});
  const input=f.document.getElementById('InputChat'), log=f.document.getElementById('TextAreaChatLog'), second=log.lastChild;
  f.emit({messages:[{...messages[0],text:'corrected'},messages[1]]});
  assert.match(log.textContent,/corrected/); assert.equal(log.lastChild,second); assert.equal(f.document.getElementById('InputChat'),input);
  f.document.querySelector('.member-panel > .mobile-members').click();
  assert.ok(f.document.querySelector('.room-view').classList.contains('members-open')); assert.equal(f.document.getElementById('TextAreaChatLog'),log);
  f.document.querySelector('.member-panel .mobile-members').click(); assert.equal(f.document.getElementById('InputChat'),input);
  await f.window.happyDOM.close();
});

test('overlapping room history pages remain chronological without rebuilding the input', async () => {
  const f=setup(), messages=Array.from({length:150},(_,i)=>({id:`overlap-${i}`,sender:55,senderName:'Friend',text:`Line ${i}`,type:'Chat',time:new Date()}));
  f.emit({phase:'in-room',room:{Name:'Here',Limit:10},messages});
  const input=f.document.getElementById('InputChat'), shared=f.document.querySelector('[data-message-id="overlap-75"]');
  [...f.document.querySelectorAll('.chat-room-top-menu button')].find(node=>node.textContent===t('m162')).click();
  assert.deepEqual([...f.document.querySelectorAll('#TextAreaChatLog .chat-message')].map(node=>node.dataset.messageId),messages.slice(0,100).map(message=>message.id));
  assert.equal(f.document.querySelector('[data-message-id="overlap-75"]'),shared); assert.equal(f.document.getElementById('InputChat'),input);
  await f.window.happyDOM.close();
});

test('private UI crosses the cache boundary in both directions while live arrivals stay outside older pages', async context => {
  const factory=new IDBFactory(), store=new history.HistoryStore(factory), now=Date.now()-1000;
  const beeps=Array.from({length:725},(_,i)=>({id:`page-${String(i).padStart(4,'0')}`,memberNumber:55,name:'Friend',text:`Line ${i}`,incoming:true,time:new Date(now)}));
  await store.write(history.historyBatch({player:{MemberNumber:123,Name:'Tester'},room:null,messages:[],whispers:[],beeps}),history.historyPolicy());
  const f=setup(undefined,undefined,factory);
  context.after(()=>f.window.happyDOM.close());
  // Observe completion through the UI rather than sleeping for storage timings.
  const waitFor=async predicate=>{ for(let i=0;i<2000;i++){ if(predicate())return; await new Promise(resolve=>setTimeout(resolve,5)); } assert.fail(`history UI did not settle: ${f.document.querySelector('.private-history-controls')?.outerHTML}; ${f.document.querySelector('.lite-notice')?.textContent}; first=${f.document.querySelector('#beep-log .chat-message')?.dataset.messageId}; last=${f.document.querySelector('#beep-log .chat-message:last-child')?.dataset.messageId}`); };
  f.emit({characters:[{MemberNumber:55,Name:'Friend'}],beeps:beeps.slice(-300)});
  f.document.getElementById('nav-private').click(); f.document.querySelector('[data-member="55"]').click();
  await waitFor(()=>f.document.querySelector('[data-message-id="page-0724"]') && f.document.querySelector('.private-history-controls').getAttribute('aria-busy')==='false');
  const input=f.document.getElementById('BeepText');
  const first=()=>f.document.querySelector('#beep-log .chat-message')?.dataset.messageId;
  let previous=first();
  for(let i=0;i<12 && !f.document.querySelector('[data-history="older"]').disabled;i++) {
    f.document.querySelector('[data-history="older"]').click();
    await waitFor(()=>f.document.querySelector('.private-history-controls').getAttribute('aria-busy')==='false' && (first()!==previous || f.document.querySelector('[data-history="older"]').disabled)); previous=first();
  }
  assert.equal(first(),'page-0000');
  f.emit({beeps:[...beeps.slice(-299),{...beeps[0],id:'page-new',text:'new live message',time:new Date()}]});
  assert.equal(first(),'page-0000'); assert.equal(f.document.querySelector('[data-message-id="page-new"]'),null);
  for(let i=0;i<16 && !f.document.querySelector('[data-history="newer"]').disabled;i++) {
    f.document.querySelector('[data-history="newer"]').click();
    await waitFor(()=>f.document.querySelector('.private-history-controls').getAttribute('aria-busy')==='false' && (first()!==previous || f.document.querySelector('[data-history="newer"]').disabled)); previous=first();
  }
  assert.ok(f.document.querySelector('[data-message-id="page-new"]')); assert.equal(f.document.getElementById('BeepText'),input);
  await f.window.happyDOM.close();
});

test('search refreshes and private presence changes update data without replacing forms', async () => {
  const f=setup(), search=f.document.getElementById('RoomQuery'); search.value='draft search';
  f.emit({rooms:[{Name:'Result',MemberCount:1,MemberLimit:10,CanJoin:true,Language:'EN',Space:'X'}]});
  assert.equal(f.document.getElementById('RoomQuery'),search); assert.equal(search.value,'draft search'); assert.match(f.document.querySelector('.room-list').textContent,/Result/);
  f.emit({characters:[{MemberNumber:55,Name:'Friend'}]}); f.document.getElementById('nav-private').click();
  f.document.querySelector('[data-member="55"]').click();
  const input=f.document.getElementById('BeepText'), card=f.document.querySelector('[data-member="55"]');
  f.emit({characters:[{MemberNumber:55,Name:'Friend',Appearance:[]}]}); assert.equal(f.document.querySelector('[data-member="55"]'),card);
  f.document.querySelector('[data-channel="whisper"]').click();
  f.emit({characters:[]}); assert.equal(f.document.getElementById('BeepText'),input);
  assert.equal(f.document.querySelector('[data-channel="whisper"]').disabled,true);
  assert.equal(f.document.querySelector('[data-channel="beep"]').getAttribute('aria-pressed'),'true');
  await f.window.happyDOM.close();
});

test('contact cards use cached names with live-room priority, room-only subtitle and message-by-default selection', async () => {
  const f=setup();
  f.emit({player:{...f.state().player,FriendList:[55,66,77],FriendNames:{55:'Cached name',66:'Old name',77:'Offline name'}},
    room:{Name:'Here'},characters:[{MemberNumber:66,Name:'Room name',Nickname:'Live nickname'}],friendsStatus:'查詢完成',
    friends:[{MemberNumber:55,MemberName:'Server name',Type:'Lover',Private:true}],
    beeps:[{id:'offline',memberNumber:77,name:'Old offline name',text:'Saved conversation',incoming:true,time:new Date()}]});
  f.document.getElementById('nav-friends').click();
  assert.equal(f.document.querySelector('.friends-view > .eyebrow'),null);
  assert.equal(f.document.querySelectorAll('.contact-card').length,2);
  assert.equal(f.document.querySelector('.contact-toolbar input').type,'search');
  assert.equal(f.document.querySelectorAll('.contact-toolbar button svg').length,2);
  const card=f.document.querySelector('[data-member="55"]');
  assert.match(card.textContent,/Cached name/); assert.equal(card.querySelector('.contact-room').textContent,'私人');
  assert.equal(card.querySelector('.contact-id').previousElementSibling.tagName,'STRONG');
  assert.equal(card.querySelector('.contact-identity').nextElementSibling.className,'contact-relation');
  assert.equal(f.document.querySelector('[data-member="66"] .contact-room').textContent,'同一房間');
  assert.match(f.document.querySelector('[data-member="66"]').textContent,/Live nickname/);
  card.click();
  assert.equal(f.document.querySelector('[data-channel="beep"]').getAttribute('aria-pressed'),'true');
  assert.equal(f.document.querySelector('[data-channel="whisper"]').disabled,true);
  assert.equal(f.document.querySelector('.private-status'),null);
  const filter=label=>[...f.document.querySelectorAll('.friend-filters button')].find(b=>b.textContent===label).click();
  filter(t('m012')); assert.equal(f.document.querySelector('[data-member="77"]'),null);
  filter(t('private.recent')); const offline=f.document.querySelector('[data-member="77"]');
  assert.ok(offline.classList.contains('contact-offline')); assert.equal(offline.querySelector('button'),null);
  offline.click(); assert.ok(f.document.querySelector('[data-member="77"]').classList.contains('selected-contact'));
  f.document.querySelector('.friend-refresh').click(); assert.equal(f.calls.at(-1),'friends');
  await f.window.happyDOM.close();
});

test('direct account/environment changes reset drafts and selection but same-owner reconnect preserves them', async () => {
  const f=setup();
  f.emit({room:{Name:'Here'},characters:[{MemberNumber:55,Name:'Friend'}],friends:[{MemberNumber:55,MemberName:'Friend'}],friendsStatus:'查詢完成'});
  f.document.getElementById('nav-friends').click(); f.document.querySelector('[data-member="55"]').click();
  const draft=f.document.getElementById('BeepText'); draft.value='private draft'; draft.dispatchEvent(new f.window.Event('input'));
  f.emit({player:{...f.state().player},phase:'in-room'});
  assert.equal(f.document.getElementById('BeepText').value,'private draft');
  f.emit({player:{...f.state().player,Environment:'DEV'},phase:'ready',room:null,characters:[],beeps:[],messages:[]});
  f.document.getElementById('nav-private').click();
  assert.equal(f.document.getElementById('BeepText').value,'');
  assert.equal(f.document.querySelector('.selected-contact'),null);
  f.emit({player:{...f.state().player,MemberNumber:999},phase:'ready'});
  f.document.getElementById('nav-private').click(); assert.equal(f.document.getElementById('BeepText').value,'');
  await f.window.happyDOM.close();
});

test('same-ID private corrections update displayed text without changing the composer', async () => {
  const f=setup(), message={id:'corrected',memberNumber:55,name:'Friend',text:'old text',incoming:true,time:new Date()};
  f.emit({beeps:[message]}); f.document.getElementById('nav-private').click();
  const input=f.document.getElementById('BeepText');
  f.emit({beeps:[{...message,text:'corrected text'}]});
  assert.match(f.document.getElementById('beep-log').textContent,/corrected text/);
  assert.doesNotMatch(f.document.getElementById('beep-log').textContent,/old text/);
  assert.equal(f.document.getElementById('BeepText'),input);
  await f.window.happyDOM.close();
});

test('settings have working category anchors, independent retention choices and theme/flag controls', async () => {
  const f=setup(); f.document.getElementById('nav-settings').click();
  for (const a of f.document.querySelectorAll('.settings-jumps a')) assert.ok(f.document.querySelector(a.hash));
  assert.equal(f.document.getElementById('History-recentDays').value,'30');
  assert.equal(f.document.getElementById('History-roomDays').value,'7');
  assert.equal(f.document.getElementById('History-privateDays').value,'7');
  assert.equal(f.document.querySelector('.history-settings input[type=checkbox]').checked,false);
  const theme=f.document.getElementById('ThemeSelect'); theme.value='midnight'; theme.dispatchEvent(new f.window.Event('change'));
  assert.equal(f.document.documentElement.dataset.theme,'midnight');
  assert.equal(JSON.parse(f.window.localStorage.getItem('bc-lite-display-v1')).theme,'midnight');
  const locale=f.document.querySelector('.locale-picker'); assert.ok(locale.querySelector('summary svg'));
  locale.querySelector('[data-value="en"]').click(); assert.equal(f.document.documentElement.lang,'en');
  await f.window.happyDOM.close();
});

test('private history pages stay bounded and freeze while reading older messages', async () => {
  const f=setup(), now=Date.now();
  const beeps=Array.from({length:155},(_,i)=>({id:`history-${i}`,memberNumber:55,name:'Friend',text:`Line ${i}`,incoming:true,time:new Date(now-100000+i)}));
  f.emit({beeps}); f.document.getElementById('nav-private').click();
  assert.equal(f.document.querySelectorAll('#beep-log .chat-message').length,60);
  assert.ok(f.document.querySelector('[data-message-id="history-154"]'));
  f.document.querySelector('[data-history="older"]').click();
  const first=f.document.querySelector('#beep-log .chat-message').dataset.messageId;
  f.emit({beeps:[...beeps,{...beeps[0],id:'newest',text:'newest',time:new Date()}]});
  assert.equal(f.document.querySelector('#beep-log .chat-message').dataset.messageId,first);
  assert.equal(f.document.querySelectorAll('#beep-log .chat-message').length,60);
  f.document.querySelector('[data-history="newer"]').click(); f.document.querySelector('[data-history="newer"]').click();
  assert.ok(f.document.querySelector('[data-message-id="newest"]'));
  await f.window.happyDOM.close();
});

test('room language flags and desktop region labels share the SVG picker, Chinese uses Hong Kong', async () => {
  const f=setup();
  assert.match(f.document.querySelector('.locale-picker summary image').getAttribute('href'),/flag-hk\.svg/);
  const language=f.document.querySelector('.room-language');
  for (const [code,flag] of [['CN','hk'],['EN','gb'],['DE','de'],['FR','fr'],['ES','es'],['RU','ru'],['UA','ua']]) {
    assert.match(language.querySelector(`[data-value="${code}"] image`).getAttribute('href'),new RegExp(`flag-${flag}\\.svg`));
  }
  assert.ok(f.document.querySelector('.room-space summary .picker-value').textContent);
  language.querySelector('[data-value="CN"]').click();
  assert.equal(f.calls.at(-1).search.Language,'CN');
  assert.match(language.querySelector('summary image').getAttribute('href'),/flag-hk\.svg/);
  f.emit({rooms:[{Name:'Chinese room',Language:'CN',Space:'X',MemberCount:1,MemberLimit:10,CanJoin:true}]});
  assert.match(f.document.querySelector('.room-language-tag image').getAttribute('href'),/flag-hk\.svg/);
  await f.window.happyDOM.close();
});

test('mobile search controls use labelled SVG choices, expand query and retain navigation/result order', async () => {
  const f=setup();
  const form=f.document.querySelector('.room-controls:not(.create-controls)');
  assert.deepEqual([...form.children].map(node=>node.classList[1] || node.classList[0]),['room-query','primary','room-space','room-language','room-filters']);
  assert.equal(f.document.querySelectorAll('.app-nav button > svg').length,5);
  assert.deepEqual([...f.document.querySelector('.result-header').children].map(node=>node.tagName),['NAV','SELECT']);
  const query=f.document.getElementById('RoomQuery'); query.focus();
  assert.equal(form.classList.contains('search-expanded'),true);
  f.document.querySelector('.view-heading h1').click(); assert.equal(form.classList.contains('search-expanded'),false);
  const picker=form.querySelector('.room-space .mobile-picker'); picker.open=true;
  const male=picker.querySelector('button[data-value="M"]'); assert.ok(male.querySelector('svg')); assert.match(male.textContent,/男性/);
  male.click(); assert.equal(picker.open,false); assert.equal(f.calls.at(-1).search.Space,'M');
  assert.match(picker.querySelector('summary').getAttribute('aria-label'),/男性/);
  picker.open=true; f.document.querySelector('.view-heading').click(); assert.equal(picker.open,false);
  await f.window.happyDOM.close();
});

test('body families light together, merge actions and show warnings only in tooltips', async () => {
  const f=setup();
  f.client.activityOptions=()=>['ItemMouth','ItemTorso','ItemTorso2','ItemNipples'].map(group=>({group,groupLabel:group,name:'Pet',label:'撫摸',reason:null,warning:'native.effects'}));
  f.emit({phase:'in-room',room:{Name:'Room',Limit:10},cuddlePartner:55,characters:[{MemberNumber:55,Name:'Friend'},{MemberNumber:123,Name:'Me'}]});
  const members=f.document.querySelectorAll('.member-row');
  assert.match(members[0].textContent,/Me/);
  assert.equal(members[1].querySelector('.member-cuddle').textContent,'貼');
  members[1].click(); f.document.querySelector('.interaction-open').click();
  const dialog=f.document.querySelector('.activity-dialog');
  for (const [group,count] of [['ItemMouth3',3],['ItemTorso2',2],['ItemNipplesPiercings',2]]) {
    dialog.querySelector(`[data-body-group="${group}"]`).dispatchEvent(new f.window.Event('click'));
    assert.equal(dialog.querySelectorAll('[aria-pressed="true"]').length,count);
    assert.equal(dialog.querySelectorAll('.activity-option').length,1);
    assert.equal(dialog.querySelector('.activity-option small'),null);
    assert.ok(dialog.querySelector('.activity-option button').title);
  }
  await f.window.happyDOM.close();
});

test('all actions defaults off, reveals restrictions without enabling them and refreshes live', async () => {
  const f=setup();
  let blocked=false;
  f.client.activityOptions=(_id, compatibility) => [{group:'ItemHead',groupLabel:'頭部',name:'Pet',label:'撫摸',reason:blocked ? 'native.blocked' : compatibility ? null : 'native.equipment'}];
  f.emit({phase:'in-room',room:{Name:'Room',Limit:10},characters:[{MemberNumber:55,Name:'Friend'}]});
  f.document.querySelector('.member-row').click();
  f.document.querySelector('.interaction-open').click();
  const dialog=f.document.querySelector('.activity-dialog');
  dialog.querySelector('[data-body-group="ItemHead"]').dispatchEvent(new f.window.Event('click'));
  const mode=dialog.querySelector('input[type=checkbox]');
  assert.equal(mode.checked,false);
  assert.match(mode.parentElement.textContent,/ALL/);
  assert.equal(dialog.querySelector('.activity-info').getAttribute('aria-expanded'),'false');
  assert.equal(dialog.querySelector('.activity-option button'),null);
  mode.checked=true; mode.dispatchEvent(new f.window.Event('change'));
  assert.equal(dialog.querySelector('.activity-option button').disabled,false);
  blocked=true; f.emit({characters:[{MemberNumber:55,Name:'Friend',Appearance:[]}]});
  assert.equal(dialog.querySelector('.activity-option button').disabled,true);
  assert.ok(dialog.querySelector('.activity-option button').title);
  mode.checked=false; mode.dispatchEvent(new f.window.Event('change'));
  assert.equal(dialog.querySelector('.activity-option'),null);
  assert.match(dialog.querySelector('[role=status]').textContent,/沒有可用動作/);
  blocked=false; f.emit({characters:[{MemberNumber:55,Name:'Friend'}]});
  mode.checked=true; mode.dispatchEvent(new f.window.Event('change'));
  assert.equal(dialog.querySelector('.activity-option button').disabled,false);
  await f.window.happyDOM.close();
});

test('merged all-actions menus prefer a usable sibling even when a blocked sibling appears first', async () => {
  const f=setup();
  f.client.activityOptions=()=>[
    {group:'ItemTorso2',groupLabel:'軀幹',name:'Pet',label:'撫摸',reason:'native.blocked'},
    {group:'ItemTorso',groupLabel:'軀幹',name:'Pet',label:'撫摸',reason:null},
  ];
  f.emit({phase:'in-room',room:{Name:'Room',Limit:10},characters:[{MemberNumber:55,Name:'Friend'}]});
  f.document.querySelector('.member-row').click(); f.document.querySelector('.interaction-open').click();
  const dialog=f.document.querySelector('.activity-dialog');
  const mode=dialog.querySelector('input'); mode.checked=true; mode.dispatchEvent(new f.window.Event('change'));
  dialog.querySelector('[data-body-group="ItemTorso2"]').dispatchEvent(new f.window.Event('click'));
  assert.equal(dialog.querySelectorAll('.activity-option').length,1);
  const action=dialog.querySelector('.activity-option button'); assert.equal(action.disabled,false); action.click();
  assert.deepEqual(f.calls.at(-1),{activity:'Pet',group:'ItemTorso',id:55});
  await f.window.happyDOM.close();
});

function messages(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `id-${index}`, nativeId: `native-${index}`, sender: 55, senderName: 'Friend', text: `message ${index}`, time: new Date(), type: 'Chat' }));
}

test('room sorting puts unavailable rooms last without mutating server results', () => {
  const room = (Name, MemberCount, extra = {}) => ({Name, MemberCount, MemberLimit:10, CanJoin:true, ...extra});
  const rooms = [room('A full',10,{Friends:[{}]}),room('Z friend',2,{Friends:[{}]}),room('B popular',8),room('A locked',1,{CanJoin:false}),room('A quiet',1)];
  const original = [...rooms];
  assert.deepEqual(sortRooms(rooms,'friends','en').map(r => r.Name), ['Z friend','A quiet','B popular','A full','A locked']);
  assert.deepEqual(sortRooms(rooms,'count','en').slice(0,3).map(r => r.Name), ['B popular','Z friend','A quiet']);
  assert.deepEqual(sortRooms(rooms,'name','en').slice(0,3).map(r => r.Name), ['A quiet','B popular','Z friend']);
  assert.deepEqual(rooms,original);
});

test('room pagination replaces pages, icons reflect access and mobile swipe ignores vertical movement', async () => {
  const f = setup();
  f.window.happyDOM.setWindowSize({width:390,height:844});
  const rooms = Array.from({length:19}, (_,i) => ({ Name:`Room ${i + 1}`, Description:'Room description', Creator:'Test', MemberCount:i === 17 ? 20 : 1, MemberLimit:20, CanJoin:i !== 18, Space:'X', Language:'EN', Access:i === 1 ? ['Whitelist'] : ['All'], MapType:i === 2 ? 'Always' : 'Never' }));
  f.emit({rooms});
  assert.equal(f.document.querySelectorAll('.room-card').length,8);
  assert.ok(f.document.querySelector('.room-list').textContent.includes('🗝️'));
  assert.ok(f.document.querySelector('.room-list').textContent.includes('🗺️'));
  assert.ok(!f.document.querySelector('.search-view').textContent.includes('按完整房名加入'));
  const list = f.document.querySelector('.room-list');
  const touch = (type,x,y) => {
    const point = {clientX:x,clientY:y,identifier:1};
    const event = new f.window.Event(type,{cancelable:true});
    Object.defineProperties(event,{touches:{value:type === 'touchstart' ? [point] : []},changedTouches:{value:[point]}});
    list.dispatchEvent(event); return event;
  };
  touch('touchstart',200,100); touch('touchend',210,280);
  assert.equal(f.document.querySelector('.room-pagination span').textContent,'1 / 3');
  touch('touchstart',280,100); assert.equal(touch('touchend',100,110).defaultPrevented,true);
  assert.equal(f.document.querySelector('.room-pagination span').textContent,'2 / 3');
  f.document.querySelector('[aria-label="下一頁"]').click();
  assert.equal(f.document.querySelectorAll('.room-card').length,3);
  assert.ok(f.document.querySelector('.room-list').textContent.includes('🔒'));
  assert.equal(f.document.querySelector('[aria-label="下一頁"]').disabled,false);
  f.document.querySelector('[aria-label="下一頁"]').click();
  assert.equal(f.document.querySelector('.room-pagination span').textContent,'1 / 3');
  f.document.querySelector('[aria-label="上一頁"]').click();
  assert.equal(f.document.querySelector('.room-pagination span').textContent,'3 / 3');
  const sort = f.document.querySelector('[aria-label="房間排序"]'); sort.value='count'; sort.dispatchEvent(new f.window.Event('change'));
  assert.equal(f.document.querySelector('.room-pagination span').textContent,'1 / 3');
  f.emit({rooms:[]});
  assert.equal(f.document.querySelector('.room-pagination span').textContent,'1 / 1');
  f.window.happyDOM.setWindowSize({width:1200,height:900});
  f.emit({rooms:Array.from({length:50}, (_,i) => ({...rooms[0],Name:`Room ${i}`}))});
  assert.equal(f.document.querySelectorAll('.room-card').length,24);
  assert.equal(f.document.querySelector('.room-pagination span').textContent,'1 / 3');
  assert.equal(f.document.querySelector('.room-filters').open,false);
  await f.window.happyDOM.close();
});

test('room list loads automatically and changing region clears the keyword and searches immediately', async () => {
  const f = setup();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(f.calls.filter(call => call.search).length, 1);
  assert.equal(f.calls.find(call => call.search).search.Query, '');
  const input = f.document.getElementById('RoomQuery');
  input.value = 'old keyword'; input.dispatchEvent(new f.window.Event('input'));
  const region = [...f.document.querySelectorAll('select')].find(select => select.getAttribute('aria-label') === t('m090'));
  region.value = ''; region.dispatchEvent(new f.window.Event('change'));
  assert.equal(f.calls.at(-1).search.Space, '');
  assert.equal(f.calls.at(-1).search.Query, '');
  assert.equal(input.value, '');
  await f.window.happyDOM.close();
});

test('private composer and navigation follow the compact layout, mixed channels retain direction', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, characters: [{ MemberNumber: 55, Name: 'Friend' }] });
  assert.deepEqual([...f.document.querySelectorAll('.app-nav button')].map(b => b.id), ['nav-rooms','nav-chat','nav-private','nav-friends','nav-settings']);
  assert.equal(f.document.getElementById('nav-rooms').textContent, '搜尋');
  f.document.getElementById('nav-private').click();
  f.document.querySelector('#contact-list .contact-card').click();
  const input = f.document.getElementById('BeepText');
  assert.equal(input.previousElementSibling.className, 'private-channel');
  const channels = [...input.previousElementSibling.querySelectorAll('button')];
  assert.deepEqual(channels.map(button => button.textContent), ['悄悄話', '私聊']);
  assert.equal(channels[1].getAttribute('aria-pressed'), 'true');
  input.value = 'draft'; input.dispatchEvent(new f.window.Event('input'));
  channels[0].click();
  assert.equal(channels[0].getAttribute('aria-pressed'), 'true');
  assert.equal(channels[1].getAttribute('aria-pressed'), 'false');
  assert.equal(f.document.getElementById('BeepText'), input);
  assert.equal(input.value, 'draft');
  assert.ok(!f.calls.some(call => typeof call === 'string' && call.startsWith('/w')));
  assert.ok(input.nextElementSibling.classList.contains('primary'));
  assert.equal(f.document.getElementById('BeepTarget'), null);
  assert.ok(f.document.querySelector('.private-conversation .private-heading > .ghost:last-child'));
  assert.equal(f.document.querySelector('.private-page .muted'), null);
  assert.equal(f.document.querySelector('.private-page .danger'), null);
  f.emit({ beeps: [{ id:'b', memberNumber:55, name:'Friend', incoming:true, text:'beep', time:new Date(1) }], whispers: [{ id:'w', sender:123, target:55, senderName:'Me', text:'whisper', type:'Whisper', time:new Date(2) }] });
  assert.ok(f.document.querySelector('#beep-log .type-beep.private-incoming'));
  assert.ok(f.document.querySelector('#beep-log .type-whisper.private-outgoing'));
  await f.window.happyDOM.close();
});

test('outgoing ItemMisc consent uses an in-page dialog and retries stale state only after another approval', async () => {
  const f=setup();
  f.window.confirm=()=>{throw Error('Browser confirm must not be used');};
  f.window.alert=()=>{throw Error('Browser alert must not be used');};
  let version=1, stale=false;
  const sent=[];
  f.client.cuddleInfo=()=>({token:String(version),text:`ItemMisc pair #${version}`});
  f.client.activityOptions=()=>[{group:'ItemTorso',groupLabel:'軀幹',name:'cuddle:test',label:'貼貼',reason:null}];
  f.client.sendActivity=(_id,_group,_name,_mode,token)=>{
    if(stale){stale=false;version=2;throw Error('Changed: please review again');}
    sent.push(token);
  };
  f.emit({phase:'in-room',room:{Name:'Room',Limit:10},characters:[{MemberNumber:55,Name:'Friend'}]});
  f.document.querySelector('.member-row').click(); f.document.querySelector('.interaction-open').click();
  const activity=f.document.querySelector('.activity-dialog');
  activity.querySelector('[data-body-group="ItemTorso"]').dispatchEvent(new f.window.Event('click'));
  const open=()=>activity.querySelector('.activity-option button').click();
  open();
  let dialog=f.document.querySelector('.cuddle-confirm');
  assert.match(dialog.textContent,/ItemMisc pair #1/); assert.equal(sent.length,0);
  dialog.querySelector('.dialog-close').click(); assert.equal(f.document.querySelector('.cuddle-confirm'),null);
  assert.equal(sent.length,0);
  open(); dialog=f.document.querySelector('.cuddle-confirm'); stale=true;
  dialog.querySelector('.primary').click();
  assert.match(dialog.querySelector('[role=alert]').textContent,/Changed/);
  assert.match(dialog.querySelector('.cuddle-details').textContent,/#2/);
  assert.equal(sent.length,0);
  dialog.querySelector('.primary').click();
  assert.deepEqual(sent,['2']); assert.equal(f.document.querySelector('.cuddle-confirm'),null);
  assert.match(activity.querySelector('[role=status]').textContent,/已/);
  open(); dialog=f.document.querySelector('.cuddle-confirm');
  dialog.dispatchEvent(new f.window.Event('cancel',{cancelable:true}));
  assert.equal(f.document.querySelector('.cuddle-confirm'),null); assert.equal(sent.length,1);
  await f.window.happyDOM.close();
});

test('incoming cuddle opens explicit consent without auto acceptance', async () => {
  const f = setup();
  f.emit({ cuddleRequest: { sender:55, name:'抱入怀中', expires:Date.now()+60000 } });
  assert.ok(f.document.querySelector('.cuddle-request'));
  assert.ok(!f.calls.some(c => c.cuddle));
  f.document.querySelector('.cuddle-request .primary').click();
  assert.deepEqual(f.calls.at(-1), { cuddle:true });
  assert.equal(f.document.querySelector('.cuddle-request'), null);
  await f.window.happyDOM.close();
});

test('3000 retained messages page in bounded batches and performance preferences persist without messages', async () => {
  const f = setup(undefined, JSON.stringify({ history: 3000, visible: 50 }));
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, messages: messages(3000) });
  assert.equal(f.document.querySelectorAll('#TextAreaChatLog .chat-message').length, 50);
  const older = () => [...f.document.querySelectorAll('.chat-room-top-menu button')].find(b => b.textContent === t('m162'));
  older().click();
  assert.equal(f.document.querySelector('#TextAreaChatLog').firstElementChild.dataset.messageId, 'id-2900');
  assert.equal(f.document.querySelectorAll('#TextAreaChatLog .chat-message').length, 50);
  const before = f.document.querySelector('#TextAreaChatLog').textContent;
  f.emit({ messages: [...f.state().messages.slice(1), { ...messages(1)[0], id: 'new', text: 'new arrival' }] });
  assert.equal(f.document.querySelector('#TextAreaChatLog').textContent, before);
  f.document.getElementById('new-messages').click();
  assert.match(f.document.querySelector('#TextAreaChatLog').textContent, /new arrival/);
  f.document.getElementById('nav-settings').click();
  const history = f.document.getElementById('HistoryLimit');
  history.value = '600'; history.dispatchEvent(new f.window.Event('change')); f.document.querySelector('[data-dialog-action=cancel]').click();
  assert.equal(history.value, '3000'); assert.equal(f.state().messages.length, 3000);
  history.value = '600'; history.dispatchEvent(new f.window.Event('change')); f.document.querySelector('[data-dialog-action=confirm]').click();
  assert.equal(f.state().messages.length, 600);
  assert.deepEqual(JSON.parse(f.window.localStorage.getItem('bc-lite-performance-v1')), { history: 600, visible: 50 });
  await f.window.happyDOM.close();
});

test('reply preview sits inside composer, jumps to retained history and clear preserves draft', async () => {
  const f = setup(); const history = messages(150).map((m, i) => ({ ...m, nativeId: `n-${i}` }));
  history.push({ ...messages(1)[0], id: 'response', nativeId: 'response-n', replyId: 'n-0', text: 'response' });
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, messages: history });
  f.document.querySelector('[data-message-id=response] .reply-jump').click();
  assert.ok(f.document.querySelector('[data-message-id=id-0].message-selected'));
  assert.equal(f.document.querySelectorAll('.message-selected').length, 1);
  f.document.querySelector('[data-message-id=id-0] .message-reply').click();
  const input = f.document.getElementById('InputChat');
  assert.equal(input.previousElementSibling.id, 'chat-room-reply-indicator');
  assert.match(input.previousElementSibling.textContent, /message 0/);
  input.value = 'draft'; input.dispatchEvent(new f.window.Event('input'));
  f.document.querySelector('.clear-messages').click(); f.document.querySelector('[data-dialog-action=confirm]').click();
  assert.equal(f.document.querySelectorAll('#TextAreaChatLog .chat-message').length, 0);
  assert.equal(input.value, 'draft');
  await f.window.happyDOM.close();
});

test('message selection clears when clicking outside and moves between rows', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, messages: messages(2) });
  const rows = f.document.querySelectorAll('#TextAreaChatLog .chat-message');
  rows[0].querySelector('.message-text').click();
  assert.ok(rows[0].classList.contains('message-selected'));
  // Incremental updates must use the same delegated selection path as existing rows.
  f.emit({ messages: [...f.state().messages, { ...messages(1)[0], id: 'new-selection' }] });
  f.document.querySelector('[data-message-id=new-selection]').click();
  assert.equal(f.document.querySelectorAll('.message-selected').length, 1);
  assert.equal(rows[0].classList.contains('message-selected'), false);
  rows[1].click();
  assert.equal(rows[0].classList.contains('message-selected'), false);
  assert.ok(rows[1].classList.contains('message-selected'));
  f.document.getElementById('InputChat').click();
  assert.equal(f.document.querySelector('.message-selected'), null);
  rows[0].click();
  f.document.body.click();
  assert.equal(f.document.querySelector('.message-selected'), null);
  await f.window.happyDOM.close();
});

test('only chat, emote and whisper with native IDs expose reply controls', async () => {
  const f = setup();
  const types = ['Chat', 'Emote', 'Whisper', 'Beep', 'Action', 'Activity', 'Local', 'Hidden', 'Unknown'];
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, messages: types.map(type => ({ ...messages(1)[0], id: type, type })) });
  for (const type of types) {
    assert.equal(Boolean(f.document.querySelector(`[data-message-id="${type}"] .message-reply`)), ['Chat', 'Emote', 'Whisper'].includes(type), type);
  }
  f.document.querySelector('[data-message-id="Emote"] .message-reply').click();
  assert.match(f.document.getElementById('chat-room-reply-indicator').textContent, /message 0/);
  await f.window.happyDOM.close();
});

test('presence has no duplicate author and private incoming messages reuse existing DOM', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, messages: [{ ...messages(1)[0], type: 'Action', presence: true, text: 'Friend left.' }] });
  assert.equal(f.document.querySelector('.message-presence .message-author'), null);
  assert.equal(f.document.querySelector('.message-presence .message-reply'), null);
  f.document.getElementById('nav-private').click();
  f.emit({ beeps: [{ id: 'b1', memberNumber: 55, name: 'Friend', text: 'one', incoming: true, time: new Date() }] });
  const first = f.document.querySelector('[data-message-id=b1]');
  f.emit({ beeps: [...f.state().beeps, { id: 'b2', memberNumber: 55, name: 'Friend', text: 'two', incoming: true, time: new Date() }] });
  assert.equal(f.document.querySelector('[data-message-id=b1]'), first);
  assert.ok(f.document.querySelector('.private-split .private-contacts'));
  await f.window.happyDOM.close();
});

test('BC-style rows keep metadata separate and clicking a name composes an unsent whisper', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, characters: [{ MemberNumber: 55, Name: 'Friend' }], messages: messages(1) });
  const row = f.document.querySelector('.chat-message.type-chat');
  assert.match(row.querySelector('.message-content').textContent, /Friend: message 0/);
  assert.match(row.querySelector('.message-meta').textContent, /#55/);
  assert.ok(row.querySelector(':scope > .message-reply'));
  const input = f.document.getElementById('InputChat'); input.value = 'draft'; input.dispatchEvent(new f.window.Event('input'));
  row.querySelector('.message-author').click();
  assert.equal(f.document.getElementById('InputChat').value, '/W 55 draft');
  assert.ok(!f.calls.some(value => typeof value === 'string' && value.startsWith('/W')));
  await f.window.happyDOM.close();
});

test('AFC room queries live in friends and matching room badges update without replacing search input', async () => {
  const f = setup();
  f.emit({ player: { ...f.state().player, OnlineSharedSettings: { AFC: { lovers: [{ memberNumber: 55, name: 'Lover' }] } } } });
  f.document.getElementById('nav-friends').click();
  [...f.document.querySelectorAll('.friend-filters button')].find(button => button.textContent === t('m020')).click();
  f.document.querySelector('.afc-query').click(); assert.deepEqual(f.calls.at(-1), { lover: 55 });
  f.document.getElementById('nav-rooms').click();
  f.emit({ rooms: [{ Name: 'Shared', Space: 'X', MemberCount: 1, MemberLimit: 10, CanJoin: true, Friends: [] }] });
  const search = f.document.querySelector('.search-controls input');
  f.emit({ loverRooms: { 55: { name: 'Shared', space: 'X' } } });
  assert.match(f.document.querySelector('.room-card .afc-tag').textContent, /擴展戀人 1/);
  assert.equal(f.document.querySelector('.search-controls input'), search);
  f.emit({ loverRooms: {} }); assert.equal(f.document.querySelector('.room-card .afc-tag'), null);
  await f.window.happyDOM.close();
});

test('private messages use the shared chronological message layout with composer below the log', async () => {
  const f = setup(); f.document.getElementById('nav-private').click();
  f.emit({ beeps: [{ id: 'first', memberNumber: 55, name: 'Friend', text: 'first', incoming: true, time: new Date(1000) }, { id: 'second', memberNumber: 55, name: 'Friend', text: 'second', incoming: false, time: new Date(2000) }] });
  assert.deepEqual([...f.document.querySelectorAll('#beep-log .message-text')].map(node => node.textContent), ['first', 'second']);
  assert.equal(f.document.querySelectorAll('#beep-log .type-beep').length, 2);
  assert.equal(f.document.querySelector('.beep-log').nextElementSibling.className, 'beep-compose');
  assert.ok(f.document.querySelector('.private-contacts'));
  await f.window.happyDOM.close();
});

test('foreground lifecycle checks do not replace an active chat draft', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, messages: [] });
  const input = f.document.getElementById('InputChat');
  input.value = 'draft'; input.dispatchEvent(new f.window.Event('input'));
  Object.defineProperty(f.document, 'visibilityState', { value: 'visible', configurable: true });
  f.document.dispatchEvent(new f.window.Event('visibilitychange'));
  assert.ok(f.calls.includes('resume'));
  assert.equal(f.document.getElementById('InputChat'), input);
  assert.equal(input.value, 'draft');
  await f.window.happyDOM.close();
});

test('friends no longer owns composer; private tab has room, friends and recent lists', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, characters: [{ MemberNumber: 123, Name: 'Tester' }, { MemberNumber: 66, Name: 'RoomMember' }], beeps: [{ id: 'b', memberNumber: 77, name: 'Recent', text: 'hello', incoming: true, time: new Date() }] });
  f.document.getElementById('nav-friends').click();
  assert.equal(f.document.getElementById('BeepText'), null);
  f.document.getElementById('nav-private').click();
  assert.ok(f.document.getElementById('BeepText'));
  assert.match(f.document.getElementById('contact-list').textContent, /RoomMember/);
  [...f.document.querySelectorAll('.friend-filters button')].find(n => n.textContent === '最近聊天').click();
  assert.match(f.document.getElementById('contact-list').textContent, /Recent/);
  assert.equal(f.document.querySelectorAll('.app-nav button').length, 5);
  await f.window.happyDOM.close();
});

test('header contains safety in requested order and outside clicks dismiss members without clearing draft', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, characters: [{ MemberNumber: 123, Name: 'Tester' }], messages: [] });
  const header = f.document.querySelector('.app-header');
  assert.equal(header.children[0].className, 'brand');
  assert.equal(header.children[1].className, 'header-account');
  assert.equal(header.children[2].id, 'room-safeword');
  assert.equal(header.children[3].querySelector('select').id, 'InterfaceLocale');
  assert.equal(f.document.querySelector('.chat-room-top-menu #room-safeword'), null);
  f.document.querySelector('.member-panel > .mobile-members').click();
  assert.ok(f.document.querySelector('.members-open'));
  const input = f.document.getElementById('InputChat'); input.value = 'draft'; input.dispatchEvent(new f.window.Event('input')); input.click();
  assert.equal(f.document.querySelector('.members-open'), null);
  assert.equal(f.document.getElementById('InputChat'), input);
  assert.equal(input.value, 'draft');
  await f.window.happyDOM.close();
});

test('native reply selection stays in private channel; private reply previews never leak to public messages', async () => {
  const f = setup();
  const privateMessage = { id: 'p', nativeId: 'native-p', type: 'Whisper', sender: 55, target: 123, senderName: 'Friend', text: 'SECRET', time: new Date() };
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, characters: [{ MemberNumber: 55, Name: 'Friend' }], messages: [privateMessage, { id: 'c', type: 'Chat', sender: 66, senderName: 'Other', replyId: 'native-p', text: 'Public', time: new Date() }] });
  const publicRow = f.document.querySelector('[data-message-id=c]');
  assert.doesNotMatch(publicRow.querySelector('.reply-preview').textContent, /SECRET/);
  f.document.querySelector('[data-message-id=p] .message-reply').click();
  assert.equal(f.document.getElementById('nav-private').getAttribute('aria-current'), 'page');
  assert.equal(f.document.getElementById('BeepTarget'), null);
  assert.match(f.document.querySelector('.private-conversation .private-heading').textContent, /55/);
  assert.ok(f.document.querySelector('.beep-compose .reply-preview'));
  await f.window.happyDOM.close();
});

test('profiles show none instead of unprovided, AFC lovers, and bounded text interactions', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, characters: [{ MemberNumber: 55, Name: 'Friend', OnlineSharedSettings: { AFC: { lovers: [{ memberNumber: 77, name: 'Extended' }] } } }], messages: [] });
  f.document.querySelector('.member-row').click();
  const dialog = f.document.querySelector('.profile-dialog');
  assert.match(dialog.textContent, /Extended.*77/);
  assert.doesNotMatch(dialog.textContent, /未提供/);
  assert.equal(dialog.querySelector('[data-lover-room]'), null);
  assert.equal(dialog.querySelector('.dialog-close').textContent, '×');
  dialog.querySelector('.toolbar .interaction-open').click();
  assert.equal(dialog.isConnected, false);
  const activity = f.document.querySelector('.activity-dialog');
  assert.ok(activity.querySelector('svg .body-zone'));
  assert.equal(activity.querySelector('.body-parts'), null);
  assert.equal(activity.querySelector('.body-outline'), null);
  activity.querySelector('[data-body-group="ItemHead"]').dispatchEvent(new f.window.Event('click'));
  [...activity.querySelectorAll('button')].find(n => n.textContent === '撫摸').click();
  assert.deepEqual(f.calls.at(-1), { activity: 'Pet', group: 'ItemHead', id: 55 });
  activity.querySelector('.dialog-close').click();
  assert.equal(activity.isConnected, false);
  await f.window.happyDOM.close();
});

test('stability controls expose local audio, handle wake lock denial, and show local diagnostics', async () => {
  const f = setup();
  f.document.getElementById('nav-settings').click();
  assert.equal(f.document.querySelector('input[type=file]').accept, 'audio/*');
  const label = [...f.document.querySelectorAll('label')].find(n => n.textContent.includes('保持螢幕'));
  Object.defineProperty(f.document, 'visibilityState', { value: 'visible', configurable: true });
  Object.defineProperty(f.window.navigator, 'wakeLock', { value: { request: async () => { throw new Error('denied'); } } });
  label.querySelector('input').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(f.document.body.textContent, /系統拒絕/);
  [...f.document.querySelectorAll('button')].find(n => n.textContent === '查看本機連線紀錄').click();
  assert.equal(f.document.querySelector('textarea[readonly]').value, 'test-event');
  assert.equal(f.window.localStorage.length, 0);
  await f.window.happyDOM.close();
});

test('local audio stays mounted across navigation and is released on logout', async () => {
  const f = setup();
  let revoked = '';
  f.window.URL.createObjectURL = () => 'blob:https://lite.example/local-audio';
  f.window.URL.revokeObjectURL = value => { revoked = value; };
  f.document.getElementById('nav-settings').click();
  const input = f.document.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { value: [new f.window.File(['audio'], 'local.mp3', { type: 'audio/mpeg' })] });
  input.dispatchEvent(new f.window.Event('change'));
  const audio = f.document.querySelector('audio');
  assert.ok(audio.src.startsWith('blob:'));
  assert.equal(audio.loop, true);
  let played = 0;
  audio.play = async () => { played++; };
  [...f.document.querySelectorAll('button')].find(n => n.textContent === '播放背景音訊').click();
  assert.equal(played, 1);
  f.document.getElementById('nav-rooms').click();
  assert.equal(f.document.querySelector('audio'), audio);
  f.emit({ player: null, phase: 'idle' });
  assert.equal(f.document.querySelector('audio'), null);
  assert.ok(revoked.startsWith('blob:'));
  assert.equal(f.window.localStorage.length, 0);
  await f.window.happyDOM.close();
});

test('room safeword requires choosing an operation and accepting explicit confirmation', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, messages: [] });
  f.document.getElementById('room-safeword').click();
  assert.ok(f.document.querySelector('.safeword-dialog').open);
  f.window.confirm = () => assert.fail('safeword must not use browser confirmation');
  f.window.alert = () => assert.fail('safeword must not use browser alert');
  f.document.querySelector('[data-safeword=revert]').click();
  assert.equal(f.calls.some(call => call?.safeword), false);
  assert.ok(f.document.querySelector('[data-safeword-confirm=revert]'));
  f.document.querySelector('[data-safeword-back]').click();
  f.document.querySelector('[data-safeword=release]').click();
  assert.equal(f.calls.some(call => call?.safeword), false);
  f.document.querySelector('[data-safeword-confirm=release]').click();
  assert.deepEqual(f.calls.at(-1), { safeword: 'release' });
  assert.equal(f.document.querySelector('.safeword-dialog'), null);
  await f.window.happyDOM.close();
});

test('safeword failures stay inside the Lite dialog and cancel never sends an operation', async () => {
  const f=setup();
  f.window.confirm=()=>assert.fail('browser confirm'); f.window.alert=()=>assert.fail('browser alert');
  f.emit({phase:'in-room',room:{Name:'Test'}});
  f.client.activateSafeword=()=>{throw Error('test failed upload');};
  f.document.getElementById('room-safeword').click();
  f.document.querySelector('[data-safeword=revert]').click();
  f.document.querySelector('[data-safeword-confirm=revert]').click();
  assert.match(f.document.querySelector('.safeword-dialog [role=alert]').textContent,/test failed upload/);
  assert.equal(f.document.querySelector('[data-safeword-confirm=revert]').disabled,false);
  f.document.querySelector('.safeword-dialog > button').click();
  assert.equal(f.document.querySelector('.safeword-dialog'),null);
  assert.equal(f.calls.some(call=>call?.safeword),false);
  await f.window.happyDOM.close();
});

test('room changes use Lite confirmation, cancel stays put, and stale confirmations cannot move rooms', async () => {
  const f=setup(), moves=[];
  f.window.confirm=()=>assert.fail('browser confirm'); f.window.alert=()=>assert.fail('browser alert');
  f.client.leave=()=>moves.push('leave'); f.client.join=name=>moves.push(name);
  f.emit({phase:'in-room',room:{Name:'Current'},rooms:[{Name:'Destination',MemberCount:1,MemberLimit:10,CanJoin:true,Friends:[],Language:'EN'}]});
  f.document.getElementById('nav-rooms').click();
  const join=()=>f.document.querySelector('.room-card button').click();
  join(); assert.deepEqual(moves,[]);
  assert.match(f.document.querySelector('.lite-confirm').textContent,/Current.*Destination/);
  f.document.querySelector('[data-dialog-action=cancel]').click(); assert.deepEqual(moves,[]);
  join(); f.document.querySelector('[data-dialog-action=confirm]').click(); assert.deepEqual(moves,['leave','Destination']);
  moves.length=0; join(); const confirm=f.document.querySelector('[data-dialog-action=confirm]');
  f.emit({room:{Name:'Different'}}); confirm.click(); assert.deepEqual(moves,[]);
  await f.window.happyDOM.close();
});

test('archive deletion and retention shortening wait for Lite confirmation', async () => {
  const f=setup(); f.window.confirm=()=>assert.fail('browser confirm');
  f.document.getElementById('nav-settings').click();
  const retention=f.document.getElementById('History-roomDays');
  retention.value='1'; retention.dispatchEvent(new f.window.Event('change'));
  assert.equal(retention.value,'7');
  f.document.querySelector('[data-dialog-action=cancel]').click(); assert.equal(retention.value,'7');
  retention.value='1'; retention.dispatchEvent(new f.window.Event('change'));
  f.document.querySelector('[data-dialog-action=confirm]').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(JSON.parse(f.window.localStorage.getItem('bc-lite-history-policy-v1')).roomDays,1);
  f.document.querySelector('.history-settings .danger').click(); assert.ok(f.document.querySelector('.lite-confirm'));
  f.document.querySelector('[data-dialog-action=cancel]').click();
  await f.window.happyDOM.close();
});

test('chat, actions and whispers link URLs while keeping unsafe HTML inert and drafts intact', async () => {
  const f = setup();
  const rows = ['Chat', 'Action', 'Whisper', 'Emote'].map((type, i) => ({ id: `link-${i}`, type, senderName: 'Friend', text: 'https://example.org/image.png <img src=x>', time: new Date() }));
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, messages: rows });
  const log = f.document.getElementById('TextAreaChatLog');
  assert.equal(log.querySelectorAll('a.chat-link').length, 4);
  assert.equal(log.querySelectorAll('img.chat-media').length, 0);
  log.querySelector('.chat-media-slot button').click();
  assert.equal(log.querySelectorAll('img.chat-media').length, 4);
  assert.equal(log.querySelectorAll('img[src=x]').length, 0);
  const input = f.document.getElementById('InputChat');
  input.value = 'draft'; input.dispatchEvent(new f.window.Event('input'));
  f.emit({ messages: [...rows, { ...rows[0], id: 'new-link' }] });
  assert.equal(f.document.getElementById('InputChat'), input);
  assert.equal(input.value, 'draft');
  await f.window.happyDOM.close();
});

test('language selection persists locally, translates navigation and preserves chat draft', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Long room name', Limit: 10 }, messages: messages(1) });
  const input = f.document.getElementById('InputChat');
  input.value = '中文 draft'; input.dispatchEvent(new f.window.Event('input'));
  f.document.getElementById('nav-settings').click();
  const select = f.document.getElementById('InterfaceLocale');
  assert.equal(f.document.querySelectorAll('#InterfaceLocale').length, 1);
  assert.ok(select.closest('.app-header'));
  assert.equal(select.closest('.header-locale').nextElementSibling.textContent, '登出');
  select.value = 'en'; select.dispatchEvent(new f.window.Event('change'));
  assert.equal(f.document.documentElement.lang, 'en');
  assert.equal(JSON.parse(f.window.localStorage.getItem('bc-lite-display-v1')).locale, 'en');
  assert.equal(f.document.getElementById('nav-chat').textContent, 'Room');
  f.document.getElementById('nav-chat').click();
  assert.equal(f.document.getElementById('InputChat').value, '中文 draft');
  assert.equal(f.document.querySelector('.room-title').textContent, 'Long room name');
  assert.ok(f.document.body.classList.contains('chat-active'));
  await f.window.happyDOM.close();
});

test('incoming chat preserves textarea identity, draft, focus, and a bounded log', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, characters: [{ MemberNumber: 123, Name: 'Tester' }], messages: messages(150) });
  const input = f.document.getElementById('InputChat');
  input.value = '未送出的草稿'; input.dispatchEvent(new f.window.Event('input')); input.focus();
  f.emit({ messages: messages(151) });
  assert.equal(f.document.getElementById('InputChat'), input);
  assert.equal(f.document.activeElement, input);
  assert.equal(input.value, '未送出的草稿');
  assert.equal(f.document.getElementById('TextAreaChatLog').children.length, 100);
  assert.match(f.document.getElementById('TextAreaChatLog').textContent, /message 150/);
  await f.window.happyDOM.close();
});

test('reading history freezes visible rows and offers explicit jump to latest', async () => {
  const f = setup();
  // A leading-zero timestamp after "message 10" used to falsely match /message 100/.
  const rows = messages(101).map(message => ({ ...message, time: new Date(2026, 0, 1, 1, 16) }));
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, messages: rows.slice(0, 100) });
  const log = f.document.getElementById('TextAreaChatLog');
  const originalRows = Array.from(log.children);
  Object.defineProperty(log, 'scrollHeight', { value: 1000, configurable: true });
  Object.defineProperty(log, 'clientHeight', { value: 200, configurable: true });
  log.scrollTop = 100;
  f.emit({ messages: rows });
  assert.equal(log.querySelector('[data-message-id="id-100"]'), null);
  assert.equal(log.children.length, originalRows.length);
  originalRows.forEach((row, index) => assert.equal(log.children[index], row));
  assert.equal(log.scrollTop, 100);
  assert.equal(f.document.getElementById('new-messages').hidden, false);
  f.document.getElementById('new-messages').click();
  assert.equal(log.querySelector('[data-message-id="id-100"] .message-text')?.textContent, 'message 100');
  assert.equal(log.querySelector('[data-message-id="id-0"]'), null);
  assert.equal(log.children.length, 100);
  await f.window.happyDOM.close();
});

test('friend updates and BEEP do not replace composer; untrusted content stays text', async () => {
  const f = setup();
  f.document.getElementById('nav-private').click();
  assert.deepEqual(f.calls, [{ historyLimit: 3000 }, 'friends']);
  const input = f.document.getElementById('BeepText');
  input.value = 'BEEP 草稿'; input.dispatchEvent(new f.window.Event('input'));
  f.emit({ friends: [{ MemberNumber: 55, MemberName: '<img src=x onerror=alert(1)>', Type: 'Friend' }], friendsStatus: '查詢完成', beeps: [{ id: 'beep', memberNumber: 55, name: 'Friend', text: '<script>bad()</script>', incoming: true, time: new Date() }] });
  assert.equal(f.document.getElementById('BeepText'), input);
  assert.equal(input.value, 'BEEP 草稿');
  assert.equal(f.document.querySelectorAll('img,script').length, 0);
  assert.match(f.document.getElementById('beep-log').textContent, /<script>bad\(\)<\/script>/);
  await f.window.happyDOM.close();
});

test('IME composition defers structural updates until final input event', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, messages: [] });
  const input = f.document.getElementById('InputChat');
  input.dispatchEvent(new f.window.Event('compositionstart', { bubbles: true }));
  f.emit({ characters: [{ MemberNumber: 55, Name: 'New member' }] });
  assert.equal(f.document.getElementById('InputChat'), input);
  input.dispatchEvent(new f.window.Event('compositionend', { bubbles: true }));
  input.value = '中文完成'; input.dispatchEvent(new f.window.Event('input'));
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(f.document.getElementById('InputChat').value, '中文完成');
  await f.window.happyDOM.close();
});

test('display preferences persist alone and background starts disabled', async () => {
  const f = setup();
  assert.equal(f.document.body.classList.contains('scenic'), false);
  f.document.getElementById('nav-settings').click();
  const checkbox = f.document.querySelector('.settings-card input[type=checkbox]');
  checkbox.click();
  assert.equal(f.document.body.classList.contains('scenic'), true);
  assert.deepEqual(JSON.parse(f.window.localStorage.getItem('bc-lite-display-v1')), { background: true, largeText: false, timestamps: true, locale: 'zh', theme: 'default' });
  assert.equal(f.window.localStorage.length, 1);
  await f.window.happyDOM.close();
});

test('remembering an account is opt-in, stores only the name, and unchecking removes it', async () => {
  const f = setup();
  f.emit({ phase: 'idle', player: null });
  const account = f.document.getElementById('AccountName');
  const password = f.document.getElementById('Password');
  const remember = f.document.querySelector('.login-card input[type=checkbox]');
  assert.equal(remember.checked, false);
  account.value = ' test-account '; account.dispatchEvent(new f.window.Event('input'));
  password.value = 'test-secret-only'; password.dispatchEvent(new f.window.Event('input'));
  assert.equal(f.window.localStorage.length, 0);
  remember.click();
  assert.equal(f.window.localStorage.getItem('bc-lite-account-v1'), 'test-account');
  f.document.querySelector('.login-card').dispatchEvent(new f.window.Event('submit', { cancelable: true }));
  assert.equal(f.window.localStorage.length, 1);
  assert.equal(f.window.localStorage.getItem('bc-lite-account-v1').includes('test-secret-only'), false);
  assert.equal(password.value, '');
  remember.click();
  assert.equal(f.window.localStorage.getItem('bc-lite-account-v1'), null);
  await f.window.happyDOM.close();
});

test('a remembered name prefills login without password and can be erased in settings', async () => {
  const f = setup('saved-name');
  f.emit({ phase: 'idle', player: null });
  assert.equal(f.document.getElementById('AccountName').value, 'saved-name');
  assert.equal(f.document.getElementById('Password').value, '');
  assert.equal(f.document.querySelector('.login-card input[type=checkbox]').checked, true);
  f.emit({ phase: 'ready', player: { Name: 'Tester', MemberNumber: 123 } });
  f.document.getElementById('nav-settings').click();
  [...f.document.querySelectorAll('button')].find(button => button.textContent === '刪除本機保存的帳號').click();
  assert.equal(f.window.localStorage.getItem('bc-lite-account-v1'), null);
  await f.window.happyDOM.close();
});

test('room heading switches a single form, header owns identity and logout', async () => {
  const f = setup();
  assert.match(f.document.querySelector('.app-header').textContent, /Tester.*123.*安全詞.*登出/s);
  assert.equal(f.document.querySelectorAll('.form-notice, .search-form').length, 0);
  assert.ok(f.document.getElementById('RoomQuery'));
  assert.equal(f.document.getElementById('NewRoomName'), null);
  [...f.document.querySelectorAll('.view-heading button')].find(button => button.textContent === '建立房間').click();
  assert.equal(f.document.querySelectorAll('.room-controls').length, 1);
  assert.equal(f.document.getElementById('RoomQuery'), null);
  for (const id of ['NewRoomName', 'CreateBackground', 'CreateAdmin', 'CreateWhitelist', 'CreateBan', 'CreateImageURL', 'CreateMusicURL', 'CreateMapJSON']) assert.ok(f.document.getElementById(id));
  await f.window.happyDOM.close();
});

test('room search navigation remains usable in-room without consuming chat draft', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Still here', Limit: 10 }, messages: messages(5) });
  const draft = f.document.getElementById('InputChat'); draft.value = 'keep'; draft.dispatchEvent(new f.window.Event('input'));
  assert.equal(f.document.getElementById('nav-rooms').disabled, false);
  f.document.getElementById('nav-rooms').click();
  assert.ok(f.document.getElementById('RoomQuery'));
  assert.equal(f.state().room.Name, 'Still here');
  f.document.getElementById('nav-chat').click();
  assert.equal(f.document.getElementById('InputChat').value, 'keep');
  assert.equal(f.document.querySelector('#chat-room-bot button').textContent, '送出');
  await f.window.happyDOM.close();
});

test('friend tabs default online, use room presence and successful query, with clickable cards', async () => {
  const f = setup();
  f.emit({ player: { ...f.state().player, FriendList: [55, 66, 77] }, characters: [{ MemberNumber: 66, Name: 'Same room' }], friendsStatus: '查詢完成', friends: [{ MemberNumber: 55, MemberName: 'Remote', Type: 'Friend', ChatRoomName: 'Elsewhere' }] });
  f.document.getElementById('nav-friends').click();
  const card = f.document.querySelector('.contact-card');
  assert.equal(card.getAttribute('role'), 'button');
  assert.deepEqual([...card.querySelectorAll('button')].map(button => button.textContent), ['前往房間', '移除']);
  const clickFilter = name => [...f.document.querySelectorAll('.friend-filters button')].find(button => button.textContent === name).click();
  clickFilter('在線'); assert.equal(f.document.querySelectorAll('.contact-card').length, 2);
  clickFilter('不在線'); assert.equal(f.document.querySelectorAll('.contact-card').length, 1);
  assert.match(f.document.querySelector('.contact-card').textContent, /77/);
  await f.window.happyDOM.close();
});

test('profile displays relations and defers biography until expanded', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, characters: [{ MemberNumber: 55, Name: 'Friend', Ownership: { Name: 'Owner', MemberNumber: 5 }, Lovership: [{ Name: 'Lover', MemberNumber: 6 }], Description: 'Long biography' }] });
  f.document.querySelector('.member-row').click();
  const dialog = f.document.querySelector('.profile-dialog');
  assert.match(dialog.textContent, /Owner.*5/); assert.match(dialog.textContent, /Lover.*6/);
  assert.doesNotMatch(dialog.textContent, /Long biography/);
  const details = dialog.querySelector('details'); details.open = true; details.dispatchEvent(new f.window.Event('toggle'));
  assert.match(dialog.textContent, /Long biography/);
  await f.window.happyDOM.close();
});

test('BIO decodes BC UTF16 marker and leaves old plain profiles untouched', () => {
  const text = '中文 BIO\n<script>not executable</script>';
  assert.equal(decodeBiography('\u256c' + LZString.compressToUTF16(text)), text);
  assert.equal(decodeBiography(text), text);
  assert.equal(decodeBiography('x'.repeat(12000)).length, 10000);
  assert.equal(typeof decodeBiography('\u256cgarbage'), 'string');
});

test('friend whisper opens private conversation and preserves drafts per recipient', async () => {
  const f = setup();
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, player: { ...f.state().player, FriendList: [55,66] }, characters: [{ Name: 'First', MemberNumber: 55 }, { Name: 'Second', MemberNumber: 66 }] });
  f.document.getElementById('nav-friends').click();
  const selectWhisper = index => { f.document.querySelectorAll('.contact-card')[index].click(); f.document.querySelector('[data-channel="whisper"]').click(); };
  selectWhisper(0);
  let input = f.document.getElementById('BeepText'); input.value = 'First draft'; input.dispatchEvent(new f.window.Event('input'));
  selectWhisper(1);
  assert.equal(f.document.getElementById('BeepText').value, '');
  selectWhisper(0);
  assert.equal(f.document.getElementById('BeepText').value, 'First draft');
  f.document.querySelector('.beep-compose').dispatchEvent(new f.window.Event('submit', {cancelable:true}));
  assert.ok(f.calls.includes('/w 55 First draft'));
  await f.window.happyDOM.close();
});


test('unread remains per peer until explicitly read and duplicate snapshots do not recount', async () => {
  const f=setup(), now=new Date();
  f.emit({characters:[{MemberNumber:55,Name:'A'},{MemberNumber:66,Name:'B'}]});
  f.emit({beeps:[{id:'u1',memberNumber:55,name:'A',text:'first',incoming:true,time:now},{id:'u2',memberNumber:66,name:'B',text:'other',incoming:true,time:now}]});
  assert.match(f.document.querySelector('#nav-private').textContent,/2/);
  f.emit({beeps:[...f.state().beeps]});
  f.document.getElementById('nav-private').click();
  f.document.querySelector('[data-member="55"]').click();
  assert.match(f.document.getElementById('private-unread').textContent,/第一則未讀（1 則）/);
  f.document.getElementById('private-unread').firstChild.click();
  assert.ok(f.document.querySelector('[data-message-id="u1"]'));
  f.document.getElementById('private-unread').lastChild.click();
  assert.match(f.document.querySelector('#nav-private').textContent,/1/);
  f.document.querySelector('[data-member="66"]').click();
  assert.match(f.document.getElementById('private-unread').textContent,/第一則未讀（1 則）/);
  await f.window.happyDOM.close();
});

test('disconnect preserves room DOM and draft while disabling sends until the actual room returns', async () => {
  const f=setup();
  f.emit({phase:'in-room',room:{Name:'Here'},messages:[{id:'retained',sender:55,senderName:'A',text:'retained',type:'Chat',time:new Date()}]});
  const input=f.document.getElementById('InputChat'),log=f.document.getElementById('TextAreaChatLog');
  input.value='unsent draft';input.dispatchEvent(new f.window.Event('input'));
  f.emit({phase:'reconnecting',room:null,characters:[]});
  assert.equal(f.document.getElementById('InputChat'),input);
  assert.equal(f.document.getElementById('TextAreaChatLog'),log);
  assert.equal(input.value,'unsent draft');
  assert.equal(f.document.querySelector('#chat-room-bot button[type=submit]').disabled,true);
  input.closest('form').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.ok(!f.calls.includes('unsent draft'));
  f.emit({phase:'waiting-server'});f.emit({phase:'ready'});
  assert.equal(f.document.getElementById('InputChat'),input);
  f.emit({phase:'in-room',room:{Name:'Here'}});
  assert.equal(f.document.getElementById('InputChat'),input);
  assert.equal(f.document.querySelector('#chat-room-bot button[type=submit]').disabled,false);
  assert.ok(!f.calls.includes('unsent draft'));
  await f.window.happyDOM.close();
});


test('local search renders literal text and opens isolated context', async context => {
  const f=setup(undefined,undefined,new IDBFactory());context.after(()=>f.window.happyDOM.close());
  f.emit({phase:'in-room',room:{Name:'Archive'},messages:[{id:'find-me',sender:55,senderName:'Friend',text:'needle <img src=x>',type:'Chat',time:new Date()}]});
  [...f.document.querySelectorAll('.chat-room-top-menu button')].find(b=>b.textContent===t('searchHistory.title')).click();
  f.document.getElementById('HistoryKeyword').value='needle';
  f.document.querySelector('.history-search-form').dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  const waitFor=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('search did not settle');};
  await waitFor(()=>f.document.querySelector('.history-search-result'));
  const row=f.document.querySelector('.history-search-result');assert.match(row.textContent,/<img src=x>/);assert.equal(row.querySelector('img'),null);
  row.click();await waitFor(()=>f.document.querySelector('.history-search-context .search-hit'));
  assert.equal(f.document.getElementById('InputChat').value,'');assert.ok(!f.calls.some(c=>typeof c==='string'&&c.includes('needle')));
  f.emit({player:{...f.state().player,MemberNumber:999}});assert.equal(f.document.querySelector('.history-search-dialog'),null);
});


test('Russian selection preserves player text and draft and exposes repository footer', async context=>{
 const f=setup();context.after(()=>f.window.happyDOM.close());
 f.emit({phase:'in-room',room:{Name:'房間 Original'},messages:[{id:'ru-test',sender:55,senderName:'Alice',type:'Chat',text:'Player text 中文',time:new Date()}]});
 const input=f.document.getElementById('InputChat');input.value='草稿 draft';input.dispatchEvent(new f.window.Event('input'));
 const select=f.document.getElementById('InterfaceLocale');select.value='ru';select.dispatchEvent(new f.window.Event('change'));
 assert.equal(f.document.documentElement.lang,'ru');assert.equal(JSON.parse(f.window.localStorage.getItem('bc-lite-display-v1')).locale,'ru');
 assert.equal(f.document.getElementById('nav-settings').textContent,'Настройки');
 assert.equal(f.document.getElementById('InputChat').value,'草稿 draft');assert.match(f.document.getElementById('TextAreaChatLog').textContent,/Player text 中文/);
 assert.equal(f.document.querySelector('.app-footer a').href,'https://github.com/awdrrawd/BondageClub-Lite/tree/Mater');
 f.document.getElementById('nav-private').click();assert.equal(f.document.querySelector('.private-page > h1'),null);
 f.document.getElementById('nav-friends').click();assert.equal(f.document.querySelector('.friends-view > h1'),null);
});

test('disposing the UI releases subscriptions and global lifecycle handlers',async()=>{
 const f=setup();
 await f.instance.dispose(); await f.instance.dispose();
 const count=f.calls.length;
 f.window.dispatchEvent(new f.window.Event('online'));
 f.window.dispatchEvent(new f.window.Event('pageshow'));
 f.emit({status:'after disposal'});
 assert.equal(f.calls.length,count);
 assert.equal(f.document.getElementById('app').childElementCount,0);
});

test('UI disposal closes its IndexedDB connection after pending writes',async()=>{
 const factory=new IDBFactory(),f=setup(undefined,undefined,factory);
 await f.instance.dispose();
 await new Promise((resolve,reject)=>{
  const request=factory.deleteDatabase('bc-lite-history');
  request.onsuccess=resolve; request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(new Error('Disposed UI retained its database connection'));
 });
});

test('leash indicator updates without rebuilding the active chat',async()=>{
 const f=setup();f.emit({phase:'in-room',room:{Name:'Room'},characters:[],messages:[]});
 f.document.querySelector('#nav-chat').click();
 const log=f.document.getElementById('TextAreaChatLog');
 f.emit({leashHolder:55});
 assert.match(f.document.getElementById('summon-notice').textContent,/#55/);
 assert.equal(f.document.getElementById('TextAreaChatLog'),log);
 f.emit({leashHolder:null});assert.equal(f.document.getElementById('summon-notice').hidden,true);
});

test('incoming media links render for both self echoes and other players',async()=>{
 const f=setup();
 const url='https://www.bilibili.com/video/BV149bG6dE5r';
 f.emit({phase:'in-room',room:{Name:'Room'},messages:[]});
 const incoming=messages(2).map((message,index)=>({...message,sender:index===0?123:55,text:url}));
 f.emit({messages:incoming.slice(0,1)});
 f.emit({messages:incoming});
 for(const row of f.document.querySelectorAll('#TextAreaChatLog [data-message-id]')){
  assert.equal(row.querySelector('a.chat-link')?.textContent,url);
  assert.ok(row.querySelector('.chat-media-slot'));
 }
 assert.equal(f.document.querySelectorAll('#TextAreaChatLog .chat-media-slot').length,2);
 await f.window.happyDOM.close();
});

test('native reply sends only the draft and ID; missing IDs never add a text quote',async()=>{
 const f=setup();f.emit({phase:'in-room',room:{Name:'Room'},messages:[{...messages(1)[0],text:'Original quote',nativeId:'bc-native-id'},{...messages(1)[0],id:'legacy',nativeId:undefined}]});
 assert.equal(f.document.querySelector('[data-message-id=legacy] .message-reply'),null);
 f.document.querySelector('[data-message-id=id-0] .message-reply').click();
 const input=f.document.getElementById('InputChat');input.value='https://www.bilibili.com/video/BV1xx411c7mD';input.dispatchEvent(new f.window.Event('input'));
 input.closest('form').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));
 assert.deepEqual(f.replies.at(-1),{text:'https://www.bilibili.com/video/BV1xx411c7mD',replyId:'bc-native-id'});
 assert.equal(f.document.querySelector('#chat-room-reply-indicator .reply-preview'),null);
});


test('delivery notices show only pending or unconfirmed messages without rebuilding chat',async()=>{
 const f=setup();
 f.emit({phase:'in-room',room:{Name:'Room'},messages:[]});
 const input=f.document.getElementById('InputChat'),log=f.document.getElementById('TextAreaChatLog');
 const item={id:'outgoing',text:'https://www.bilibili.com/video/BV1Hy4k64Erk',status:'pending'};
 f.emit({deliveries:[item]});
 assert.equal(f.document.getElementById('delivery-status').hidden,false);
 assert.ok(f.document.querySelector('.delivery-pending'));
 f.emit({deliveries:[{...item,status:'unconfirmed'}]});
 assert.equal(f.document.querySelector('.delivery-unconfirmed'),null);
 f.emit({deliveries:[{...item,status:'confirmed'}]});
 assert.equal(f.document.getElementById('delivery-status').hidden,true);
 assert.equal(f.document.getElementById('delivery-status').textContent,'');
 assert.equal(f.document.getElementById('InputChat'),input);
 assert.equal(f.document.getElementById('TextAreaChatLog'),log);
 await f.window.happyDOM.close();
});


test('contact layout toggles preserve the mounted list and use responsive defaults',async()=>{
 const f=setup();f.document.getElementById('nav-friends').click();
 const list=f.document.getElementById('contact-list');
 assert.equal(list.dataset.layout,'auto');
 const buttons=f.document.querySelector('.contact-layout-buttons');
 assert.equal(buttons.querySelectorAll('svg').length,1);
 buttons.querySelector('button').click();
 assert.equal(list.dataset.layout,'rows');
 assert.equal(buttons.querySelector('button').dataset.layout,'rows');
 buttons.querySelector('button').click();
 assert.equal(list.dataset.layout,'grid');
 assert.equal(f.document.getElementById('contact-list'),list);
 await f.window.happyDOM.close();
});


test('room info opens known friend relationships without joining',async()=>{
 const f=setup();
 f.emit({friends:[{MemberNumber:55,MemberName:'Friend',Type:'Lover'}],rooms:[{Name:'Details',Space:'X',Description:'Details text',MemberCount:1,MemberLimit:10,CanJoin:true,Friends:[{MemberNumber:55}]}]});
 const before=f.calls.length;
 f.document.querySelector('.room-detail-button').click();
 const dialog=f.document.querySelector('dialog[open]');
 assert.ok(dialog);assert.match(dialog.textContent,/#55/);
 assert.match(dialog.textContent,/Details text/);
 assert.equal(f.calls.length,before);
 dialog.querySelector('.dialog-close').click();
 assert.equal(f.document.querySelector('dialog[open]'),null);
 await f.window.happyDOM.close();
});


test('mentions insert an ID-bearing tag without sending and Escape dismisses suggestions',async()=>{
 const f=setup();f.emit({phase:'in-room',room:{Name:'Room'},characters:[{MemberNumber:55,Name:'Friend'},{MemberNumber:66,Name:'Other'}],messages:[]});
 const input=f.document.getElementById('InputChat');input.value='hello @';input.setSelectionRange(7,7);input.dispatchEvent(new f.window.Event('input'));
 const list=f.document.querySelector('.mention-list');assert.equal(list.hidden,false);assert.equal(list.querySelectorAll('button').length,2);
 const before=f.calls.length;input.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 assert.equal(input.value,'hello @Friend#55 ');assert.equal(list.hidden,true);assert.equal(f.calls.length,before);
 input.value='@';input.setSelectionRange(1,1);input.dispatchEvent(new f.window.Event('input'));input.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(list.hidden,true);
 await f.window.happyDOM.close();
});

test('chat font settings persist independent pt sizes and reject out-of-range input',async()=>{
 const f=setup();f.document.getElementById('nav-settings').click();
 const input=f.document.getElementById('ChatFont-chat');input.value='16.5';input.dispatchEvent(new f.window.Event('change'));
 assert.equal(f.document.documentElement.style.getPropertyValue('--chat-font-size'),'16.5pt');
 assert.equal(JSON.parse(f.window.localStorage.getItem('bc-lite-chat-fonts-v1')).private,12);
 input.value='99';input.dispatchEvent(new f.window.Event('change'));assert.equal(input.value,'16.5');
 assert.ok(f.document.querySelector('.settings-sticky > .eyebrow'));assert.ok(f.document.querySelector('.settings-sticky > .settings-jumps'));
 await f.window.happyDOM.close();
});
