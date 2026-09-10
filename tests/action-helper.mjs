import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { t } from './i18n-helper.mjs';
import { embeddedAction } from './community-helper.mjs';
const code = stripTypeScriptTypes(readFileSync(new URL('../src/action/render.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
export const { renderAction, formatServerText, dictionaryText } = new Function('t', 'embeddedAction', code + ';return {renderAction,formatServerText,dictionaryText};')(t, embeddedAction);
