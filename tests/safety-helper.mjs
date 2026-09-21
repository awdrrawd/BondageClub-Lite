import { loadTypeScript } from './load-typescript.mjs';
import { resolveItemProperties } from './item-properties-helper.mjs';
const source = loadTypeScript(new URL('../src/safety/safeword.ts', import.meta.url));
const pluginSource = loadTypeScript('src/safety/plugin-appearance.ts');
const isDecorativePluginItem = new Function(pluginSource + ';return isDecorativePluginItem;')();
export const { validAppearance, copyAppearance, releaseAppearance } = new Function('isDecorativePluginItem', 'resolveItemProperties', source + '; return {validAppearance,copyAppearance,releaseAppearance};')(isDecorativePluginItem, resolveItemProperties);
