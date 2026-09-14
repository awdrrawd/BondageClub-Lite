import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileCatalogs,packCatalogs} from '../scripts/compile-action-catalogs.mjs';
import {actionKey,tokens,protect,restore} from '../scripts/translate-action-catalogs.mjs';
import {reviewedLabel,reviewedMessage} from '../scripts/refine-action-translations.mjs';
import {renderAction} from './action-helper.mjs';
import {activityLabel} from './activity-helper.mjs';

const catalogs=compileCatalogs();
const languages=['de','fr','ru','uk','zh-cn','zh','ja','ko'];
const keys=Object.keys(catalogs.en).filter(actionKey);
const read=locale=>JSON.parse(readFileSync(`src/translations/overrides/${locale}.json`,'utf8'));

test('every supported language explicitly covers messages and activity labels',()=>{
  assert.ok(keys.length>=2175);
  for(const locale of languages) {
    const overrides=read(locale);
    for(const key of keys) {
      // Identical spellings such as French Massage are valid explicit translations.
      assert.ok(Object.hasOwn(catalogs[locale],key)||Object.hasOwn(overrides,key),`${locale}: ${key}`);
      const value=overrides[key]||catalogs[locale][key];
      assert.ok(value.trim(),`${locale}: ${key}`);
      assert.doesNotMatch(value,/⟦|⟧|MISSING TEXT|MISSING ACTIVITY|STRING_RETRIEVAL_FAILED/,`${locale}: ${key}`);
    }
  }
});

test('translation drafts preserve overlapping character, item and pronoun placeholders',()=>{
  const original='SourceCharacter TargetCharacter ActivityPlushieAsset ActivityPlushieAssetMine TargetCharacterName PronounPossessive ActivityAsset {0}';
  const protectedText=protect(original);
  assert.equal(restore(protectedText.text,protectedText.names),original);
  assert.throws(()=>restore('⟦99⟧',protectedText.names));
});

test('new translations retain source placeholders from English or the Chinese reference',()=>{
  for(const locale of ['de','fr','ru','uk','zh-cn','ja','ko']) {
    for(const [key,value] of Object.entries(read(locale)).filter(([key])=>actionKey(key))) {
      if(!catalogs.en[key]) continue;
      const actual=JSON.stringify(tokens(value).sort());
      const candidates=[catalogs.en[key],catalogs.zh[key]].filter(Boolean).map(v=>JSON.stringify(tokens(v).sort()));
      assert.ok(candidates.includes(actual),`${locale}: ${key}: ${actual}`);
    }
  }
});

test('Japanese and Korean actions contain no residual English except proper names',()=>{
  for(const locale of ['ja','ko']) for(const key of keys) {
    let value=catalogs[locale][key]||catalogs.en[key];
    for(const token of tokens(value))value=value.replaceAll(token,'');
    value=value.replaceAll('GGTS','');
    assert.doesNotMatch(value,/[A-Za-z]{3}/,`${locale}: ${key}`);
  }
});

test('reviewed labels distinguish affection, pets, body parts and source of an action',()=>{
  assert.equal(reviewedLabel('Nuzzle','ja'),'すり寄る');
  assert.equal(reviewedLabel('Pet','ko'),'쓰다듬기');
  assert.equal(reviewedLabel('Squint','ko'),'눈 가늘게 뜨기');
  assert.equal(reviewedLabel('Bite Arm','ja'),'腕を噛む');
  assert.equal(reviewedMessage("SourceCharacter bites TargetCharacter's arm.",'ja'),'SourceCharacterはTargetCharacterの腕を噛みます。');
});

test('packed language changes translate both buttons and incoming plugin messages',()=>{
  const packed=packCatalogs(catalogs), baseKeys=Object.keys(packed.en);
  const key='ChatOther-ItemHead-LSCG_Nuzzle';
  const dictionary=[{Tag:'SourceCharacter',Text:'Alice'},{Tag:'TargetCharacter',Text:'Bob'},{Tag:`MISSING TEXT IN "ActivityDictionary.csv": ${key}`,Text:'English fallback'}];
  for(const locale of languages) {
    const catalog={...packed.en,...Object.fromEntries(packed[locale].map(([key,value])=>[typeof key==='number'?baseKeys[key]:key,value]))};
    const label=activityLabel('LSCG_Nuzzle','ItemHead',{},false,catalog);
    const message=renderAction(key,'Activity',dictionary,catalog);
    assert.notEqual(label,'Nuzzle',locale);
    assert.notEqual(message,'English fallback',locale);
    assert.match(message,/Alice/);assert.match(message,/Bob/);
    assert.doesNotMatch(message,/SourceCharacter|TargetCharacter/);
  }
});
