import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gameCatalog } from './catalog-helper.mjs';

test('refreshing English-only LSCG source preserves maintained Chinese messages', t => {
  const root=mkdtempSync(join(tmpdir(),'lite-plugin-catalog-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const write=(file,text)=>{const path=join(root,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);};
  write('XiaoSuActivity/src/Modules/MActivity.ts',"const activity={act:{Name:'XSAct_眯眼',Target:[],TargetSelf:['ItemHead']}};");
  for(const language of ['TW','EN','CN','DE','FR','RU','UA']) write(`XiaoSuActivity/translation/${language}.json`,JSON.stringify({Activity:{'眯眼':`${language} label`,'眯眼.Desc.1':`{0} ${language} message`}}));
  write('BCJS/LSCG-main/src/Modules/activities.ts',`const bundle={Activity:{Name:'Bap'},Targets:[{Name:'ItemHead',TargetAction:'SourceCharacter baps TargetCharacter.'}]};`);
  mkdirSync(join(root,'BCJS/echo-activity-ext-main/src/components'),{recursive:true});
  write('lite/src/translations/action/lscg/zh.json','{"ChatOther-ItemHead-LSCG_Bap":"SourceCharacter 輕拍 TargetCharacter。"}');
  const result=spawnSync(process.execPath,[resolve('scripts/build-plugin-catalog.mjs')],{cwd:join(root,'lite'),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const zh=JSON.parse(readFileSync(join(root,'lite/src/translations/action/lscg/zh.json'),'utf8'));
  assert.equal(zh['ChatOther-ItemHead-LSCG_Bap'],'SourceCharacter 輕拍 TargetCharacter。');
  for(const [locale,language] of Object.entries({'zh-cn':'CN',de:'DE',fr:'FR',ru:'RU',uk:'UA'})) {
    const dictionary=JSON.parse(readFileSync(join(root,`lite/src/translations/action/xiaosu/${locale}.json`),'utf8'));
    assert.equal(dictionary['Label-ChatSelf-ItemHead-XSAct_眯眼'],`${language} label`);
    assert.equal(dictionary['ChatSelf-ItemHead-XSAct_眯眼'],`SourceCharacter ${language} message`);
  }
});

test('LSCG Chinese covers every bundled message and label', () => {
  const en = JSON.parse(readFileSync('src/translations/action/lscg/en.json', 'utf8'));
  const zh = JSON.parse(readFileSync('src/translations/action/lscg/zh.json', 'utf8'));
  for (const [key, value] of Object.entries(en)) {
    assert.ok(zh[key], key);
    assert.notEqual(zh[key], value, key);
  }
});

test('plugin rules retain native prerequisites and appended or dynamic checks', () => {
  const rules = JSON.parse(readFileSync('src/action/extension-rules.json', 'utf8'));
  assert.deepEqual(rules['lscg:LSCG_Bap'], ['UseArms']);
  assert.ok(rules['lscg:LSCG_ReleaseHand'].includes('TargetIsHandLeashed'));
  assert.ok(rules['xiaosu:XSAct_眯眼'].includes('CanLook'));
  assert.ok(rules['echo:手指插进阴道'].includes('UseHands'));
  assert.ok(rules['echo:手指插进阴道'].includes('UnsupportedPluginPrerequisite'));
  const entries = JSON.parse(readFileSync('src/action/extension-data.json', 'utf8'));
  assert.ok(entries.every(entry => Array.isArray(entry.prerequisites)));
});

test('literal plugin catalogs cover all three sources without runtime code', () => {
  for (const locale of ['zh', 'en']) {
    const catalog = gameCatalog(locale);
    assert.ok(Object.keys(catalog).length >= 400);
    assert.ok(catalog['ChatSelf-ItemHead-XSAct_眯眼']);
    assert.ok(catalog['ChatOther-ItemHead-LSCG_Bap']);
    assert.ok(catalog['ChatOther-ItemHead-撇眼']);
    assert.ok(Object.values(catalog).every(value => typeof value === 'string'));
  }
});

test('plugin locale files are sparse overrides of their individual English bases', () => {
  for (const name of ['xiaosu', 'lscg', 'echo']) {
    const read = locale => JSON.parse(readFileSync(new URL(`../src/translations/action/${name}/${locale}.json`, import.meta.url), 'utf8'));
    const base = read('en');
    for (const [key, value] of Object.entries(read('zh'))) assert.notEqual(value, base[key], key);
  }
});
