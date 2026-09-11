import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/safety/safeword.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
const pluginSource = stripTypeScriptTypes(readFileSync('src/safety/plugin-appearance.ts','utf8')).replaceAll('export ', '');
const isDecorativePluginItem = new Function(pluginSource + ';return isDecorativePluginItem;')();
export const { validAppearance, copyAppearance, releaseAppearance } = new Function('isDecorativePluginItem', source + '; return {validAppearance,copyAppearance,releaseAppearance};')(isDecorativePluginItem);
