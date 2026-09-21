import { readFileSync } from 'node:fs';
import { loadTypeScript } from './load-typescript.mjs';
const catalog = JSON.parse(readFileSync('src/action/item-properties-data.json', 'utf8'));
const definitions = JSON.parse(readFileSync('src/action/native-data.json', 'utf8'));
export const resolveItemProperties = new Function('catalog', 'definitions', loadTypeScript('src/action/item-properties.ts') + ';return resolveItemProperties;')(catalog, definitions);
