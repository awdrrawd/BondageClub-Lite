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


test('architecture directory entry builds with a local stylesheet and redirects its old URL',async()=>{
 const html=await readFile(new URL('dist/docs/architecture/index.html',root),'utf8');
 const stylesheet=html.match(/href="([^"]+\.css)"/)[1];
 const css=await readFile(new URL('dist/'+stylesheet.replace(/^\//,''),root),'utf8');assert.ok(css.length>0);
 assert.match(await readFile(new URL('dist/_redirects',root),'utf8'),/\/docs\/architecture\.html \/docs\/architecture\/ 301/);
});

test('Pages watch policy skips prose and tests while retaining deployable source and architecture changes',async()=>{
 const policy=JSON.parse(await readFile(new URL('.cloudflare/build-watch-paths.json',root),'utf8'));
 const match=(pattern,file)=>new RegExp('^'+pattern.split('*').map(part=>part.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(file);
 const watched=file=>!policy.path_excludes.some(p=>match(p,file))&&policy.path_includes.some(p=>match(p,file));
 for(const file of ['README.md','docs/architecture.md','docs/deployment-and-tests.md','tests/build.test.mjs','src/translations/README.md','src/preview/client.ts'])assert.equal(watched(file),false,file);
 for(const file of ['future-module/data.json','docs/licenses/license.txt','ui-preview.html','src/main.ts','src/translations/ui/ru.json','public/_worker.js','public/licenses/license.txt','scripts/compile-action-catalogs.mjs','docs/architecture/index.html','docs/architecture/architecture.css','package-lock.json','vite.config.ts','index.html','.cloudflare/build-watch-paths.json'])assert.equal(watched(file),true,file);
 assert.equal(['docs/README.md','src/main.ts'].some(watched),true);
});
