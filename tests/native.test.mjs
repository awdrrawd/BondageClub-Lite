import test from 'node:test';
import assert from 'node:assert/strict';
import { activityReason, activityAvailability, activityInventoryReason, createActivityInventoryCheck, definitions } from './native-helper.mjs';
const character = id => ({ MemberNumber: id, Name: 'Test', AssetFamily: 'Female3DCG', Appearance: [{ Group: 'BodyUpper', Name: definitions.bodies.BodyUpper[0] }], ArousalSettings: { Active: 'Manual', Activity: 'z'.repeat(100), Zone: 'f'.repeat(30) } });

test('Lite actor restraint policy retains actual tool, target and refusal checks', () => {
  const a=character(1),b=character(2);
  a.Appearance.push({Group:'ItemArms',Name:'Custom',Property:{Effect:['Block','MergedFingers','Freeze','BlockMouth','Enclose']}});
  const check=createActivityInventoryCheck(a,b,true);
  assert.equal(check('ItemHead',['UseHands','UseArms','UseFeet','UseMouth','UseTongue']),null);
  assert.equal(check('ItemHead',['CantUseArms']),null);
  assert.equal(check('ItemHead',['Needs-BrushItem']),'native.blocked');
  assert.equal(check('ItemHead',['Luzi_HasWings']),'native.blocked');
  b.Appearance.push({Group:'ItemHood',Name:'Custom',Property:{Block:['ItemHead']}});
  assert.equal(createActivityInventoryCheck(a,b,true)('ItemHead',['ZoneAccessible']),'native.blocked');
});

test('barehand scratch and care differ from comb use; wings require the correct wearer', () => {
  const a=character(1), b=character(2);
  assert.equal(activityReason(a,b,'ItemHead','Scratch',{}),null);
  assert.equal(activityReason(a,b,'ItemHead','TakeCare',{}),null);
  assert.equal(activityReason(a,b,'ItemHead','BrushItem',{}),'native.blocked');
  a.Appearance.push({Group:'Cloth',Name:'UnknownDress'});
  assert.equal(activityAvailability(activityReason(a,b,'ItemHead','BrushItem',{}),true).reason,'native.blocked');
  a.Appearance.push({Asset:{Name:'Comb',Group:{Name:'ItemHandheld'},AllowActivity:['BrushItem']}});
  assert.equal(activityReason(a,b,'ItemHead','BrushItem',{}),null);
  assert.equal(activityInventoryReason(a,b,'ItemArms',['Luzi_HasWings']),'native.blocked');
  b.Appearance.push({Group:'Wings',Name:'AnyPluginWing'});
  assert.equal(activityInventoryReason(a,b,'ItemArms',['Luzi_HasWings']),'native.blocked');
  assert.equal(activityInventoryReason(a,b,'ItemArms',['Luzi_TargetHasWings']),null);
  a.Appearance.push({Asset:{Group:{Name:'Wings'},Name:'AnyWing'}});
  assert.equal(activityInventoryReason(a,b,'ItemArms',['Luzi_HasWings']),null);
});

test('bundled and loaded Asset items both supply effects, blocks and activity exceptions', () => {
  const actor=character(1),target=character(2);
  actor.Appearance.push({Asset:{Name:'PluginGag',Group:{Name:'ItemMouth'},Effect:['BlockMouth']},Property:{Effect:['MergedFingers']}});
  assert.equal(activityInventoryReason(actor,target,'ItemEars',['UseMouth']),'native.blocked');
  assert.equal(activityInventoryReason(actor,target,'ItemHands',['UseHands']),'native.blocked');
  actor.Appearance.pop();
  target.Appearance.push({Asset:{Name:'PluginHood',Group:{Name:'ItemHood'},Block:['ItemEars']},Property:{AllowActivityOn:['ItemEars']}});
  assert.equal(activityInventoryReason(actor,target,'ItemEars',['ZoneAccessible']),null);
  target.Appearance.at(-1).Property.AllowActivityOn=[];
  assert.equal(activityInventoryReason(actor,target,'ItemEars',['ZoneAccessible']),'native.blocked');
});

test('unknown objects are skipped without hiding their known runtime effects', () => {
  const actor=character(1),target=character(2);
  actor.Appearance.push({Group:'Cloth',Name:'UnknownDress'},null,{});
  assert.equal(activityInventoryReason(actor,target,'ItemEars',['UseMouth']),null);
  actor.Appearance.push({Group:'ItemArms',Name:'UnknownCuffs',Property:{Effect:['Block']}});
  assert.equal(activityInventoryReason(actor,target,'ItemHands',['UseHands']),'native.blocked');
  assert.equal(activityInventoryReason(actor,target,'ItemEars',['UseMouth']),null);
});

