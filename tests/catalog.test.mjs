import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { compileCatalogs, packCatalogs } from '../scripts/compile-action-catalogs.mjs';
import { localeDelta, writeJson } from '../scripts/catalog-utils.mjs';

const mergeCode = stripTypeScriptTypes(readFileSync('src/action/merge.ts', 'utf8')).replaceAll('export ', '');
const mergeCatalog = new Function(mergeCode + '; return mergeCatalog;')();

test('generated catalogs match editable sources and roundtrip without lost dialogues', () => {
  const catalogs = compileCatalogs();
  for (const locale of ['en', 'zh']) {
    const complete = { ...catalogs.en, ...(locale === 'en' ? {} : catalogs[locale]) };
    const emitted = JSON.parse(readFileSync(`src/action/generated/${locale}.json`, 'utf8'));
    assert.deepEqual(emitted, packCatalogs(catalogs)[locale]);
    assert.deepEqual(mergeCatalog(catalogs.en, locale === 'en' ? undefined : emitted), complete);
  }
});

test('locale deltas omit untranslated copies and retain locale-only keys', () => {
  assert.deepEqual(localeDelta({ same: 'same', changed: 'English' }, { same: 'same', changed: '中文', extra: 'new' }), { changed: '中文', extra: 'new' });
  const { en, zh } = compileCatalogs();
  for (const [key, value] of Object.entries(zh)) assert.notEqual(value, en[key]);
});

test('runtime loader requests only shared base and selected-language delta', async () => {
  const source = stripTypeScriptTypes(readFileSync('src/action/catalog.ts', 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/const chunks = .*;/, '').replaceAll('export ', '');
  const requests = [];
  const chunks = Object.fromEntries(['en', 'zh', 'fr'].map(locale => [`./generated/${locale}.json`, async () => { requests.push(locale); return locale === 'en' ? { a: 'English', b: 'fallback' } : [[0, locale]]; }]));
  const load = new Function('chunks', 'mergeCatalog', source + '; return loadTextCatalog;')(chunks, mergeCatalog);
  assert.deepEqual(await load('en'), { a: 'English', b: 'fallback' });
  assert.deepEqual(requests, ['en']); requests.length = 0;
  assert.deepEqual(await load('zh'), { a: 'zh', b: 'fallback' });
  assert.deepEqual(requests, ['en', 'zh']);
});

test('packed locale additions preserve fallback and reject invalid base indexes', () => {
  const packed = packCatalogs({ en: { a: 'a' }, zh: { a: '甲', extra: '新增' } });
  assert.deepEqual(mergeCatalog(packed.en, packed.zh), { a: '甲', extra: '新增' });
  assert.throws(() => mergeCatalog({ a: 'a' }, [[99, 'bad']]));
});

test('compiler discovers new plugins and locales, preserves manual override priority and fallback', t => {
  const root = mkdtempSync(join(tmpdir(), 'bc-lite-catalog-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, dictionary) => writeJson(join(root, file), dictionary);
  write('bc/en.json', { Native: 'English', Fallback: 'Untranslated' });
  write('bc/zh.json', { Native: '上游中文' });
  write('action/demo/en.json', { Plugin: 'Plugin English' });
  write('action/demo/zh.json', { Plugin: '插件中文' });
  write('overrides/en.json', { Native: 'Reviewed English' });
  write('overrides/zh.json', { Native: '人工中文' });
  write('overrides/fr.json', { Plugin: 'Français' });
  const data = compileCatalogs(root);
  assert.deepEqual({ ...data.en, ...data.zh }, { Native: '人工中文', Fallback: 'Untranslated', Plugin: '插件中文' });
  assert.deepEqual({ ...data.en, ...data.fr }, { Native: 'Reviewed English', Fallback: 'Untranslated', Plugin: 'Français' });
  write('action/duplicate/en.json', { Native: 'Duplicate' });
  assert.throws(() => compileCatalogs(root), /Duplicate action key/);
});

test('compiler rejects blank or non-string translation values', t => {
  const root = mkdtempSync(join(tmpdir(), 'bc-lite-catalog-validation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, dictionary) => writeJson(join(root, file), dictionary);
  write('bc/en.json', { Native: 'English' });
  write('action/demo/en.json', { Plugin: 'English' });
  write('overrides/en.json', {});
  for (const value of [' ', 42, { script: 'not allowed' }]) {
    write('overrides/zh.json', { Native: value });
    assert.throws(() => compileCatalogs(root), /Invalid text dictionary/);
  }
});
