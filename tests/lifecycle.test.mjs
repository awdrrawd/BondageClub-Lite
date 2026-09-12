import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTypeScript } from './load-typescript.mjs';
import { interactionPermission } from './permissions-helper.mjs';

test('lifetime releases timers and listeners, including late subscriptions', async () => {
 const window=new Window();
 try {
  const Lifetime=new Function('window',loadTypeScript('src/platform/lifetime.ts')+';return Lifetime;')(window);
  const lifetime=new Lifetime(); let calls=0, released=0;
  lifetime.listen(window,'online',()=>calls++);
  lifetime.timeout(()=>calls++,10); lifetime.interval(()=>calls++,10);
  window.dispatchEvent(new window.Event('online')); assert.equal(calls,1);
  lifetime.dispose(); lifetime.dispose(); lifetime.add(()=>released++);
  window.dispatchEvent(new window.Event('online'));
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(calls,1); assert.equal(released,1);
 } finally { await window.happyDOM.close(); }
});

test('shared permission rejects unknown data and honors the official legacy field',()=>{
 const state={phase:'in-room',room:{Name:'Test'},player:{MemberNumber:1},characters:[{MemberNumber:1},{MemberNumber:2}]};
 assert.equal(interactionPermission(state,1),null);
 assert.equal(interactionPermission(state,2),'permission-unknown');
 state.characters[1].ItemPermission=0;
 assert.equal(interactionPermission(state,2),null);
 state.characters[1].AllowedInteractions=3;
 assert.equal(interactionPermission(state,2),'restricted-permission');
 assert.equal(interactionPermission(state,99),'target-missing');
 state.phase='disconnected';
 assert.equal(interactionPermission(state,1),'not-in-room');
});

test('TypeScript loader preserves source strings while removing multiline module declarations',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lite-loader-'));
 try {
  const path=join(dir,'fixture.ts');
  writeFileSync(path,'import {\n example\n} from "unused";\nexport const text: string = "export import unchanged";\nexport { text as alias };');
  assert.equal(new Function(loadTypeScript(path)+';return text;')(),'export import unchanged');
 } finally { rmSync(join(dir,'fixture.ts')); rmdirSync(dir); }
});
