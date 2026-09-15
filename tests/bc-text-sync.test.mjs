import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fetchBcText, textSources } from '../scripts/fetch-bc-text.mjs';
import { bcTextLocales } from '../scripts/bc-text-locales.mjs';

test('mirror sync pins text downloads, tolerates missing translations and rejects stale directories', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bc-text-test-'));
  const calls = [], sha = 'a'.repeat(40);
  try {
    await fetchBcText(root, async url => {
      calls.push(url);
      if (url.includes('api.github.com')) return Response.json({sha});
      assert.ok(url.includes(`/${sha}/`));
      assert.match(url, /(?:\.csv|_(?:CN|TW|RU|DE|FR|UA|JP|KR)\.txt)$/);
      return url.endsWith('.csv') ? new Response('Key,Text\n') : new Response('', {status:404});
    });
    assert.equal(calls.length, 1 + textSources.length * (1 + Object.keys(bcTextLocales).length));
    for (const source of textSources) for (const suffix of Object.values(bcTextLocales)) assert.ok(calls.some(url => url.endsWith(`${source}_${suffix}.txt`)));
    assert.match(readFileSync(join(root,'PR.md'),'utf8'), new RegExp(sha));
    await assert.rejects(fetchBcText(root), /empty/);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, {recursive:true,force:true});
  }
});

test('extractor preserves missing locales without retaining stale sources or overriding fresh translations', () => {
  const root=mkdtempSync(join(tmpdir(),'bc-text-preserve-'));
  const write=(path,text)=>{const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,text);};
  try {
    for(const source of textSources) write(`upstream/${source}.csv`,source.endsWith('/Female3DCG')?'ItemArms,,Arms\n':'');
    write('upstream/Screens/Interface.csv','ActionKeep,SourceCharacter waves.\nActionFresh,SourceCharacter smiles.\nActionChanged,SourceCharacter nods now.\n');
    write('upstream/Screens/Interface_DE.txt','SourceCharacter smiles.\nSourceCharacter lächelt neu.\n');
    const previous={ActionKeep:'SourceCharacter waves.',ActionFresh:'SourceCharacter smiles.',ActionChanged:'SourceCharacter nods.',ActionRemoved:'Removed'};
    write('src/translations/bc/actions/en.json',JSON.stringify(previous));
    for(const locale of Object.keys(bcTextLocales)) write(`src/translations/bc/actions/${locale}.json`,JSON.stringify({ActionKeep:`${locale} SourceCharacter retained`,ActionFresh:`${locale} SourceCharacter old`,ActionChanged:'stale',ActionRemoved:'stale'}));
    const result=spawnSync(process.execPath,[resolve('scripts/build-text-catalog.mjs'),join(root,'upstream')],{cwd:root,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    for(const locale of Object.keys(bcTextLocales)) {
      const dictionary=JSON.parse(readFileSync(join(root,`src/translations/bc/actions/${locale}.json`),'utf8'));
      assert.equal(dictionary.ActionKeep,`${locale} SourceCharacter retained`);
      assert.equal(dictionary.ActionFresh,locale==='de'?'SourceCharacter lächelt neu.':`${locale} SourceCharacter old`);
      assert.equal(dictionary.ActionChanged,undefined);
      assert.equal(dictionary.ActionRemoved,undefined);
    }
  } finally {
    assert.equal(dirname(resolve(root)),resolve(tmpdir()));
    rmSync(root,{recursive:true,force:true});
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
