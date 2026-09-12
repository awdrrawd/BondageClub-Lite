import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('test watchdog allows natural exit and fails a worker with a leaked interval', () => {
  // Exercise the production hook in a subprocess with a shorter test deadline.
  const source = readFileSync(new URL('../scripts/test-watchdog.mjs', import.meta.url), 'utf8')
    .replace('}, 60000);', '}, 100);');
  const run = tail => spawnSync(process.execPath, ['--input-type=module', '--eval', source + tail], {
    env: { ...process.env, NODE_TEST_CONTEXT: 'child-v8' }, encoding: 'utf8', timeout: 10000
  });
  const clean = run('');
  assert.equal(clean.error, undefined);
  assert.equal(clean.status, 0, clean.stderr);
  const leak = run('\nsetInterval(() => {}, 10000);');
  assert.equal(leak.error, undefined);
  assert.equal(leak.status, 1, leak.stderr);
  assert.match(leak.stderr, /TEST WORKER TIMEOUT/);
  assert.match(leak.stderr, /Timeout/);
  assert.match(leak.stderr, /setInterval/);
});
