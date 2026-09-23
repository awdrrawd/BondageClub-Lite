import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseExpression } from '@babel/parser';
import { activityInventoryReason, activityReason, activityAssets, definitions } from './native-helper.mjs';
import { readPrerequisite, expandActivityTemplate } from '../scripts/activity-prerequisites.mjs';

const character = MemberNumber => ({ MemberNumber, Appearance: [], ArousalSettings: { Active:'NoMeter', Activity:'z'.repeat(100), Zone:'f'.repeat(30) } });
const item = (Group, Name, Property) => ({ Group, Name, ...(Property ? { Property } : {}) });
const rules = JSON.parse(readFileSync('src/action/extension-rules.json', 'utf8'));

test('mirrored activity zones accept any unblocked member, preserving a full block', () => {
  const a=character(1), b=character(2);
  b.Appearance=[item('ItemHood','Custom',{Block:['ItemMouth']})];
  assert.equal(activityInventoryReason(a,b,'ItemMouth',['ZoneAccessible']),null);
  b.Appearance[0].Property.Block.push('ItemMouth2','ItemMouth3');
  assert.equal(activityInventoryReason(a,b,'ItemMouth',['ZoneAccessible']),'native.blocked');
  b.Appearance[0].Property.AllowActivityOn=['ItemMouth2'];
  assert.equal(activityInventoryReason(a,b,'ItemMouth',['ZoneAccessible']),null);
  assert.equal(activityInventoryReason(b,a,'ItemMouth',['TargetZoneAccessible']),null);
});

test('forced and permitted active poses select the target correctly', () => {
  const a=character(1), b=character(2);
  b.Appearance=[item('ItemLegs','FrogtieStraps')];
  b.ActivePose=['BaseLower'];
  assert.equal(activityInventoryReason(a,b,'ItemHead',['TargetKneeling']),null);
  assert.equal(activityInventoryReason(b,a,'ItemHead',['TargetKneeling']),'native.blocked');
  b.Appearance=[];
  assert.equal(activityInventoryReason(a,b,'ItemHead',['TargetKneeling']),'native.blocked');
  b.Appearance=[item('ItemLegs','Custom',{SetPose:['Kneel'],AllowActivePose:['BaseLower']})];
  assert.equal(activityInventoryReason(a,b,'ItemHead',['TargetKneeling']),'native.blocked');
});

test('native butt access is independent of an otherwise blocked crotch; plugin access differs from bare skin', () => {
  const a=character(1), b=character(2);
  b.Appearance=[item('ClothOuter','Custom',{Block:['ItemPelvis']}),item('ItemButt','Custom',{Effect:['IsPlugged']})];
  assert.equal(activityInventoryReason(a,b,'ItemButt',['ZoneNaked']),'native.blocked');
  assert.equal(activityInventoryReason(a,b,'ItemButt',['Luzi_ActedZoneNaked']),null);
  b.Appearance.pop();
  assert.equal(activityInventoryReason(a,b,'ItemButt',['ZoneNaked']),null);
  assert.equal(activityInventoryReason(a,b,'ItemVulva',['ZoneNaked']),'native.blocked');
});

test('native fist prerequisites do not accidentally require the acting character anatomy', () => {
  const a=character(1), b=character(2);
  a.Appearance=[item('Pussy','Penis')]; b.Appearance=[item('Pussy','Pussy1')];
  assert.equal(activityReason(a,b,'ItemVulva','MasturbateFist',{}),null);
  assert.equal(activityReason(b,a,'ItemVulva','MasturbateFist',{}),'native.blocked');
});

