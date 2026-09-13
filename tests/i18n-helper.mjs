import { loadTypeScript } from './load-typescript.mjs';
import { readFileSync } from 'node:fs';
const imports = [...readFileSync(new URL('../src/i18n/index.ts', import.meta.url), 'utf8').matchAll(/import (\w+) from "..\/translations\/ui\/([\w-]+)\.json"/g)];
const dictionaries = imports.map(([, , locale]) => JSON.parse(readFileSync(new URL(`../src/translations/ui/${locale}.json`, import.meta.url), 'utf8')));
const source = loadTypeScript(new URL('../src/i18n/index.ts', import.meta.url));
export const { t, getLocale, setLocale, localizeStatus, locales, isLocale } = new Function(...imports.map(([, name]) => name), source + '; return {t,getLocale,setLocale,localizeStatus,locales,isLocale};')(...dictionaries);
