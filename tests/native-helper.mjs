import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
export const definitions = JSON.parse(readFileSync('src/action/native-data.json', 'utf8'));
const code = stripTypeScriptTypes(readFileSync('src/action/native.ts', 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
export const { nativeActivities, activityReason, activityInventoryReason, createActivityInventoryCheck } = new Function('definitions', code + ';return {nativeActivities,activityReason,activityInventoryReason,createActivityInventoryCheck};')(definitions);
