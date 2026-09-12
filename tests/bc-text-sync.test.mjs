import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fetchBcText } from '../scripts/fetch-bc-text.mjs';

test('mirror sync pins text downloads, tolerates missing translations and rejects stale directories', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bc-text-test-'));
  const calls = [], sha = 'a'.repeat(40);
  try {
    await fetchBcText(root, async url => {
      calls.push(url);
      if (url.includes('api.github.com')) return Response.json({sha});
      assert.ok(url.includes(`/${sha}/`));
      assert.match(url, /(?:\.csv|_(?:CN|TW|RU)\.txt)$/);
      return url.endsWith('.csv') ? new Response('Key,Text\n') : new Response('', {status:404});
    });
    assert.equal(calls.length, 21);
    assert.match(readFileSync(join(root,'PR.md'),'utf8'), new RegExp(sha));
    await assert.rejects(fetchBcText(root), /empty/);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, {recursive:true,force:true});
  }
});

test('mirror sync rejects invalid commits before downloading files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bc-text-test-'));
  try {
    await assert.rejects(fetchBcText(root, async () => Response.json({sha:'branch-name'})), /Invalid mirror commit/);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, {recursive:true,force:true});
  }
});
