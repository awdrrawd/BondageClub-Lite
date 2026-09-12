import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { appendChatLinks, MediaConsent, resolveMedia } from './links-helper.mjs';

test('ACV recognizes bare media URLs while preserving text and waiting for a click', async () => {
  const window = new Window({ url: 'https://lite.example', settings: { disableIframePageLoading: true } });
  try {
    const node = window.document.createElement('div'); window.document.body.append(node);
    const original = 'bilibili.com/video/BV149bG6dE5r/?spm_id_from=333.1007.tianma.3-2-6.click';
    appendChatLinks(node, original, new MediaConsent(window.document));
    assert.equal(node.querySelector('a').textContent, 'bilibili.com/video/BV149bG6dE5r/');
    assert.equal(node.querySelector('a').href, `https://${original}`);
    assert.equal(node.querySelector('iframe'), null);
    assert.equal(node.querySelectorAll('button').length, 1);
    node.querySelector('button').click();
    assert.equal(node.querySelector('iframe').src, 'https://player.bilibili.com/player.html?bvid=BV149bG6dE5r&autoplay=0&isOutside=true');
    const plain = window.document.createElement('div');
    const text = 'user@bilibili.com/video/BV149bG6dE5r bilibili.com.evil.test/video/BV149bG6dE5r ftp://bilibili.com/video/BV149bG6dE5r';
    appendChatLinks(plain, text, new MediaConsent(window.document));
    assert.equal(plain.textContent, text);
    assert.equal(plain.querySelector('a'), null);
  } finally { await window.happyDOM.close(); }
});

test('media permission storage failure uses a Lite notice and does not load the media',async()=>{
  const window=new Window(); window.alert=()=>assert.fail('browser alert');
  Object.defineProperty(window,'localStorage',{value:{getItem:()=>null,setItem:()=>{throw Error('quota');}}});
  const node=window.document.createElement('div'); window.document.body.append(node);
  appendChatLinks(node,'https://example.org/image.png',new MediaConsent(window.document));
  node.querySelectorAll('button')[1].click();
  assert.ok(window.document.querySelector('.lite-notice').open);
  assert.equal(node.querySelector('img'),null);
  await window.happyDOM.close();
});

test('provider matching rejects spoofed hosts and supported embeds need only a playback click', async () => {
  assert.equal(resolveMedia(new URL('https://youtube.com.evil.test/watch?v=abcdefghijk')),null);
  assert.equal(resolveMedia(new URL('https://youtube.com/watch?v=bad')),null);
  assert.equal(resolveMedia(new URL('https://youtu.be/abcdefghijk')).src,'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=0&rel=0');
  const window = new Window({ settings:{ disableIframePageLoading:true } });
  const node=window.document.createElement('div'); window.document.body.append(node);
  appendChatLinks(node,'https://youtu.be/abcdefghijk',new MediaConsent(window.document));
  assert.match(node.textContent,/YouTube/);
  assert.equal(node.querySelector('iframe'),null);
  node.querySelector('button').click();
  assert.ok(node.querySelector('iframe').src.startsWith('https://www.youtube-nocookie.com/embed/'));
  assert.equal(node.querySelector('script'),null);
  node.querySelector('button').click();
  assert.equal(node.querySelector('iframe'),null);
  await window.happyDOM.close();
});

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

test('permanent origin grants persist, stay origin-specific and can be revoked', async () => {
  const window = new Window({ url: 'https://lite.example' });
  const node = window.document.createElement('span'); window.document.body.append(node);
  let consent = new MediaConsent(window.document);
  appendChatLinks(node, 'https://images.example/a.png https://images.example.evil/b.png', consent);
  assert.equal(node.querySelector('img'), null);
  node.querySelectorAll('button')[1].click();
  assert.equal(node.querySelectorAll('img').length, 1);
  assert.equal(JSON.parse(window.localStorage.getItem('bc-lite-media-origins-v1'))[0], 'https://images.example');
  consent = new MediaConsent(window.document);
  const next = window.document.createElement('span'); appendChatLinks(next, 'https://images.example/c.png', consent);
  assert.ok(next.querySelector('img'));
  const settings = consent.buildSettings(); settings.querySelector('button').click();
  assert.equal(node.querySelector('img'), null);
  assert.deepEqual(JSON.parse(window.localStorage.getItem('bc-lite-media-origins-v1')), []);
  await window.happyDOM.close();
});

