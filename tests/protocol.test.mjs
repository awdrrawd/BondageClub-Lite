import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

async function setup(environment, relayAvailable = true, account = {}) {
  const handlers = new Map();
  const sent = [];
  const timers = new Map();
  let timerId = 0;
  const socket = {
    connected: true,
    on(event, callback) { handlers.set(event, callback); },
    emit(event, payload) { sent.push({ event, payload }); },
    removeAllListeners() { handlers.clear(); },
    disconnect() { this.connected = false; },
  };
  const context = {
    exports: {},
    require: () => ({ io: () => socket }),
    window: { setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } },
    crypto: { randomUUID: () => 'message-id' },
    location: { origin: 'https://lite.example' },
    AbortSignal,
    fetch: async () => ({ ok: relayAvailable, json: async () => relayAvailable ? ({ service: 'bc-lite-relay', version: 1 }) : ({}) }),
  };
  const source = readFileSync(new URL('../src/protocol.ts', import.meta.url), 'utf8');
  const javascript = stripTypeScriptTypes(source)
    .replace(/import .* from "socket.io-client";/, 'const { io } = require("socket.io-client");')
    .replaceAll('export ', '');
  vm.runInNewContext(`${javascript}\nexports.BcLiteClient = BcLiteClient;`, context);
  const client = new context.exports.BcLiteClient();
  let state;
  client.subscribe(value => { state = value; });
  await client.login('test', 'not-a-real-password');
  if (!relayAvailable) return { client, handlers, sent, timers, state: () => state };
  handlers.get('LoginResponse')({ AccountName: 'test', Name: 'Test', ID: 'socket', MemberNumber: 123, Environment: environment, ...account });
  handlers.get('ServerInfo')({ OnlinePlayers: 345 });
  return { client, handlers, sent, timers, state: () => state };
}

const request = { Query: '', Space: 'X', Language: '', Game: '', FullRooms: false, ShowLocked: true, SearchDescs: false };

test('missing relay does not send credentials or fall back to direct BC connection', async () => {
  const fixture = await setup(undefined, false);
  assert.equal(fixture.state().phase, 'error');
  assert.equal(fixture.handlers.size, 0);
  assert.equal(fixture.sent.length, 0);
  assert.match(fixture.state().status, /中繼未就緒/);
});

test('duplicate login stops reconnection credentials and clears pending operations', async () => {
  const fixture = await setup('PROD');
  fixture.client.search(request);
  fixture.handlers.get('ForceDisconnect')('ErrorDuplicatedLogin');
  fixture.handlers.get('connect')();
  assert.equal(fixture.state().phase, 'error');
  assert.equal(fixture.timers.size, 0);
  assert.equal(fixture.sent.some(item => item.event === 'AccountLogin'), false);
});

test('login environment is preserved and DEV never claims production login', async () => {
  const dev = await setup('DEV');
  assert.equal(dev.state().player.Environment, 'DEV');
  assert.match(dev.state().status, /已登入 DEV/);
  assert.match((await setup('PROD')).state().status, /已登入正式環境 PROD/);
  assert.match((await setup()).state().status, /正式環境尚未確認/);
});

test('timed-out room search can be retried', async () => {
  const fixture = await setup();
  fixture.client.search(request);
  [...fixture.timers.values()][0]();
  fixture.client.search(request);
  assert.equal(fixture.sent.filter(item => item.event === 'ChatRoomSearch').length, 2);
  fixture.handlers.get('ChatRoomSearchResult')([]);
  assert.equal(fixture.state().status, '找到 0 個房間');
});

test('creation waits for room sync; periodic ServerInfo cannot reset pending operation', async () => {
  const fixture = await setup();
  fixture.client.createRoom('Lite test', 'X', 'CN', true);
  const payload = fixture.sent.find(item => item.event === 'ChatRoomCreate').payload;
  assert.equal(payload.Space, 'X');
  assert.equal(payload.Visibility.length, 0);
  assert.equal(payload.Admin[0], 123);
  fixture.handlers.get('ServerInfo')({ OnlinePlayers: 456 });
  assert.equal(fixture.state().phase, 'joining');
  fixture.handlers.get('ChatRoomCreateResponse')('ChatRoomCreated');
  assert.equal(fixture.state().phase, 'joining');
  fixture.handlers.get('ChatRoomSync')({ Name: 'Lite test', Character: [], Limit: 10 });
  assert.equal(fixture.state().phase, 'in-room');
  assert.equal(fixture.timers.size, 0);
});

