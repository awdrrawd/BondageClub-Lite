import { loadTypeScript } from './load-typescript.mjs';
import { validAppearance } from './safety-helper.mjs';
const source = path => loadTypeScript(path);
export const { hasPenis, physicalGroup, textGroup, activityLabel, canonicalPartGroup } = new Function(source('src/action/labels.ts') + ';return {hasPenis, physicalGroup, textGroup, activityLabel, canonicalPartGroup};')();
export const { cuddleNames, cuddleReason, cuddleState, createCuddleItem } = new Function('validAppearance', source('src/action/cuddle.ts') + ';return {cuddleNames, cuddleReason, cuddleState, createCuddleItem};')(validAppearance);