test('session grants never persist and disappear on session reset', async () => {
  const window = new Window({ url: 'https://lite.example' });
  const consent = new MediaConsent(window.document);
  const node = window.document.createElement('span'); appendChatLinks(node, 'https://image.example/a.png', consent);
  node.querySelector('button').click(); assert.ok(node.querySelector('img'));
  assert.equal(window.localStorage.length, 0);
  consent.resetSession();
  const next = window.document.createElement('span'); appendChatLinks(next, 'https://image.example/b.png', consent);
  assert.equal(next.querySelector('img'), null);
  await window.happyDOM.close();
});

test('unsafe schemes and markup stay text; images require origin permission', async () => {
  const window = new Window();
  const node = window.document.createElement('span');
  const text = '<img src=x onerror=alert(1)> javascript:alert(1) data:text/html,evil https://user:pass@example.com/ https:// https://example.org/test.png';
  const consent = new MediaConsent(window.document);
  appendChatLinks(node, text, consent);
  assert.ok(node.textContent.startsWith(text));
  assert.equal(node.querySelectorAll('a').length, 1);
  assert.equal(node.querySelectorAll('iframe,video,audio,script').length, 0);
  assert.equal(node.querySelector('img'), null);
  node.querySelector('button').click();
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
  const node = window.document.createElement('span'); window.document.body.append(node);
  appendChatLinks(node, 'https://example.org/a.mp4?download=1 http://example.org/a.jpg https://example.org/page https://example.org/a.svg', new MediaConsent(window.document));
  assert.equal(node.querySelector('video'), null);
  node.querySelector('button').click();
  assert.equal(node.querySelector('video'), null);
  node.querySelector('button').click();
  const video = node.querySelector('video');
  assert.equal(video.controls, true);
  assert.equal(video.playsInline, true);
  assert.equal(video.autoplay, false);
  assert.equal(video.preload, 'none');
  assert.equal(node.querySelectorAll('img,iframe').length, 0);
  assert.equal(node.querySelectorAll('a').length, 4);
  await window.happyDOM.close();
});


test('media settings separate permanent and session grants without repeated always labels',async context=>{
 const window=new Window({url:'https://lite.example'});context.after(()=>window.happyDOM.close());
 const consent=new MediaConsent(window.document),node=window.document.createElement('div');
 appendChatLinks(node,'https://permanent.example/a.png',consent);node.querySelectorAll('button')[1].click();
 const temporary=window.document.createElement('div');appendChatLinks(temporary,'https://session.example/a.png',consent);temporary.querySelector('button').click();
 const panel=consent.buildSettings();assert.equal(panel.querySelectorAll('.media-origin-list').length,2);
 assert.deepEqual([...panel.querySelectorAll('.media-origin-address')].map(n=>n.textContent),['https://permanent.example','https://session.example']);
 assert.ok(!panel.querySelector('.media-origin-groups').textContent.includes('總是許可'));assert.equal(panel.querySelectorAll('.media-origin-revoke').length,2);
 panel.querySelector('.media-origin-revoke').click();assert.deepEqual(JSON.parse(window.localStorage.getItem('bc-lite-media-origins-v1')),[]);
 assert.equal(panel.querySelectorAll('.media-origin-row').length,1);
});

