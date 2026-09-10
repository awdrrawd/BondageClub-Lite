import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import LZString from 'lz-string';
import { t, getLocale, setLocale } from './i18n-helper.mjs';
import { appendChatLinks, MediaConsent } from './links-helper.mjs';
import { afcLovers } from './community-helper.mjs';
const stabilitySource = stripTypeScriptTypes(readFileSync(new URL('../src/platform/stability.ts', import.meta.url), 'utf8')).replace('import { t } from "../i18n";', '').replace('export ', '');

const bioCode = stripTypeScriptTypes(readFileSync(new URL('../src/profile/biography.ts', import.meta.url), 'utf8')).replace('import LZString from "lz-string";', '').replace('import { t } from "../i18n";', '').replace('export ', '');
const decodeBiography = new Function('LZString', 't', bioCode + '; return decodeBiography;')(LZString, t);

const source = stripTypeScriptTypes(readFileSync(new URL('../src/ui/app.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');

function setup(savedAccount) {
  setLocale('zh');
  const window = new Window({ url: 'https://lite.example', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  const StabilityControls = new Function('document', 'window', 't', 'URL', stabilitySource + ';return StabilityControls;')(window.document, window, t, window.URL);
  window.document.body.innerHTML = '<div id="app"></div>';
  if (savedAccount) window.localStorage.setItem('bc-lite-account-v1', savedAccount);
  let current = { phase: 'ready', status: 'Ready', player: { Name: 'Tester', MemberNumber: 123, FriendList: [55], Appearance: [] }, room: null, rooms: [], characters: [], messages: [], friends: [], friendsQueryState: 'idle', friendsStatus: '尚未查詢', beeps: [] };
  let listener;
  const calls = [];
  const bcClient = {
    subscribe(callback) { listener = callback; listener(current); },
    refreshFriends() { calls.push('friends'); },
    sendChat(text) { calls.push(text); },
    setTextCatalog() {},
    configureSummons() {}, dismissSummon() {}, acceptSummon() {}, requestLoverRoom(id) { calls.push({ lover: id }); }, sendInteraction(id, action) { calls.push({ interaction: action, id }); },
    recordLifecycle(event) { calls.push({ lifecycle: event }); },
    resumeConnection() { calls.push('resume'); },
    connectionDiagnostics() { return 'test-event'; },
    activateSafeword(mode) { calls.push({ safeword: mode }); },
    relocalize() {},
    sendBeep(id, text) { calls.push({ id, text }); },
    async login(account) { calls.push({ login: account }); },
    setFriend() {}, clearBeeps() {}, leave() {}, disconnect() {}, search() {}, join() {}, createRoom() {},
  };
  vm.runInNewContext(source, { window, document: window.document, localStorage: window.localStorage, bcClient, decodeBiography, appendChatLinks, MediaConsent, afcLovers, StabilityControls, loadTextCatalog: async () => ({}), t, getLocale, setLocale });
  return { window, document: window.document, calls, state: () => current, emit(change) { if (change.friendsStatus === '查詢完成') change.friendsQueryState = 'ready'; current = { ...current, ...change }; listener(current); } };
}

function messages(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `id-${index}`, sender: 55, senderName: 'Friend', text: `message ${index}`, time: new Date(), type: 'Chat' }));
}

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
  f.document.querySelector('.chat-room-top-menu .mobile-members').click();
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
  assert.equal(f.document.getElementById('BeepTarget').value, '55');
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
  [...dialog.querySelectorAll('button')].find(n => n.textContent === '揮手').click();
  assert.deepEqual(f.calls.at(-1), { interaction: 'wave', id: 55 });
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
  f.window.confirm = () => false;
  f.document.querySelector('[data-safeword=revert]').click();
  assert.equal(f.calls.some(call => call?.safeword), false);
  f.window.confirm = () => true;
  f.document.querySelector('[data-safeword=release]').click();
  assert.deepEqual(f.calls.at(-1), { safeword: 'release' });
  assert.equal(f.document.querySelector('.safeword-dialog'), null);
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
  assert.equal(f.document.getElementById('nav-chat').textContent, 'Chat');
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
  f.emit({ phase: 'in-room', room: { Name: 'Test', Limit: 10 }, messages: messages(100) });
  const log = f.document.getElementById('TextAreaChatLog');
  Object.defineProperty(log, 'scrollHeight', { value: 1000, configurable: true });
  Object.defineProperty(log, 'clientHeight', { value: 200, configurable: true });
  log.scrollTop = 100;
  f.emit({ messages: messages(101) });
  assert.doesNotMatch(log.textContent, /message 100/);
  assert.equal(log.scrollTop, 100);
  assert.equal(f.document.getElementById('new-messages').hidden, false);
  f.document.getElementById('new-messages').click();
  assert.match(log.textContent, /message 100/);
  assert.equal(log.children.length, 100);
  await f.window.happyDOM.close();
});

test('friend updates and BEEP do not replace composer; untrusted content stays text', async () => {
  const f = setup();
  f.document.getElementById('nav-private').click();
  assert.deepEqual(f.calls, ['friends']);
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
  assert.deepEqual(JSON.parse(f.window.localStorage.getItem('bc-lite-display-v1')), { background: true, largeText: false, timestamps: true, locale: 'zh' });
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
  assert.match(f.document.querySelector('.app-header').textContent, /Tester.*123.*安全詞.*登出/);
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

test('friend tabs use room presence and successful query, with join before BEEP', async () => {
  const f = setup();
  f.emit({ player: { ...f.state().player, FriendList: [55, 66, 77] }, characters: [{ MemberNumber: 66, Name: 'Same room' }], friendsStatus: '查詢完成', friends: [{ MemberNumber: 55, MemberName: 'Remote', Type: 'Friend', ChatRoomName: 'Elsewhere' }] });
  f.document.getElementById('nav-friends').click();
  const card = f.document.querySelector('.contact-card');
  assert.deepEqual([...card.querySelectorAll('button')].slice(0, 2).map(button => button.textContent), ['前往房間', 'BEEP']);
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
  const selectWhisper = index => f.document.querySelectorAll('.contact-card')[index].querySelectorAll('button')[1].click();
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
