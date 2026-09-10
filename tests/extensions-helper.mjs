import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { renderAction } from './action-helper.mjs';
const entries = JSON.parse(readFileSync('src/action/extension-data.json', 'utf8'));
const source = stripTypeScriptTypes(readFileSync('src/action/extensions.ts', 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
export const { extensionActivities, extensionText } = new Function('entries', 'renderAction', source + ';return { extensionActivities, extensionText };')(entries, renderAction);