test('ACV converts supported URLs locally and rejects hostname lookalikes',()=>{
 const cases=[
  ['https://www.bilibili.com/video/BV1xx411c7mD','https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&autoplay=0&isOutside=true'],
  ['https://www.bilibili.com/bangumi/play/ep123','https://player.bilibili.com/player.html?ep_id=123&autoplay=0&isOutside=true'],
  ['https://www.douyin.com/video/123','https://open.douyin.com/player/video?vid=123&autoplay=0'],
  ['https://streamable.com/abc','https://streamable.com/e/abc'],
  ['https://www.dailymotion.com/video/x123','https://www.dailymotion.com/embed/video/x123'],
  ['https://www.nicovideo.jp/watch/sm123','https://embed.nicovideo.jp/watch/sm123'],
  ['https://www.instagram.com/reel/abc/','https://www.instagram.com/p/abc/embed/'],
  ['https://music.163.com/#/song?id=123','https://music.163.com/outchain/player?type=2&id=123&auto=0&height=66'],
  ['https://music.apple.com/us/album/example/123?i=456','https://embed.music.apple.com/us/album/example/123?i=456'],
  ['https://github.com/owner/repo/blob/main/video.mp4','https://raw.githubusercontent.com/owner/repo/main/video.mp4'],
  ['https://www.pornhub.com/view_video.php?viewkey=ph123','https://www.pornhub.com/embed/ph123'],
 ];
 for(const [raw,src] of cases){if(resolveMedia(new URL(raw))?.kind==='frame') assert.ok(readFileSync('public/_headers','utf8').split('frame-src ')[1].split(';')[0].split(' ').includes(new URL(src).origin));const url=new URL(raw);assert.equal(resolveMedia(url).src,src);assert.equal(url.href,raw);if(!/mp4$/.test(raw)){url.hostname+='.'+'evil.test';assert.equal(resolveMedia(url),null);}}
 assert.equal(resolveMedia(new URL('https://www.twitch.tv/videos/123'),'lite.example').src,'https://player.twitch.tv/?video=123&parent=lite.example&autoplay=false');
 assert.equal(resolveMedia(new URL('https://www.twitch.tv/channel')),null);
});

test('ACV switch stops players, preserves normal links and persists without changing grants',async()=>{
 const window=new Window({url:'https://lite.example',settings:{disableIframePageLoading:true}});
 try {
  const consent=new MediaConsent(window.document),node=window.document.createElement('div');window.document.body.append(node);
  const original='https://www.bilibili.com/video/BV1xx411c7mD';appendChatLinks(node,original,consent);
  assert.equal(node.querySelector('a').href,original);assert.equal(node.querySelector('iframe'),null);
  const stale=node.querySelector('button');stale.click();assert.ok(node.querySelector('iframe'));
  window.document.body.append(consent.buildSettings());const toggle=window.document.getElementById('ACVEnabled');toggle.click();
  assert.equal(node.querySelector('iframe'),null);assert.equal(node.querySelector('a').textContent,original);stale.click();assert.equal(node.querySelector('iframe'),null);
  assert.equal(window.localStorage.getItem('bc-lite-acv-v1'),'false');
  const fresh=new MediaConsent(window.document);assert.equal(fresh.buildSettings().querySelector('#ACVEnabled').checked,false);
  toggle.click();assert.ok(node.querySelector('button'));assert.equal(node.querySelector('iframe'),null);
 } finally {await window.happyDOM.close();}
});


test('long links use short labels without changing targets or meaningful Bilibili selection', async () => {
 const window=new Window();
 try {
  const node=window.document.createElement('div');
  const url='https://www.bilibili.com/video/BV149bG6dE5r/?spm_id_from=tracking&vd_source=tracking&p=2&t=30';
  appendChatLinks(node,url);
  const anchor=node.querySelector('a');
  assert.equal(anchor.textContent,'https://www.bilibili.com/video/BV149bG6dE5r/?p=2&t=30');
  assert.equal(anchor.href,url);assert.equal(anchor.title,url);
  const long='https://example.org/path?value='+'a'.repeat(150);
  const other=window.document.createElement('div');appendChatLinks(other,long);
  assert.ok(other.querySelector('a').textContent.length<=90);
  assert.equal(other.querySelector('a').href,long);
 } finally {await window.happyDOM.close();}
});
