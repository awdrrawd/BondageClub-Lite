import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Window } from 'happy-dom';

test('architecture document is standalone, internally navigable and included in production', async () => {
  const window = new Window({ settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  const doc = window.document;
  doc.body.innerHTML = readFileSync('architecture.html', 'utf8');
  for (const link of doc.querySelectorAll('nav a')) assert.ok(doc.querySelector(link.getAttribute('href')));
  assert.equal(doc.querySelectorAll('main section').length, 7);
  assert.equal(doc.querySelectorAll('script,iframe,img,video').length, 0);
  const built = readFileSync('dist/architecture.html', 'utf8');
  assert.match(built, /src\/action\/generated/);
  assert.match(built, /<title>BC Lite · Architecture<\/title>/);
  const stylesheet = built.match(/href="(\/assets\/architecture-[^"]+\.css)"/);
  assert.ok(stylesheet);
  assert.ok(existsSync(`dist${stylesheet[1]}`));
  const css = readFileSync('docs/architecture.css', 'utf8');
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /grid-template-columns:1fr/);
  await window.happyDOM.close();
});
