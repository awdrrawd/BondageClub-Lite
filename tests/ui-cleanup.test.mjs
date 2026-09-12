import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('UI fixture cleanup releases the app interval even after a failed assertion', () => {
  const fixture = new URL(`.ui-cleanup-${randomUUID()}.mjs`, import.meta.url);
  const source = readFileSync(new URL('./ui.test.mjs', import.meta.url), 'utf8');
  try {
    writeFileSync(fixture, source + `\ntest('intentional cleanup regression', () => {
      setup();
      assert.fail('intentional assertion failure');
    });\n`);
    // No watchdog: the worker must naturally exit with the assertion failure.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-name-pattern=^intentional cleanup regression$', fileURLToPath(fixture)], {
      env, encoding: 'utf8', timeout: 15000
    });
    assert.equal(result.error, undefined, 'Failed UI test left its worker running');
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /intentional assertion failure/);
    assert.doesNotMatch(result.stdout + result.stderr, /TEST WORKER TIMEOUT/);
  } finally {
    unlinkSync(fixture);
  }
});
