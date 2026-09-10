import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const zh = JSON.parse(readFileSync(new URL('../src/locales/zh.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
const source = stripTypeScriptTypes(readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
export const { t, getLocale, setLocale, localizeStatus } = new Function('zh', 'en', source + '; return {t,getLocale,setLocale,localizeStatus};')(zh, en);