test('creation failure restores controls and exposes server error', async () => {
  const fixture = await setup();
  fixture.client.createRoom('Lite test', 'X', '', false);
  fixture.handlers.get('ChatRoomCreateResponse')('RoomAlreadyExist');
  assert.equal(fixture.state().phase, 'ready');
  assert.match(fixture.state().status, /RoomAlreadyExist/);
  assert.equal(fixture.timers.size, 0);
});

test('native friends query validates response, times out and clears on logout', async () => {
  const f = await setup('PROD');
  f.client.refreshFriends();
  assert.equal(f.sent.at(-1).event, 'AccountQuery');
  assert.equal(f.sent.at(-1).payload.Query, 'OnlineFriends');
  assert.throws(() => f.client.refreshFriends(), /查詢中/);
  f.handlers.get('AccountQueryResult')({ Query: 'OnlineFriends', Result: [{ MemberNumber: 55, MemberName: 'Friend', ChatRoomName: 'Test room' }, null] });
  assert.equal(f.state().friends.length, 1);
  assert.equal(f.timers.size, 0);
  f.client.refreshFriends();
  [...f.timers.values()][0]();
  assert.match(f.state().friendsStatus, /逾時/);
  f.client.disconnect();
  assert.equal(f.state().friends.length, 0);
  assert.equal(f.timers.size, 0);
});

test('friend updates preserve opaque custom outfit and shared settings; missing list is never overwritten', async () => {
  const appearance = [{ Group: 'UnknownEchoSlot', Name: 'custom', Property: { nested: ['data'] } }];
  const settings = { Echo: { opaque: true } };
  const f = await setup('PROD', true, { Appearance: appearance, OnlineSharedSettings: settings, FriendList: [77, 88] });
  f.client.setFriend(99, true);
  f.client.setFriend(77, false);
  assert.equal(JSON.stringify(f.sent.at(-1).payload), JSON.stringify({ FriendList: [88, 99] }));
  assert.equal(f.state().player.Appearance, appearance);
  assert.equal(f.state().player.OnlineSharedSettings, settings);
  for (const item of f.sent) assert.equal('Appearance' in item.payload || 'OnlineSharedSettings' in item.payload, false);
  const missing = await setup('PROD');
  assert.throws(() => missing.client.setFriend(99, true), /停止修改/);
});

test('BEEP interoperates with FCM native text, ignores control packets, and is bounded', async () => {
  const f = await setup('PROD');
  f.client.sendBeep(55, 'hello');
  assert.equal(f.sent.at(-1).event, 'AccountBeep');
  assert.equal(f.sent.at(-1).payload.BeepType, '');
  assert.equal(f.sent.at(-1).payload.IsSecret, true);
  assert.equal(f.state().beeps[0].incoming, false);
  assert.throws(() => f.client.sendBeep(55, 'too fast'), /稍等/);
  const receive = f.handlers.get('AccountBeep');
  receive({ MemberNumber: 55, MemberName: 'Friend', BeepType: 'FCMChatPrivate', Message: '{control}' });
  receive({ MemberNumber: 55, MemberName: 'Friend', BeepType: '', Message: { invalid: true } });
  assert.equal(f.state().beeps.length, 1);
  for (let index = 0; index < 310; index++) receive({ MemberNumber: 55, MemberName: 'Friend', BeepType: '', Message: `text ${index}` });
  assert.equal(f.state().beeps.length, 300);
  assert.equal(f.state().beeps.at(-1).text, 'text 309');
  f.client.disconnect();
  assert.equal(f.state().beeps.length, 0);
  assert.throws(() => f.client.sendBeep(55, 'offline'), /未連線/);
});

