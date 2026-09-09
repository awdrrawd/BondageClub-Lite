import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

async function setup(environment, relayAvailable = true) {
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
  handlers.get('LoginResponse')({ AccountName: 'test', Name: 'Test', ID: 'socket', MemberNumber: 123, Environment: environment });
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
