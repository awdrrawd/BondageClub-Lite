import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gameCatalog } from './catalog-helper.mjs';

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
