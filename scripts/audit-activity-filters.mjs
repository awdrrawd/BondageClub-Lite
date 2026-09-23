// Optional differential audit against a local BC checkout; no game startup or network.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parse} from '@babel/parser';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {definitions, nativeActivities, createActivityInventoryCheck} from '../tests/native-helper.mjs';
import {resolveItemProperties} from '../tests/item-properties-helper.mjs';
import {interactionPermission, activityItemPermission} from '../tests/permissions-helper.mjs';
const root=process.argv[2] || '../Bondage-College-Mirror-bondageclub';
const ctx=vm.createContext({console, CommonIsObject:v=>!!v&&typeof v==='object', CommonIsArray:Array.isArray,
  CommonEntries:Object.entries, CommonIncludes:(a,b)=>a.includes(b),
  CommonArrayConcatDedupe:(a,b)=>{for(const v of b) if(!a.includes(v)) a.push(v);return a;},
  ActivityLog:()=>{}, InventoryIsAllowedLimited:()=>false, InventoryBlockedOrLimited:()=>false,
  PropertyTypeRecordToStrings:()=>[null],
});
function extract(file,names) {
  const source=readFileSync(join(root,'Scripts',file),'utf8');
  for(const node of parse(source).program.body) {
    if(node.type==='FunctionDeclaration'&&names.includes(node.id.name)) vm.runInContext(source.slice(node.start,node.end),ctx);
    if(node.type==='VariableDeclaration'&&node.declarations.some(d=>names.includes(d.id.name))) vm.runInContext(source.slice(node.start,node.end),ctx);
  }
}
extract('Inventory.js',['InventoryGetItemProperty','PropertiesArrayLike','PropertiesObjectLike','InventoryDoItemsBlockGroup','InventoryDoItemsExposeGroup','InventoryHasItemInAnyGroup','InventoryIsItemInList','InventoryPrerequisiteMessage','InventoryGroupIsBlockedForCharacter','InventoryItemHasEffect']);
extract('Character.js',['CharacterItemsForActivity']);
extract('Activity.js',['ActivityCheckPrerequisite','ActivityGenerateItemActivitiesFromNeed','ActivityGetAllMirrorGroups']);
extract('Pose.js',['PoseToMapping','PoseAllStanding','PoseAllKneeling','PoseRefresh']);
extract('Asset.js',['AssetParsePosePrerequisite']);
extract('Server.js',['ServerChatRoomGetAllowItem']);
ctx.AllowedInteractions={Everyone:0,EveryoneExceptBlacklist:1,OwnerLoversWhitelistAndDomsOnly:2,OwnerLoversWhitelistOnly:3,OwnerLoversOnly:4};
ctx.ReputationCharacterGet=c=>c.Reputation.find(r=>r.Type==='Dominant')?.Value??0;
ctx.PoseRecord=Object.fromEntries(Object.entries(definitions.poses).map(([Name,Category])=>[Name,{Name,Category}]));
ctx.PoseFemale3DCG=Object.values(ctx.PoseRecord);
ctx.InventoryGet=(c,g)=>c.Appearance.find(i=>i.Asset.Group.Name===g)??null;
ctx.InventoryGroupIsBlocked=(c,g,activity)=>ctx.InventoryGroupIsBlockedForCharacter(c,g,activity);
ctx.AssetActivityMirrorGroups=new Map(Object.keys(definitions.zones).map(g=>[g,[g,...Object.keys(definitions.mirrors).filter(k=>definitions.mirrors[k]===g)].map(Name=>({Name,IsItem:()=>true}))]));
function load(c) {
  const result={...c,AssetFamily:'Female3DCG',PoseMapping:{},Appearance:c.Appearance.map(raw=>{
    const rule=raw.Asset??definitions.items[`${raw.Group}/${raw.Name}`]??{};
    const property=resolveItemProperties(raw.Group,raw.Name,raw.Property).property;
    return {Asset:{...rule,...ctx.AssetParsePosePrerequisite(rule),Name:raw.Name,Group:{Name:raw.Group,IsItem:()=>raw.Group.startsWith('Item')},Block:rule.Block??[],AllowActivityOn:rule.AllowActivityOn??[]},Property:{...property,...ctx.AssetParsePosePrerequisite(property)}};
  })};
  result.Effect=[...new Set(result.Appearance.flatMap(i=>[...(i.Asset.Effect??[]),...(i.Property.Effect??[])]))];
  result.HasEffect=e=>result.Effect.includes(e);
  result.IsPlayer=()=>c.MemberNumber===1;
  result.IsEnclose=()=>result.HasEffect('Enclose')||(result.IsPlayer()&&result.HasEffect('OneWayEnclose'));
  result.CanInteract=()=>!result.HasEffect('Block');
  result.CanWalk=()=>!['Freeze','Tethered','Mounted'].some(result.HasEffect);
  result.IsGagged=()=>result.Effect.some(e=>e.startsWith('Gag'));
  result.CanTalk=()=>!result.IsGagged();
  for(const [method,effect] of Object.entries({IsMouthBlocked:'BlockMouth',IsMouthOpen:'OpenMouth',IsVulvaChaste:'Chaste',IsButtChaste:'ButtChaste',IsBreastChaste:'BreastChaste',IsPlugged:'IsPlugged',IsVulvaFull:'FillVulva',IsFixedHead:'FixedHead'})) result[method]=()=>result.HasEffect(effect);
  result.HasPenis=()=>ctx.InventoryIsItemInList(result,'Pussy',['Penis']);
  result.HasVagina=()=>ctx.InventoryIsItemInList(result,'Pussy',['Pussy1','Pussy2','Pussy3']);
  result.WearingCollar=()=>!!ctx.InventoryGet(result,'ItemNeck');
  result.IsSiblingOfCharacter=()=>false;
  ctx.PoseRefresh(result);
  result.IsKneeling=()=>['Kneel','KneelingSpread'].includes(result.PoseMapping.BodyLower);
  return result;
}
const worn=(Group,Name,Property)=>({Group,Name,...(Property?{Property}:{})});
const cases=[[],[worn('Pussy','Pussy1')],[worn('Pussy','Penis')],[worn('HandAccessoryLeft','Fingernails')],
  [worn('ItemHandheld','Hairbrush')],[worn('ItemLegs','FrogtieStraps')],[worn('ItemArms','DuctTape',{TypeRecord:{typed:1}})],
  [worn('ItemMouth','BallGag')],[worn('ItemHood','Custom',{Block:['ItemMouth']})],
  [worn('ClothOuter','Custom',{Block:['ItemPelvis'],Expose:['ItemBreast']})],[worn('ItemButt','Custom',{Effect:['IsPlugged']})],
  [worn('ItemPelvis','Custom',{Effect:['Chaste'],Block:['ItemVulva']})],
  [worn('ItemDevices','Kennel',{TypeRecord:{d:1}})], [worn('ItemArms','StrictLeatherPetCrawler')],
  [worn('ItemDevices','FuturisticCrate',{TypeRecord:{d:1,d1:1}})]];
