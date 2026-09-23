import { loadTypeScript } from './load-typescript.mjs';
import { resolveItemProperties } from './item-properties-helper.mjs';
import { readFileSync } from 'node:fs';
export const definitions = JSON.parse(readFileSync('src/action/native-data.json', 'utf8'));
const code = loadTypeScript('src/action/native.ts');
export const { nativeActivities, activityReason, activityAvailability, createActivityInventoryCheck, activityAssets } = new Function('definitions', 'resolveItemProperties', code + ';return {nativeActivities,activityReason,activityAvailability,createActivityInventoryCheck,activityAssets};')(definitions, resolveItemProperties);

export const activityInventoryReason = (actor,target,group,prerequisites=[]) => createActivityInventoryCheck(actor,target)(group,prerequisites);