test('disconnected chat throws instead of silently consuming a draft', async () => {
  const f = await setup('PROD');
  assert.throws(() => f.client.sendChat('draft'), /草稿/);
  f.handlers.get('ChatRoomSync')({ Name: 'test', Character: [], Limit: 10 });
  f.handlers.get('disconnect')('transport close');
  const before = f.sent.length;
  assert.throws(() => f.client.sendChat('draft'), /草稿/);
  assert.equal(f.sent.length, before);
});

test('same-room synchronization preserves chat history', async () => {
  const f = await setup('PROD');
  f.handlers.get('ChatRoomSync')({ Name: 'test', Character: [], Limit: 10 });
  f.handlers.get('ChatRoomMessage')({ Type: 'Chat', Sender: 123, Content: 'keep me' });
  const messages = f.state().messages;
  f.handlers.get('ChatRoomSync')({ Name: 'test', Character: [], Limit: 10 });
  assert.equal(f.state().messages, messages);
});

test('room and character synchronization never write back unknown ECHO appearance', async () => {
  const appearance = [{ Group: 'ECHO-custom', Name: 'Unknown', Color: ['#123456'], Property: { extra: { opaque: true } } }];
  const f = await setup('PROD', true, { Appearance: appearance, FriendList: [] });
  f.handlers.get('ChatRoomSync')({ Name: 'test', Character: [{ MemberNumber: 123, Name: 'Test', Appearance: appearance }], Limit: 10 });
  f.handlers.get('ChatRoomSyncCharacter')({ Character: { MemberNumber: 123, Name: 'Test', Appearance: [] } });
  f.client.sendChat('hello');
  f.client.setFriend(55, true);
  f.client.leave();
  assert.equal(f.state().player.Appearance, appearance);
  for (const packet of f.sent.filter(packet => packet.event === 'AccountUpdate')) {
    assert.deepEqual(Object.keys(packet.payload), ['FriendList']);
  }
  assert.equal(f.sent.some(packet => /CharacterUpdate|CharacterItemUpdate/.test(packet.event)), false);
});

test('search while in-room retains membership and messages, including search errors', async () => {
  const f = await setup('PROD');
  f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [], Limit: 10 });
  const messages = f.state().messages;
  f.client.search(request);
  f.handlers.get('ChatRoomSearchResult')([]);
  f.handlers.get('ChatRoomSearchResponse')('Error');
  assert.equal(f.state().phase, 'in-room');
  assert.equal(f.state().room.Name, 'Test');
  assert.equal(f.state().messages, messages);
  assert.equal(f.sent.some(packet => packet.event === 'ChatRoomLeave'), false);
});

test('creation sends native permissions, custom URLs and default map without loading resources', async () => {
  const f = await setup('PROD');
  f.client.createRoom('Advanced', 'X', 'CN', false, 'Description', 5, {
    Background: 'MainHall', Admin: [55], Whitelist: [66], Ban: [77], Game: 'LARP',
    Visibility: ['Admin', 'Whitelist'], Access: ['Admin'], BlockCategory: ['Photos'],
    Custom: { ImageURL: 'https://example.org/background.png', MusicURL: 'https://example.org/audio.mp3' }, MapData: { Type: 'Hybrid', Fog: true },
  });
  const payload = f.sent.find(packet => packet.event === 'ChatRoomCreate').payload;
  assert.equal(JSON.stringify(payload.Admin), '[123,55]');
  assert.equal(payload.Custom.ImageURL, 'https://example.org/background.png');
  assert.equal(payload.MapData.Tiles, 'd'.repeat(1600));
  assert.equal(payload.MapData.Objects.length, 1600);
  assert.equal(payload.Access[0], 'Admin');
  assert.equal(payload.Ban[0], 77);
  assert.equal(payload.Game, 'LARP');
});

test('invalid map and unsafe custom URL fail before creating or changing phase', async () => {
  const f = await setup('PROD');
  assert.throws(() => f.client.createRoom('Test', 'X', 'CN', false, '', 5, { MapData: { Type: 'Always', Tiles: 'broken' } }), /地圖格式/);
  assert.throws(() => f.client.createRoom('Test', 'X', 'CN', false, '', 5, { Custom: { ImageURL: 'javascript:alert(1)' } }), /HTTPS/);
  assert.equal(f.state().phase, 'ready');
  assert.equal(f.sent.some(packet => packet.event === 'ChatRoomCreate'), false);
});
