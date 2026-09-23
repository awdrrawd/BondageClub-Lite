import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveItemProperties } from './item-properties-helper.mjs';
import { activityInventoryReason } from './native-helper.mjs';
import { releaseAppearance } from './safety-helper.mjs';
import { loadTypeScript } from './load-typescript.mjs';
import { interactionPermission } from './permissions-helper.mjs';
import { definitions } from './native-helper.mjs';

test('R132 omitted derived Block retains the same activity restriction as a full bundle', () => {
  const actor = { MemberNumber: 1, Appearance: [] };
  const raw = { TypeRecord: { typed: 1 } };
  const item = { Group: 'ItemArms', Name: 'DuctTape', Property: raw };
  const target = { MemberNumber: 2, Appearance: [item] };
  assert.equal(activityInventoryReason(actor, target, 'ItemButt', ['ZoneAccessible']), 'native.blocked');
  item.Property = { ...raw, Block: ['ItemVulva', 'ItemButt', 'ItemPelvis', 'ItemVulvaPiercings'] };
  assert.equal(activityInventoryReason(actor, target, 'ItemButt', ['ZoneAccessible']), 'native.blocked');
  item.Property = { TypeRecord: { typed: 0 } };
  assert.equal(activityInventoryReason(actor, target, 'ItemButt', ['ZoneAccessible']), null);
  assert.deepEqual(raw, { TypeRecord: { typed: 1 } });
});

test('R132 default typed properties, modular partial records, locks and leashes decode without mutation', () => {
  assert.deepEqual(resolveItemProperties('ItemMouth', 'DuctTape').property.Effect, ['GagVeryLight']);
  const raw = { TypeRecord: { d: 1 }, LockedBy: 'MetalPadlock', IsLeashed: true, Plugin: { keep: 1 } };
  const before = JSON.stringify(raw);
  const { property, unknown } = resolveItemProperties('ItemDevices', 'Kennel', raw);
  assert.equal(unknown, false);
  for (const effect of ['Freeze', 'OneWayEnclose', 'Lock', 'IsLeashed']) assert.ok(property.Effect.includes(effect));
  assert.equal(JSON.stringify(raw), before);
  assert.deepEqual(resolveItemProperties('Plugin', 'Custom', raw).property.Plugin, { keep: 1 });
});

test('default and partial TypeRecord values are restored for permission checks without changing wire bundles',()=>{
  const raw={TypeRecord:{d:1},Custom:'preserve'};
  const before=JSON.stringify(raw);
  const result=resolveItemProperties('ItemDevices','Kennel',raw);
  assert.equal(result.property.TypeRecord.d,1);
  assert.ok(Object.keys(result.property.TypeRecord).length>1);
  assert.deepEqual(resolveItemProperties('ItemMouth','DuctTape').property.TypeRecord,{typed:0});
  assert.equal(JSON.stringify(raw),before);
});

test('R132 inherited configurations and vibration modes retain derived effects', () => {
  assert.deepEqual(resolveItemProperties('ItemDevices', 'SmallLocker', { TypeRecord: { typed: 1 } }).property.Effect, ['GagLight', 'BlindHeavy']);
  assert.ok(resolveItemProperties('ItemVulva', 'VibratingEgg', { TypeRecord: { vibrating: 1 } }).property.Effect.includes('Vibrating'));
  const child = resolveItemProperties('ItemDevices', 'FuturisticCrate', { TypeRecord: { d: 1, d1: 1 } });
  assert.equal(child.unknown, false);
  for (const effect of ['Freeze', 'VulvaShaft', 'Vibrating']) assert.ok(child.property.Effect.includes(effect));
});

test('R132 invalid variants preserve explicit restrictions without invalidating unrelated activities', () => {
  const actor = { MemberNumber: 1, Appearance: [] };
  const target = { MemberNumber: 2, Appearance: [{ Group: 'ItemArms', Name: 'DuctTape', Property: { TypeRecord: { typed: 999 } } }] };
  assert.equal(activityInventoryReason(actor, target, 'ItemHead', ['CanLook']), null);
  target.Appearance[0].Property.Block = ['ItemButt'];
  assert.equal(activityInventoryReason(actor, target, 'ItemButt', ['ZoneAccessible']), 'native.blocked');
  assert.equal(resolveItemProperties('ItemMouth', 'DuctTape', { TypeRecord: [] }).unknown, true);
  assert.equal(resolveItemProperties('ItemMouth', 'DuctTape', { Effect: 'GagLight' }).unknown, true);
});

test('R132 safeword resets restrictive minimized collars but preserves decorative variants and crafts', () => {
  const collar = { Group: 'ItemNeck', Name: 'SlaveCollar', Property: { TypeRecord: { noarch: 12 } }, Craft: { Name: 'custom', Effects: { Painful: 1 } } };
  const released = releaseAppearance([collar], true)[0];
  assert.deepEqual(released.Property, { TypeRecord: { noarch: 0 } });
  assert.deepEqual(released.Craft, collar.Craft);
  assert.equal(collar.Property.TypeRecord.noarch, 12);
  collar.Property.TypeRecord.noarch = 3;
  assert.deepEqual(releaseAppearance([collar], true), [collar]);
});

test('R132 leash checks reject minimized enclosure variants and preserve raw bundles', () => {
  const canFollowLeash = new Function('definitions', 'interactionPermission', 'resolveItemProperties', loadTypeScript('src/action/leash.ts') + ';return canFollowLeash;')(definitions, interactionPermission, resolveItemProperties);
  const self = { MemberNumber: 1, AssetFamily: 'Female3DCG', AllowedInteractions: 0, OnlineSharedSettings: { AllowPlayerLeashing: true }, Appearance: [{ Group: 'ItemNeck', Name: 'LeatherCollar' }, { Group: 'ItemDevices', Name: 'Kennel', Property: { TypeRecord: { d: 1 } } }] };
  const state = { phase: 'in-room', player: self, characters: [self], room: {} };
  const before = JSON.stringify(state);
  assert.equal(canFollowLeash(state, { MemberNumber: 2 }), false);
  assert.equal(JSON.stringify(state), before);
});
