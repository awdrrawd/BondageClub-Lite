import { renderAction } from './action-helper.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { t, setLocale, localizeStatus, locales, isLocale } from './i18n-helper.mjs';
import { gameCatalog } from './catalog-helper.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
test('all supported languages validate preferences and relocalize parameterized statuses', () => {
  assert.deepEqual([...locales], ['en', 'de', 'fr', 'ru', 'zh-cn', 'zh', 'uk', 'ja', 'ko']);
  for (const invalid of [undefined, null, {}, 'constructor', 'toString', 'jp', 'kr', 'unknown']) assert.equal(isLocale(invalid), false);
  const login = { en:'Log in', de:'Anmelden', fr:'Se connecter', ru:'Войти', 'zh-cn':'登入', zh:'登入', uk:'Увійти', ja:'ログイン', ko:'로그인' };
  try {
    for (const locale of locales) {
      assert.equal(isLocale(locale), true);
      setLocale(locale);
      assert.equal(t('m082'), login[locale], locale);
      const status = t('m223', ['Room $& 中文']);
      setLocale('en');
      assert.equal(localizeStatus(status), 'Joined “Room $& 中文”', locale);
    }
  } finally { setLocale('zh'); }
});
test('UI locales have identical keys and interpolation parameters', () => {
  const en = read('../src/translations/ui/en.json');
  const tokens = text => [...text.matchAll(/\{\d+\}|SourceCharacter|DestinationCharacter|TargetCharacter|FocusAssetGroup|PrevAsset|NextAsset/g)].map(x => x[0]).sort();
  for (const locale of locales) {
    const dictionary = read(`../src/translations/ui/${locale}.json`);
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(en).sort(), locale);
    for (const key of Object.keys(en)) {
      assert.ok(dictionary[key].trim(), `${locale}: ${key}`);
      assert.doesNotMatch(dictionary[key], /ZXQ|TQXZ|SQXZ/, `${locale}: draft marker in ${key}`);
      assert.deepEqual(tokens(dictionary[key]), tokens(en[key]), `${locale}: ${key}`);
    }
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
  for (const locale of locales) {
    const catalog = gameCatalog(locale);
    for (const key of ['ActionUse', 'ActionRemove', 'Group.ItemArms']) assert.ok(catalog[key], `${locale}: ${key}`);
    assert.ok(Object.keys(catalog).some(key => key.startsWith('Asset.ItemArms.')));
  }
});

test('Japanese and Korean core actions preserve actors, item names and fallback', () => {
 const english=gameCatalog('en');
 for(const locale of ['ja','ko']){
   const catalog=gameCatalog(locale);
   const overrides=read(`../src/translations/overrides/${locale}.json`);
   const tokens=text=>[...text.matchAll(/SourceCharacter|DestinationCharacter|TargetCharacter|NextAsset|PrevAsset|FocusAssetGroup/g)].map(m=>m[0]).sort();
   for(const [key,text]of Object.entries(overrides).filter(([key])=>key.startsWith('Action')))assert.deepEqual(tokens(text),tokens(english[key]),`${locale}: ${key}`);
   assert.notEqual(catalog.ActionUse,english.ActionUse);
   for(const key of Object.keys(english).filter(key=>key.startsWith('Group.')&&Object.hasOwn(overrides,key)))assert.notEqual(catalog[key],english[key]);
   const result=renderAction('ActionUse','Action',[{Tag:'SourceCharacter',Text:'Alice'},{Tag:'DestinationCharacter',Text:'Bob'},{Tag:'NextAsset',AssetName:'HempRope',GroupName:'ItemArms',CraftName:'Custom 中文 =x'},{FocusGroupName:'ItemArms'}],catalog);
   for(const text of ['Alice','Bob','Custom 中文 =x',catalog['Group.ItemArms']])assert.ok(result.includes(text),`${locale}: ${result}`);
   assert.notEqual(catalog.ActionDice,english.ActionDice);
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