test('item-required activities inspect the correct wearer and runtime AllowActivity', () => {
  const actor=character(1),target=character(2);
  assert.equal(activityInventoryReason(actor,target,'ItemTorso',['Needs-SpankItem']),'native.blocked');
  actor.Appearance.push({Asset:{Name:'Paddle',Group:{Name:'ItemHands'},AllowActivity:['SpankItem']}});
  assert.equal(activityInventoryReason(actor,target,'ItemTorso',['Needs-SpankItem']),null);
  assert.equal(activityInventoryReason(actor,target,'ItemTorso',['TargetNeeds-SpankItem']),'native.blocked');
  actor.Appearance.at(-1).Property={AllowActivity:[]};
  assert.equal(activityInventoryReason(actor,target,'ItemTorso',['Needs-SpankItem']),'native.blocked');
  actor.Appearance.push({Group:'ItemHands',Name:'UnknownPluginItem'});
  assert.equal(activityInventoryReason(actor,target,'ItemTorso',['Needs-SpankItem']),'native.blocked');
});

test('clothing exposure is property-first and naked-zone checks use actual equipped objects', () => {
  const actor=character(1),target=character(2);
  target.Appearance.push({Asset:{Name:'Top',Group:{Name:'Cloth'},Expose:[]}});
  assert.equal(activityInventoryReason(actor,target,'ItemBreast',['ZoneNaked']),'native.blocked');
  target.Appearance.at(-1).Property={Expose:['ItemBreast']};
  assert.equal(activityInventoryReason(actor,target,'ItemBreast',['ZoneNaked']),null);
  target.Appearance.push({Group:'ItemBreast',Name:'Plugin',Property:{Effect:['BreastChaste']}});
  assert.equal(activityInventoryReason(actor,target,'ItemBreast',['ZoneNaked']),'native.blocked');
  target.Appearance=character(2).Appearance;
  target.Appearance.push({Group:'Shoes',Name:'UnknownShoes'});
  assert.equal(activityInventoryReason(actor,target,'ItemBoots',['ZoneNaked']),'native.blocked');
  assert.equal(activityInventoryReason(actor,target,'ItemBoots',['TargetZoneNaked']),null);
  target.Appearance=character(2).Appearance;
  target.Appearance.push({Group:'Cloth',Name:'UnknownTop'});
  assert.equal(activityInventoryReason(actor,target,'ItemBreast',['ZoneNaked']),null);
  assert.ok(Object.values(definitions.items).some(rule => rule.Expose?.includes('ItemBreast')));
});

test('ordinary poses and missing activity strings do not disable all native activities', () => {
  const actor=character(1),target=character(2);
  actor.ActivePose=['Kneel']; target.ActivePose=['BaseUpper'];
  delete actor.ArousalSettings.Activity;
  assert.equal(activityReason(actor,target,'ItemEars','Whisper',{}),null);
  assert.equal(activityInventoryReason(actor,target,'ItemEars',['TargetKneeling']),'native.blocked');
  target.ActivePose=['Kneel'];
  assert.equal(activityInventoryReason(actor,target,'ItemEars',['TargetKneeling']),null);
});

test('compatibility only relaxes incomplete emulation, never refusals or missing characters', () => {
  for (const reason of ['native.data','native.blocked','native.permission','native.room','native.target']) assert.equal(activityAvailability(reason,true).reason,reason);
  for (const reason of ['native.equipment','native.unsupported','native.preferences']) {
    assert.equal(activityAvailability(reason,true).reason,null);
    assert.equal(activityAvailability(reason,true).warning,reason);
    assert.equal(activityAvailability(reason,false).reason,reason);
  }
});

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
  assert.equal(activityInventoryReason(actor, target, 'ItemEars', ['UnknownPrerequisite']), 'native.unsupported');
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
  assert.equal(activityReason({ ...actor, ArousalSettings: { ...actor.ArousalSettings, Active: 'Automatic' } }, target, 'ItemEars', 'Whisper', {}), null);
  assert.equal(activityReason(actor, target, 'ItemEars', 'Whisper', { BlockCategory: ['Arousal'] }), 'native.room');
  assert.equal(activityReason(actor, target, 'ItemEars', 'Whisper', { MapType: 'Grid' }), 'native.room');
  assert.equal(activityReason(actor, { ...target, ArousalSettings: { ...target.ArousalSettings, Activity: 'd'.repeat(100) } }, 'ItemEars', 'Whisper', {}), 'native.permission');
  assert.equal(activityReason(actor, target, 'ItemEars', 'Unknown', {}), 'native.target');
});
