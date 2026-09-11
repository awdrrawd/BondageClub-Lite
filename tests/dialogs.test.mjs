import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { Window } from 'happy-dom';
import { dialogs } from './dialogs-helper.mjs';
test('Lite dialogs use literal text, cancellation, and one-shot guarded acceptance', async()=>{
  const window=new Window(), doc=window.document, {showConfirm,showNotice}=dialogs(doc);
  let accepted=0,cancelled=0;
  showConfirm('<img src=x>',()=>accepted++,{cancel:()=>cancelled++});
  assert.equal(doc.querySelector('.lite-confirm img'),null);
  doc.querySelector('[data-dialog-action=cancel]').click(); assert.equal(cancelled,1); assert.equal(accepted,0);
  showConfirm('stale',()=>accepted++,{valid:()=>false}); doc.querySelector('[data-dialog-action=confirm]').click(); assert.equal(accepted,0);
  showConfirm('okay',()=>accepted++); const yes=doc.querySelector('[data-dialog-action=confirm]'); yes.click(); yes.click(); assert.equal(accepted,1);
  showNotice('first'); showNotice('<script>literal</script>'); assert.equal(doc.querySelectorAll('.lite-notice').length,1); assert.equal(doc.querySelector('.lite-notice script'),null);
  doc.querySelector('[data-dialog-action=close]').click(); assert.equal(doc.querySelector('.lite-notice'),null);
  await window.happyDOM.close();
});
test('application sources contain no browser alert/confirm/prompt calls',()=>{
  for (const file of readdirSync('src',{recursive:true}).filter(file=>/\.(ts|js)$/.test(file))) {
    const source=readFileSync(`src/${file}`,'utf8');
    assert.doesNotMatch(source,/\b(?:window|globalThis|self|defaultView!?)\s*\.\s*(?:alert|confirm|prompt)\s*\(/,file);
  }
});
