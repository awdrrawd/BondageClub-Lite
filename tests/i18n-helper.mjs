import { loadTypeScript } from './load-typescript.mjs';
import { readFileSync } from 'node:fs';
const zh = JSON.parse(readFileSync(new URL('../src/translations/ui/zh.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../src/translations/ui/en.json', import.meta.url), 'utf8'));
const ru = JSON.parse(readFileSync(new URL('../src/translations/ui/ru.json', import.meta.url), 'utf8'));
const source = loadTypeScript(new URL('../src/i18n/index.ts', import.meta.url));
export const { t, getLocale, setLocale, localizeStatus } = new Function('zh', 'en', 'ru', source + '; return {t,getLocale,setLocale,localizeStatus};')(zh, en, ru);
