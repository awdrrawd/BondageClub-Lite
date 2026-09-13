import { loadTypeScript } from './load-typescript.mjs';
import { readFileSync } from 'node:fs';
import { renderAction, pronounEntries } from './action-helper.mjs';
import { textGroup } from './activity-helper.mjs';
const entries = JSON.parse(readFileSync('src/action/extension-data.json', 'utf8'));
const source = loadTypeScript('src/action/extensions.ts');
export const { extensionActivities, extensionText } = new Function('entries', 'renderAction', 'pronounEntries', 'textGroup', source + ';return { extensionActivities, extensionText };')(entries, renderAction, pronounEntries, textGroup);