let comparisons=0;
for(const Appearance of cases) for(const targetAppearance of cases) {
  const a={MemberNumber:1,Name:'actor',Appearance,ActivePose:['BaseLower']},b={MemberNumber:2,Name:'target',Appearance:targetAppearance,ActivePose:['BaseLower']};
  const actor=load(a),target=load(b),check=createActivityInventoryCheck(a,b);
  for(const activity of nativeActivities) for(const group of activity.target) {
    const prerequisites=activity.prerequisites;
    let expected=!actor.IsEnclose()&&!target.IsEnclose()&&prerequisites.every(pre=>ctx.ActivityCheckPrerequisite(pre,actor,target,{Name:group}));
    const tool=prerequisites.find(p=>/^(Target)?Needs-/.test(p));
    if(expected&&tool) expected=ctx.ActivityGenerateItemActivitiesFromNeed(actor,target,tool.replace(/^(Target)?Needs-/,''),activity,{Name:group},tool.startsWith('Target')).some(v=>!v.Blocked);
    const actual=check(group,prerequisites,'BC')===null;
    assert.equal(actual,expected,`${JSON.stringify(Appearance)} -> ${JSON.stringify(targetAppearance)}: ${activity.name}/${group}`);
    comparisons++;
  }
}
console.log(`${comparisons} native inventory/group comparisons agree with the local game functions (room, arousal and item permissions excluded from this inventory matrix).`);
let permissions=0;
extract('Inventory.js',['InventoryIsPermissionBlocked','InventoryIsPermissionLimited','InventoryCheckLimitedPermission','InventoryBlockedOrLimited']);
for(let level=0;level<=5;level++) for(const owner of [false,true]) for(const white of [false,true]) for(const black of [false,true]) for(const lover of [false,true]) for(const dominant of [false,true]) {
  const source={MemberNumber:1,Reputation:[{Type:'Dominant',Value:dominant?0:-100}],Lovership:lover?[{MemberNumber:2}]:[],IsLoverOfCharacter:()=>lover};
  const target={MemberNumber:2,AllowedInteractions:level,Reputation:[],BlackList:black?[1]:[],WhiteList:white?[1]:[],Ownership:owner?{MemberNumber:1,Stage:0}:undefined,
    HasOnBlacklist:()=>black,HasOnWhitelist:()=>white,IsOwnedByCharacter:()=>owner};
  assert.equal(interactionPermission({phase:'in-room',room:{Name:'audit'},player:source,characters:[source,target]},2)===null,ctx.ServerChatRoomGetAllowItem(source,target));
  permissions++;
}
let itemPermissions=0;
for(let level=0;level<=5;level++) for(const permission of ['Default','Block','Limited']) for(const owner of [false,true]) for(const lover of [false,true]) for(const white of [false,true]) {
  const actor={MemberNumber:1},target={MemberNumber:2,AllowedInteractions:level,Ownership:owner?{MemberNumber:1}:undefined,Lovership:lover?[{MemberNumber:1}]:[],WhiteList:white?[1]:[],PermissionItems:{'ItemHandheld/Tool':{TypePermissions:{typed0:permission}}},IsPlayer:()=>false,IsOwnedByPlayer:()=>owner,IsLoverOfPlayer:()=>lover,HasOnWhitelist:()=>white};
  ctx.Player=actor;
  const tool={Asset:{Name:'Tool',DynamicName:()=>'Tool',Group:{Name:'ItemHandheld'}}};
  assert.equal(activityItemPermission(actor,target,'ItemHandheld','Tool',{typed:0})===null,!ctx.InventoryBlockedOrLimited(target,tool,'typed0'));
  itemPermissions++;
}
console.log(`${permissions} directional interaction permissions and ${itemPermissions} typed item permissions agree with the local game functions.`);
