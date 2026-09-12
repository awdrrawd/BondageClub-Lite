import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("production build contains the static shell and security headers", async () => {
  const [html, headers] = await Promise.all([
    readFile(new URL("dist/index.html", root), "utf8"),
    readFile(new URL("dist/_headers", root), "utf8"),
  ]);
  assert.match(html, /<title>BC Lite<\/title>/);
  assert.match(html, /assets\/index-[\w-]+\.js/);
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /connect-src 'self'/);
  const worker = await readFile(new URL('dist/_worker.js', root), 'utf8');
  assert.match(worker, /UPSTREAM/);
  const routes = JSON.parse(await readFile(new URL('dist/_routes.json', root), 'utf8'));
  assert.deepEqual(routes.include, ['/socket.io/*', '/api/relay-status']);
  assert.doesNotMatch(headers, /unsafe-inline|unsafe-eval/);
});

test("client is WebSocket-only and does not persist credentials", async () => {
  const protocol = await readFile(new URL("src/network/client.ts", root), "utf8");
  assert.match(protocol, /transports:\s*\["websocket"\]/);
  assert.match(protocol, /upgrade:\s*false/);
  assert.doesNotMatch(protocol, /sessionStorage|indexedDB|document\.cookie/);
  assert.equal((protocol.match(/localStorage\.setItem\(/g) || []).length, 1);
  assert.match(protocol, /localStorage\.setItem\(key, JSON\.stringify\(name === null \? null : this\.validRoomName\(name\)\)\)/);
});


test('used flags ship as local hashed SVG assets rather than embedded JS strings',async()=>{
 const files=await readdir(new URL('dist/assets/',root));
 const html=await readFile(new URL('dist/index.html',root),'utf8');
 const script=html.match(/src="([^"]*assets\/index-[\w-]+\.js)"/)[1];
 const js=await readFile(new URL('dist/'+script.replace(/^\//,''),root),'utf8');
 for(const flag of ['hk','gb','de','fr','es','ru','ua']){
  const file=files.find(file=>file.startsWith('flag-'+flag+'-')&&file.endsWith('.svg'));assert.ok(file,flag);
  const svg=await readFile(new URL('dist/assets/'+file,root),'utf8');assert.match(svg,/<svg/);
  assert.doesNotMatch(svg,/<script|<foreignObject|\bonload=|(?:href|src)=["']https?:/i);
  assert.ok(js.includes(file));assert.ok(!js.includes('flag-icons-'+flag));
 }
 assert.ok(!files.some(file=>/^flag-tw-/.test(file)),'unused flags are not shipped');
});
