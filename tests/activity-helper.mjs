import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { validAppearance } from './safety-helper.mjs';
const source = path => stripTypeScriptTypes(readFileSync(path, 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
export const { hasPenis, physicalGroup, textGroup, activityLabel, canonicalPartGroup } = new Function(source('src/action/labels.ts') + ';return {hasPenis, physicalGroup, textGroup, activityLabel, canonicalPartGroup};')();
export const { cuddleNames, cuddleReason, cuddleState, createCuddleItem } = new Function('validAppearance', source('src/action/cuddle.ts') + ';return {cuddleNames, cuddleReason, cuddleState, createCuddleItem};')(validAppearance);
