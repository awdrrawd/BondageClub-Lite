import test from 'node:test';
import assert from 'node:assert/strict';
import { activityReason, definitions } from './native-helper.mjs';
const character = id => ({ MemberNumber: id, Name: 'Test', AssetFamily: 'Female3DCG', Appearance: [{ Group: 'BodyUpper', Name: definitions.bodies.BodyUpper[0] }], ArousalSettings: { Active: 'Manual', Activity: 'z'.repeat(100), Zone: 'f'.repeat(30) } });

test('native activity prerequisites fail closed on missing data, equipment, local effects and room restrictions', () => {
  const actor = character(1), target = character(2);
  assert.equal(activityReason(actor, target, 'ItemEars', 'Whisper', {}), null);
  assert.equal(activityReason({ ...actor, Appearance: [] }, target, 'ItemEars', 'Whisper', {}), 'native.data');
  assert.equal(activityReason({ ...actor, Appearance: [{ Group: 'ItemMouth', Name: 'BallGag' }] }, target, 'ItemEars', 'Whisper', {}), 'native.equipment');
  assert.equal(activityReason({ ...actor, ArousalSettings: { ...actor.ArousalSettings, Active: 'Automatic' } }, target, 'ItemEars', 'Whisper', {}), 'native.actor');
  assert.equal(activityReason(actor, target, 'ItemEars', 'Whisper', { BlockCategory: ['Arousal'] }), 'native.room');
  assert.equal(activityReason(actor, target, 'ItemEars', 'Whisper', { MapType: 'Grid' }), 'native.room');
  assert.equal(activityReason(actor, { ...target, ArousalSettings: { ...target.ArousalSettings, Activity: 'd'.repeat(100) } }, 'ItemEars', 'Whisper', {}), 'native.permission');
  assert.equal(activityReason(actor, target, 'ItemEars', 'Unknown', {}), 'native.target');
});
