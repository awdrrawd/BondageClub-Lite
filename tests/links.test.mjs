import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { appendChatLinks } from './links-helper.mjs';

test('links preserve text, balanced URL parentheses, Chinese punctuation and emote boundaries', async () => {
  const window = new Window();
  const node = window.document.createElement('span');
  const text = '看看：https://example.org/a_(b)。 (https://example.net/test) *https://example.com/a?q=1&b=2*';
  appendChatLinks(node, text);
  assert.equal(node.textContent, text);
  assert.deepEqual([...node.querySelectorAll('a')].map(a => a.href), ['https://example.org/a_(b)', 'https://example.net/test', 'https://example.com/a?q=1&b=2']);
  for (const a of node.querySelectorAll('a')) {
    assert.equal(a.target, '_blank');
    assert.equal(a.rel, 'noopener noreferrer nofollow');
    assert.equal(a.referrerPolicy, 'no-referrer');
  }
  await window.happyDOM.close();
});

test('unsafe schemes, credentials and markup remain text; HTTPS images render inline', async () => {
  const window = new Window();
  const node = window.document.createElement('span');
  const text = '<img src=x onerror=alert(1)> javascript:alert(1) data:text/html,evil https://user:pass@example.com/ https:// https://example.org/test.png';
  appendChatLinks(node, text);
  assert.equal(node.textContent, text);
  assert.equal(node.querySelectorAll('a').length, 1);
  assert.equal(node.querySelectorAll('iframe,video,audio,script').length, 0);
  const img = node.querySelector('img');
  assert.equal(img.src, 'https://example.org/test.png');
  assert.equal(img.referrerPolicy, 'no-referrer');
  assert.equal(img.loading, 'lazy');
  img.dispatchEvent(new window.Event('error'));
  assert.equal(node.querySelector('img'), null);
  assert.equal(node.querySelectorAll('a').length, 1);
  await window.happyDOM.close();
});

test('direct videos use inline controls without autoplay; webpages and insecure media stay links', async () => {
  const window = new Window();
  const node = window.document.createElement('span');
  appendChatLinks(node, 'https://example.org/a.mp4?download=1 http://example.org/a.jpg https://example.org/page https://example.org/a.svg');
  const video = node.querySelector('video');
  assert.equal(video.controls, true);
  assert.equal(video.playsInline, true);
  assert.equal(video.autoplay, false);
  assert.equal(video.preload, 'metadata');
  assert.equal(node.querySelectorAll('img,iframe').length, 0);
  assert.equal(node.querySelectorAll('a').length, 4);
  await window.happyDOM.close();
});
