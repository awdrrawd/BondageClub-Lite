import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync('src/extensions/api.ts','utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export ', '');
const {createExtensionAPI, classifyMessage} = new Function(source+';return {createExtensionAPI,classifyMessage};')();
function setup() {
 const callbacks=new Set(), calls=[];
 const state={phase:'in-room',player:{MemberNumber:1,AccountName:'private'},room:{Name:'Room'},characters:[{MemberNumber:2,Name:'Peer',AllowedInteractions:0}]};
 const client={subscribe(fn){fn(state);return ()=>{};},subscribeMessages(fn){callbacks.add(fn);return ()=>callbacks.delete(fn);},sendChat(text){calls.push(text);},sendBeep(){},activityOptions(id,compatibility,strict){assert.equal(compatibility,false);assert.equal(strict,true);return [{source:'BC',name:'Pet',group:'ItemHead',reason:null}];},sendActivity(...args){calls.push(args);}};
 return {api:createExtensionAPI(client),state,calls,emit(message){for(const fn of callbacks)fn({id:'one',time:new Date(),sender:2,text:'hello',type:'Chat',...message});}};
}
test('plugin events are typed, private opt-in, immutable and disposable',()=>{
 const f=setup(),p=f.api.registerPlugin('test'),events=[];
 p.onMessage(event=>events.push(event));
 assert.equal(events.length,0);
 f.emit({});f.emit({type:'Whisper'});f.emit({type:'Beep'});
 assert.equal(events.length,1);assert.equal(events[0].kind,'chat');assert.ok(Object.isFrozen(events[0]));
 assert.ok(!JSON.stringify(p.getState()).includes('private'));
 const privatePlugin=f.api.registerPlugin('private',{privateMessages:true});privatePlugin.onMessage(e=>events.push(e));
 f.emit({type:'Whisper'});assert.equal(events.at(-1).kind,'whisper');
 p.dispose();privatePlugin.dispose();f.emit({});assert.equal(events.length,2);
 assert.throws(()=>p.sendChat('hello'),/disposed/);
});
test('plugin sends opt in, rate limit, and reject unknown/restricted target permissions',()=>{
 const f=setup();assert.throws(()=>f.api.registerPlugin('read').sendChat('hello'),/not enabled/);
 const p=f.api.registerPlugin('write',{allowSend:true});
 assert.equal(p.activityOptions(2).length,1);
 delete f.state.characters[0].AllowedInteractions;
 assert.throws(()=>p.activityOptions(2),/permission-unknown/);
 f.state.characters[0].AllowedInteractions=3;
 assert.throws(()=>p.activityOptions(2),/restricted-permission/);
 f.state.characters[0].AllowedInteractions=0;
 p.sendActivity(2,'ItemHead','Pet');assert.equal(f.calls.length,1);
 assert.throws(()=>p.sendChat('hello'),/rate limit/);
});
test('message classification distinguishes all supported channels and presence',()=>{
 for(const [type,kind] of Object.entries({Chat:'chat',Whisper:'whisper',Emote:'emote',Action:'action',Activity:'activity',ServerMessage:'server',Local:'local',Beep:'beep',Other:'unknown'}))assert.equal(classifyMessage({type}),kind);
 assert.equal(classifyMessage({type:'Action',presence:true}),'presence');
});
