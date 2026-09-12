import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
export const definitions = JSON.parse(readFileSync('src/action/native-data.json', 'utf8'));
const code = stripTypeScriptTypes(readFileSync('src/action/native.ts', 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
export const { nativeActivities, activityReason, activityAvailability, createActivityInventoryCheck, activityAsset } = new Function('definitions', code + ';return {nativeActivities,activityReason,activityAvailability,createActivityInventoryCheck,activityAsset};')(definitions);

export const activityInventoryReason = (actor,target,group,prerequisites=[]) => createActivityInventoryCheck(actor,target)(group,prerequisites);
