import test from 'node:test';
import assert from 'node:assert/strict';
import { activityReason, activityInventoryReason, definitions } from './native-helper.mjs';
const character = id => ({ MemberNumber: id, Name: 'Test', AssetFamily: 'Female3DCG', Appearance: [{ Group: 'BodyUpper', Name: definitions.bodies.BodyUpper[0] }], ArousalSettings: { Active: 'Manual', Activity: 'z'.repeat(100), Zone: 'f'.repeat(30) } });

test('inventory prerequisites inspect both characters and union runtime properties with native effects', () => {
  const actor = character(1), target = character(2);
  actor.Appearance[0].Property = { Effect:['Block', 'MergedFingers', 'Freeze'] };
  assert.equal(activityInventoryReason(actor, target, 'ItemHands', ['UseHands']), 'native.blocked');
  assert.equal(activityInventoryReason(actor, target, 'ItemBoots', ['UseFeet']), 'native.blocked');
  actor.Appearance[0].Property = {};
  target.Appearance[0].Property = { Effect:['BlockMouth', 'FixedHead'] };
  assert.equal(activityInventoryReason(actor, target, 'ItemMouth', ['TargetCanUseTongue']), 'native.blocked');
  assert.equal(activityInventoryReason(actor, target, 'ItemHead', ['MoveHead']), 'native.blocked');
  target.Appearance[0].Property = { Effect:['Enclose'] };
  assert.equal(activityInventoryReason(actor, target, 'ItemEars'), 'native.blocked');
  target.Appearance[0].Property = {};
  actor.Appearance.push({ Group:'ItemMouth', Name:'BallGag', Property:{ Effect:[] } });
  assert.equal(activityInventoryReason(actor, target, 'ItemEars', ['UseMouth']), 'native.blocked');
});

test('zone blocking honors native AllowActivityOn and unknown prerequisites remain blocked', () => {
  const actor = character(1), target = character(2);
  const key = Object.keys(definitions.items).find(key => key.startsWith('Item') && !definitions.items[key].unknown);
  const [Group, Name] = key.split('/');
  target.Appearance.push({ Group, Name, Property:{ Block:['ItemEars'] } });
  assert.equal(activityInventoryReason(actor, target, 'ItemEars', ['ZoneAccessible']), 'native.blocked');
  target.Appearance.at(-1).Property.AllowActivityOn = ['ItemEars'];
  assert.equal(activityInventoryReason(actor, target, 'ItemEars', ['ZoneAccessible']), null);
  assert.equal(activityInventoryReason(actor, target, 'ItemEars', ['Needs-Unknown']), 'native.unsupported');
});

test('online bundles inherit native family and explicit refusals precede inventory limitations', () => {
  const actor = character(1), target = character(2);
  delete actor.AssetFamily; delete target.AssetFamily;
  assert.equal(activityReason(actor, target, 'ItemEars', 'Whisper', {}), null);
  actor.Appearance.push({ Group: 'Cloth', Name: 'Dress' });
  target.ArousalSettings.Zone = 'd'.repeat(30);
  assert.equal(activityReason(actor, target, 'ItemEars', 'Whisper', {}), 'native.permission');
  target.ArousalSettings.Zone = 'f'.repeat(30);
  target.ArousalSettings.Active = 'Inactive';
  assert.equal(activityReason(actor, target, 'ItemEars', 'Whisper', {}), 'native.permission');
});

test('native activity prerequisites fail closed on missing data, equipment, local effects and room restrictions', () => {
  const actor = character(1), target = character(2);
  assert.equal(activityReason(actor, target, 'ItemEars', 'Whisper', {}), null);
  assert.equal(activityReason({ ...actor, Appearance: [] }, target, 'ItemEars', 'Whisper', {}), 'native.data');
  assert.equal(activityReason({ ...actor, Appearance: [{ Group: 'ItemMouth', Name: 'BallGag' }] }, target, 'ItemEars', 'Whisper', {}), 'native.blocked');
  assert.equal(activityReason({ ...actor, ArousalSettings: { ...actor.ArousalSettings, Active: 'Automatic' } }, target, 'ItemEars', 'Whisper', {}), 'native.actor');
  assert.equal(activityReason(actor, target, 'ItemEars', 'Whisper', { BlockCategory: ['Arousal'] }), 'native.room');
  assert.equal(activityReason(actor, target, 'ItemEars', 'Whisper', { MapType: 'Grid' }), 'native.room');
  assert.equal(activityReason(actor, { ...target, ArousalSettings: { ...target.ArousalSettings, Activity: 'd'.repeat(100) } }, 'ItemEars', 'Whisper', {}), 'native.permission');
  assert.equal(activityReason(actor, target, 'ItemEars', 'Unknown', {}), 'native.target');
});