test('all eligible worn tools are retained and target tool activities use the other wearer', () => {
  const a=character(1), b=character(2);
  a.Appearance=[item('HandAccessoryLeft','Fingernails'),item('HandAccessoryRight','Claws')];
  assert.equal(activityAssets(a,b,'Scratch').length,2);
  assert.equal(activityAssets(b,a,'Scratch').length,0);
  assert.equal(activityAssets(b,a,'Custom',['TargetNeeds-Scratch']).length,2);
  a.Appearance.push(item('ItemArms','Custom',{Block:['HandAccessoryLeft']}));
  assert.deepEqual(activityAssets(a,b,'Scratch').map(a=>a.AssetName),['Claws']);
  a.Appearance=[item('ItemHandheld','Custom',{AllowActivity:['Scratch'],Effect:['UseRemote']})];
  assert.equal(activityAssets(a,b,'Scratch').length,0);
});

test('item combinations are decoded without executing callbacks and unknown operands are not inverted into permission', () => {
  const rule=readPrerequisite(parseExpression('Prereqs.and(Prereqs.Acting.GroupIs("ItemHandheld", "Sword"), Prereqs.not(Prereqs.Acted.GroupEmpty("ItemHands")))'));
  const a=character(1), b=character(2);
  a.Appearance=[item('ItemHandheld','Sword')]; b.Appearance=[item('ItemHands','PawMittens')];
  assert.equal(activityInventoryReason(a,b,'ItemHands',[rule]),null);
  assert.equal(activityInventoryReason(b,a,'ItemHands',[rule]),'native.blocked');
  assert.equal(activityInventoryReason(a,b,'ItemHands',[{not:'UnsupportedPluginPrerequisite'}]),'native.unsupported');
  assert.equal(activityInventoryReason(a,b,'ItemHands',[{any:[rule,'UnsupportedPluginPrerequisite']}]),null);
});

test('template extraction retains inherited prerequisites and shipped poke rules require usable hands', () => {
  const ast=expandActivityTemplate(parseExpression('({activity:{...a, Prerequisite:[...(a.Prerequisite ?? []), "UseHands"]}})'),{a:parseExpression('({Name:"test",Target:["ItemHands"],Prerequisite:["UseArms"]})')});
  const activity=ast.properties[0].value;
  assert.deepEqual(activity.properties.find(p=>p.key.name==='Prerequisite').value.elements.map(n=>n.value),['UseArms','UseHands']);
  assert.deepEqual(rules['echo:戳脸'],['UseHands','UseArms']);
  const a=character(1),b=character(2);
  assert.equal(activityInventoryReason(a,b,'ItemMouth',rules['echo:戳脸']),null);
  a.Appearance=[item('ItemArms','Custom',{Effect:['Block']})];
  assert.equal(activityInventoryReason(a,b,'ItemMouth',rules['echo:戳脸']),'native.blocked');
});

test('plugin weapons, fish tails and high five inspect the right wearer and item variant', () => {
  const a=character(1), b=character(2);
  a.Appearance=[item('ItemHandheld','武器组合',{TypeRecord:{t:1,s:1}}),item('动物身体_Luzi','鱼鱼尾')];
  for(const rule of ['Luzi_HasSword','Luzi_Has鱼鱼尾']) {
    assert.equal(activityInventoryReason(a,b,'ItemHands',[rule]),null);
    assert.equal(activityInventoryReason(b,a,'ItemHands',[rule]),'native.blocked');
  }
  a.Appearance[0].Property.TypeRecord.s=0;
  assert.equal(activityInventoryReason(a,b,'ItemHands',['Luzi_HasSword']),'native.blocked');
  assert.equal(activityInventoryReason(a,b,'ItemHands',['CanHighFive']),null);
  b.Appearance=[item('ItemHands','PawMittens')];
  assert.equal(activityInventoryReason(a,b,'ItemHands',['CanHighFive']),'native.blocked');
});

test('native catalog has no unsupported prerequisites for valid character pairs', () => {
  const a=character(1), b=character(2);
  a.Appearance=b.Appearance=[item('BodyUpper','Normal')];
  for(const activity of definitions.activities) for(const group of activity.target) {
    assert.notEqual(activityReason(a,b,group,activity.name,{}),'native.unsupported',`${activity.name}/${group}`);
  }
});
