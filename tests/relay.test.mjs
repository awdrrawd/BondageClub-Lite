import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../public/_worker.js';

function request(query = '?EIO=4&transport=websocket', origin = 'https://lite.example') {
  return new Request(`https://lite.example/socket.io/${query}`, { headers: {
    Upgrade: 'websocket', Origin: origin, Cookie: 'private=value', Authorization: 'secret',
  } });
}

test('relay reports configuration but makes no claim of PROD login', async () => {
  const response = await worker.fetch(new Request('https://lite.example/api/relay-status'), {});
  const body = await response.json();
  assert.equal(body.service, 'bc-lite-relay');
  assert.equal(body.bcOrigin, 'https://bondageprojects.elementfx.com');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('relay rejects foreign origin, polling, and arbitrary upstream or session injection', async () => {
  assert.equal((await worker.fetch(request(undefined, 'https://other.example'), {})).status, 403);
  for (const query of ['?EIO=4&transport=polling', '?EIO=3&transport=websocket', '?EIO=4&transport=websocket&url=https://evil.example', '?EIO=4&transport=websocket&sid=someone-else']) {
    assert.equal((await worker.fetch(request(query), {})).status, 400);
  }
  assert.equal((await worker.fetch(new Request('https://lite.example/socket.io/'), {})).status, 426);
});

test('relay forwards only fixed handshake with server-side Origin and returns untouched socket', async t => {
  const upgrade = { status: 101, webSocket: {} };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), 'https://bondage-club-server.herokuapp.com/socket.io/?EIO=4&transport=websocket');
    assert.equal(init.headers.get('Origin'), 'https://bondageprojects.elementfx.com');
    assert.equal(init.headers.get('Cookie'), null);
    assert.equal(init.headers.get('Authorization'), null);
    assert.equal(init.redirect, 'manual');
    return upgrade;
  });
  assert.equal(await worker.fetch(request(), {}), upgrade);
});

test('relay returns bounded error without leaking upstream response body', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('private diagnostics', { status: 403 }));
  const response = await worker.fetch(request(), {});
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'UPSTREAM_UPGRADE_FAILED', upstreamStatus: 403 });
});

test('other requests fall through to Pages assets', async () => {
  const response = new Response('asset');
  assert.equal(await worker.fetch(new Request('https://lite.example/'), { ASSETS: { fetch: async () => response } }), response);
});
