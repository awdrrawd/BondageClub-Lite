import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { needsFullCheck, classify } from '../scripts/ci-changes.mjs';
import { brokenLinks } from '../scripts/check-doc-links.mjs';
import { checkSite } from '../scripts/check-site.mjs';

test('CI keeps docs cheap but verifies deployable docs, tests and workflow changes', () => {
  assert.equal(needsFullCheck(['README.md', 'docs/architecture.md']), false);
  for (const path of ['docs/architecture/index.html', 'tests/new.test.mjs', '.github/workflows/ci.yml', 'src/main.ts']) {
    assert.equal(needsFullCheck(['README.md', path]), true);
  }
  assert.equal(classify('workflow_dispatch', {}, () => []), true);
  assert.equal(classify('push', { before: '0'.repeat(40), after: 'a'.repeat(40) }, () => []), true);
  const event = { pull_request: { base: { sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) } } };
  assert.equal(classify('pull_request', event, (base, head, pr) => {
    assert.equal(pr, true);
    return ['README.md'];
  }), false);
  assert.equal(classify('pull_request', event, () => { throw new Error('missing history'); }), true);
});

test('docs check local links, images and references without fetching external URLs', () => {
  const root = mkdtempSync(join(tmpdir(), 'bc-docs-'));
  try {
    writeFileSync(join(root, 'real file.md'), '');
    const md = '[ok](real%20file.md#heading)\n[ref]: <real file.md>\n[bad](missing.md)\n![image](missing.png)\n[remote](https://example.com/nope)\n`[code](skip.md)`\n```md\n[code](skip2.md)\n```';
    assert.deepEqual(brokenLinks(md, join(root, 'README.md'), root), ['missing.md', 'missing.png']);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  }
});

const responseFor = url => url.endsWith('/api/relay-status')
  ? Response.json({ service: 'bc-lite-relay', version: 1, transport: 'websocket' })
  : new Response(`<title>${url.endsWith('/docs/architecture/') ? 'BC Lite · Architecture' : 'BC Lite'}</title>`, { headers: { 'content-type': 'text/html' } });

test('site health checks three fixed public endpoints without authentication', async () => {
  const calls = [];
  await checkSite(async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined);
    return responseFor(url);
  });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(url => url.startsWith('https://bondageclub-lite.pages.dev/')));
});

test('site health rejects HTTP failures, SPA fallback and incorrect relay metadata', async () => {
  await assert.rejects(checkSite(async () => new Response('', { status: 503 })), /HTTP 503/);
  await assert.rejects(checkSite(async url => responseFor('https://bondageclub-lite.pages.dev/')), /unexpected page/);
  await assert.rejects(checkSite(async url => url.endsWith('/api/relay-status') ? Response.json({}) : responseFor(url)), /relay metadata/);
});
