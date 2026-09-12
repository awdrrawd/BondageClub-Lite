import { renderAction } from './action-helper.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { t, setLocale, localizeStatus } from './i18n-helper.mjs';
import { gameCatalog } from './catalog-helper.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
test('UI locales have identical keys and interpolation parameters', () => {
  const zh = read('../src/translations/ui/zh.json'), en = read('../src/translations/ui/en.json');
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const key of Object.keys(zh)) {
    assert.ok(en[key].trim(), key);
    assert.deepEqual([...zh[key].matchAll(/\{\d+\}/g)].map(x => x[0]).sort(), [...en[key].matchAll(/\{\d+\}/g)].map(x => x[0]).sort(), key);
  }
});

test('language switching interpolates safely and relocalizes known statuses', () => {
  setLocale('zh');
  const original = t('m038', ['Room $& {1}', '', 'Friend']);
  setLocale('en');
  assert.equal(localizeStatus(original), t('m038', ['Room $& {1}', '', 'Friend']));
  assert.equal(localizeStatus('player-authored arbitrary text'), 'player-authored arbitrary text');
  assert.equal(t('composer.placeholder'), 'Message…');
  setLocale('zh');
});

test('all game catalogs contain core actions and item/group names', () => {
  for (const locale of ['zh', 'en', 'ru']) {
    const catalog = gameCatalog(locale);
    for (const key of ['ActionUse', 'ActionRemove', 'Group.ItemArms']) assert.ok(catalog[key], `${locale}: ${key}`);
    assert.ok(Object.keys(catalog).some(key => key.startsWith('Asset.ItemArms.')));
  }
});

 test('Russian UI covers every key, preserves parameters and switches statuses both ways',()=>{
 const en=read('../src/translations/ui/en.json'),ru=read('../src/translations/ui/ru.json');
 assert.deepEqual(Object.keys(ru).sort(),Object.keys(en).sort());
 for(const key of Object.keys(en)){assert.ok(ru[key].trim(),key);const tokens=s=>[...s.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort();assert.deepEqual(tokens(ru[key]),tokens(en[key]),key);}
 setLocale('ru');assert.equal(t('m082'),'Войти');const status=t('m223',['Room']);
 setLocale('en');assert.equal(localizeStatus(status),'Joined “Room”');setLocale('zh');
 const ruCatalog=gameCatalog('ru'),enCatalog=gameCatalog('en');
 for(const key of ['ActionUse','Group.ItemArms','Asset.ItemArms.HempRope'])assert.match(ruCatalog[key],/[А-Яа-я]/,key);
 const plugin=Object.keys(enCatalog).find(key=>key.startsWith('XSAct_'));if(plugin)assert.equal(ruCatalog[plugin],enCatalog[plugin]);
 });

test('Russian actions translate known items but preserve actors and crafted names',()=>{
 const catalog=gameCatalog('ru');
 const dictionary=[{Tag:'SourceCharacter',Text:'Alice'},{Tag:'DestinationCharacter',Text:'Bob'},{Tag:'NextAsset',AssetName:'HempRope',GroupName:'ItemArms'},{FocusGroupName:'ItemArms'}];
 const text=renderAction('ActionUse','Action',dictionary,catalog);
 assert.match(text,/Alice/);assert.match(text,/Bob/);assert.ok(text.includes(catalog['Asset.ItemArms.HempRope']));
 dictionary[2].CraftName='Custom 中文 =x';const crafted=renderAction('ActionUse','Action',dictionary,catalog);assert.ok(crafted.includes('Custom 中文 =x'));
 assert.doesNotMatch(crafted,/SourceCharacter|DestinationCharacter|NextAsset|FocusAssetGroup/);
});
