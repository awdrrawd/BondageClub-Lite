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

test('both game catalogs contain core actions and item/group names', () => {
  for (const locale of ['zh', 'en']) {
    const catalog = gameCatalog(locale);
    for (const key of ['ActionUse', 'ActionRemove', 'Group.ItemArms']) assert.ok(catalog[key], `${locale}: ${key}`);
    assert.ok(Object.keys(catalog).some(key => key.startsWith('Asset.ItemArms.')));
  }
});
