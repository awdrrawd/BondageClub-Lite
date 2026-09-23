import test from 'node:test';
import assert from 'node:assert/strict';
import { interactionPermission, activityItemPermission } from './permissions-helper.mjs';

function state(level, target = {}, actor = {}) {
 return {phase:'in-room',room:{Name:'Room'},player:{MemberNumber:1},characters:[
  {MemberNumber:1,Lovership:[],Reputation:[],...actor},
  {MemberNumber:2,AllowedInteractions:level,BlackList:[],WhiteList:[],Reputation:[],...target}
 ]};
}

test('online permission matrix matches official levels 0 through 5',()=>{
 for (let level=0;level<=5;level++) for (const owner of [false,true]) for (const black of [false,true]) for (const white of [false,true]) for (const lover of [false,true]) for (const dom of [false,true]) {
  const f=state(level,{Ownership:owner?{MemberNumber:1,Stage:0}:undefined,BlackList:black?[1]:[],WhiteList:white?[1]:[],Reputation:[{Type:'Dominant',Value:dom?25:26}]},{Lovership:lover?[{MemberNumber:2,Stage:0}]:[]});
  const allowed=owner || [true,!black,!black&&(white||lover||dom),white||lover,lover,false][level];
  assert.equal(interactionPermission(f,2),allowed?null:'restricted-permission',JSON.stringify({level,owner,black,white,lover,dom}));
 }
});

test('missing or malformed list and reputation data never grants a relationship permission',()=>{
 for (const list of [undefined,null,'',{},[1,'2']]) assert.equal(interactionPermission(state(1,{BlackList:list}),2),'restricted-permission');
 for (const rep of [undefined,null,{},[{Type:'Dominant',Value:'0'}],[{Type:'Dominant',Value:NaN}],[{Type:'Dominant',Value:101}]]) {
  assert.equal(interactionPermission(state(2,{}, {Reputation:rep}),2),'restricted-permission');
 }
 assert.equal(interactionPermission(state(2,{BlackList:undefined,WhiteList:[1]}),2),'restricted-permission');
 for (const level of [undefined,null,-1,6,NaN,'0',1.5]) assert.equal(interactionPermission(state(level),2),'permission-unknown');
 assert.equal(interactionPermission(state(5,{Ownership:{MemberNumber:1}}),2),null);
 assert.equal(interactionPermission(state(4,{}, {Lovership:[{MemberNumber:'2'}]}),2),'restricted-permission');
});

test('permissions use current room source data and source-side online relationships',()=>{
 const f=state(4); f.player.Lovership=[{MemberNumber:2}];
 assert.equal(interactionPermission(f,2),'restricted-permission');
 f.characters[0].Lovership=[{MemberNumber:2}];
 assert.equal(interactionPermission(f,2),null);
 f.characters[0].Lovership=[]; f.characters[1].Lovership=[{MemberNumber:1}];
 assert.equal(interactionPermission(f,2),'restricted-permission');
 f.characters[1].AllowedInteractions=undefined; f.characters[1].ItemPermission=0;
 assert.equal(interactionPermission(f,2),null);
 f.characters[1].AllowedInteractions=5;
 assert.equal(interactionPermission(f,2),'restricted-permission');
});

test('interaction direction uses the receiving character level, not both levels ANDed together',()=>{
  const f=state(0,{}, {AllowedInteractions:5});
  assert.equal(interactionPermission(f,2),null);
  const reversed={...f,player:f.characters[1]};
  assert.equal(interactionPermission(reversed,1),'restricted-permission');
});

test('wire and loaded item permissions enforce the same whole-item and default-type blocks',()=>{
  const actor={MemberNumber:1}, base={MemberNumber:2,AllowedInteractions:0};
  for (const restriction of [
    {BlockItems:[{Group:'ItemHandheld',Name:'Tool',Type:'typed0'}]},
    {BlockItems:{ItemHandheld:{Tool:['typed0']}}},
    {PermissionItems:{'ItemHandheld/Tool':{TypePermissions:{typed0:'Block'}}}},
    {BlockItems:{ItemHandheld:{Tool:['']}}},
  ]) {
    assert.equal(activityItemPermission(actor,{...base,...restriction},'ItemHandheld','Tool',{typed:0}),'native.permission');
    assert.equal(activityItemPermission(actor,{...base,...restriction},'ItemHandheld','Other',{typed:0}),null);
  }
  assert.equal(activityItemPermission(actor,{...base,BlockItems:{ItemHandheld:{Tool:['typed1']}}},'ItemHandheld','Tool',{typed:0}),null);
});

test('limited items use target-side relationships and whitelist rules independently of general access',()=>{
  const actor={MemberNumber:1,Lovership:[{MemberNumber:2}]};
  const target={MemberNumber:2,AllowedInteractions:0,LimitedItems:{ItemHandheld:{Tool:['']}}};
  const check=extra=>activityItemPermission(actor,{...target,...extra},'ItemHandheld','Tool');
  assert.equal(check({}),'native.permission');
  assert.equal(check({Lovership:[{MemberNumber:1,Stage:0}]}),null);
  assert.equal(check({Ownership:{MemberNumber:1,Stage:0}}),null);
  assert.equal(check({WhiteList:[1]}),null);
  assert.equal(check({AllowedInteractions:3,WhiteList:[1]}),'native.permission');
  assert.equal(check({Ownership:{MemberNumber:1},BlockItems:{ItemHandheld:{Tool:['']}}}),'native.permission');
});
