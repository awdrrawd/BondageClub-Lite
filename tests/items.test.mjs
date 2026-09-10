import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractItems } from '../scripts/build-item-catalog.mjs';
import { bcCategory } from '../scripts/catalog-utils.mjs';
import { gameCatalog } from './catalog-helper.mjs';
import { renderAction } from './action-helper.mjs';

test('BC text categories are disjoint and use their expected namespaces', () => {
  const seen = new Set();
  for (const category of ['messages', 'actions', 'items', 'groups']) {
    const base = JSON.parse(readFileSync(`src/translations/bc/${category}/en.json`, 'utf8'));
    const delta = JSON.parse(readFileSync(`src/translations/bc/${category}/zh.json`, 'utf8'));
    assert.ok(Object.keys(base).length > 0);
    for (const key of Object.keys(base)) { assert.equal(bcCategory(key), category); assert.ok(!seen.has(key)); seen.add(key); }
    for (const [key, text] of Object.entries(delta)) { assert.ok(Object.hasOwn(base, key)); assert.notEqual(text, base[key]); }
  }
});

test('literal extraction supports groups, batches, variables and explicit old-name fixups', () => {
  const data = extractItems(`
    const asset = { Name: 'Example' };
    const config = { translation: { EN: 'Example Item', CN: '範例物品' } };
    const groups = ['ItemArms', 'ItemLegs'];
    const definitions = [{ groupDef: { Group: 'Custom' }, description: { EN: 'Custom Group', CN: '自訂部位' } }];
    export default function () {
      AssetManager.addAssetWithConfig(groups, asset, config);
      AssetManager.addAssetWithConfig(['ItemFeet', [[asset, config]]]);
      AssetManager.addAssetWithConfig([['ItemHands', asset, config]]);
      luziSuffixFixups(groups, asset.Name);
      AssetManager.addAssetWithConfig('ItemHead', makeDynamicAsset(), config);
    }
  `);
  assert.equal(data.items.en['Asset.ItemArms.Example'], 'Example Item');
  assert.equal(data.items.zh['Asset.ItemArms.Example_Luzi'], '範例物品');
  assert.equal(data.items.en['Asset.ItemFeet.Example'], 'Example Item');
  assert.equal(data.items.en['Asset.ItemHands.Example'], 'Example Item');
  assert.equal(data.groups.zh['Group.Custom'], '自訂部位');
  assert.equal(data.skipped, 1);
  assert.ok(!Object.keys(data.items.en).some(key => key.includes('ItemHead')));
});

test('ECHO item and group names render without assets; craft names and unknown names remain literal', () => {
  const en = gameCatalog('en'), zh = gameCatalog('zh');
  assert.equal(en['Asset.Garters.枪套'], 'Holster');
  assert.equal(zh['Asset.Garters.枪套'], '枪套');
  assert.equal(en['Asset.Garters.枪套_Luzi'], 'Holster');
  assert.ok(en['Group.左眼_Luzi']);
  const dictionary = [{ Tag: 'NextAsset', AssetName: '枪套', GroupName: 'Garters' }];
  assert.equal(renderAction('TestItem', 'Action', dictionary, { ...en, TestItem: 'NextAsset' }), 'Holster');
  assert.equal(renderAction('TestItem', 'Action', dictionary, { ...zh, TestItem: 'NextAsset' }), '枪套');
  assert.equal(renderAction('TestItem', 'Action', [{ ...dictionary[0], CraftName: '<private-name>' }], { ...en, TestItem: 'NextAsset' }), '<private-name>');
  assert.equal(renderAction('TestItem', 'Action', [{ ...dictionary[0], AssetName: 'UnknownPluginItem' }], { ...en, TestItem: 'NextAsset' }), 'UnknownPluginItem');
});

test('extraction never substitutes a global asset for a shadowing callback parameter', () => {
  const data = extractItems(`
    const asset = { Name: 'Global' };
    const config = { translation: { EN: 'Global Item' } };
    export default function (asset) {
      AssetManager.addAssetWithConfig('ItemArms', asset, config);
    }
  `);
  assert.deepEqual(data.items.en, {});
  assert.equal(data.skipped, 1);
});
