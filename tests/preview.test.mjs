import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

test('offline preview client supports UI flows without network or browser storage', async () => {
  const code = stripTypeScriptTypes(readFileSync('src/preview/client.ts','utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
  const preview = vm.runInNewContext(code + ';createPreviewClient();', { Date, Set });
  let snapshot;
  preview.client.subscribe(value => { snapshot=value; });
  assert.equal(snapshot.player.MemberNumber,101);
  preview.client.search({ Space:'', Query:'' });
  assert.equal(snapshot.rooms.length,28);
  preview.client.join('測試房間');
  preview.client.sendChat('hello');
  assert.equal(snapshot.messages.at(-1).text,'hello');
  preview.client.sendBeep(202,'private');
  assert.equal(snapshot.beeps.at(-1).text,'private');
  preview.stress(); assert.equal(snapshot.messages.length,3000);
  preview.simulateDisconnect(); assert.equal(snapshot.phase,'reconnecting');
  await preview.client.login(); assert.equal(snapshot.phase,'in-room');
  assert.equal(existsSync('dist/ui-preview.html'),false);
  const html = readFileSync('ui-preview.html','utf8');
  assert.match(html,/data-ui-preview/); assert.match(html,/frame-src 'none'/);
});

test('share descriptions are available without JavaScript', () => {
  const html=readFileSync('dist/index.html','utf8');
  assert.match(html, /property="og:description" content="[^"]{40,}"/);
  assert.match(html, /name="twitter:description"/);
  assert.match(html, /property="og:url" content="https:\/\/bondageclub-lite.pages.dev\/"/);
});
