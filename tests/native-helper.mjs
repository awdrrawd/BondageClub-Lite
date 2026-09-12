import { loadTypeScript } from './load-typescript.mjs';
import { readFileSync } from 'node:fs';
export const definitions = JSON.parse(readFileSync('src/action/native-data.json', 'utf8'));
const code = loadTypeScript('src/action/native.ts');
export const { nativeActivities, activityReason, activityAvailability, createActivityInventoryCheck, activityAsset } = new Function('definitions', code + ';return {nativeActivities,activityReason,activityAvailability,createActivityInventoryCheck,activityAsset};')(definitions);

export const activityInventoryReason = (actor,target,group,prerequisites=[]) => createActivityInventoryCheck(actor,target)(group,prerequisites);
