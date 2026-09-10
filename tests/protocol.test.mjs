import { renderAction, dictionaryText } from './action-helper.mjs';
import { receivedSpeech } from './speech-helper.mjs';
import { nativeActivities, activityReason, activityAvailability, createActivityInventoryCheck, definitions, activityAsset } from './native-helper.mjs';
import { extensionActivities, extensionText } from './extensions-helper.mjs';
import { hasPenis, physicalGroup, textGroup, activityLabel, cuddleNames, cuddleReason, cuddleState } from './activity-helper.mjs';
import { gameCatalog } from './catalog-helper.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { t, setLocale, localizeStatus } from './i18n-helper.mjs';
import { afcLovers, embeddedAction } from './community-helper.mjs';
import { validAppearance, copyAppearance, releaseAppearance } from './safety-helper.mjs';

async function setup(environment, relayAvailable = true, account = {}, storage = new Map()) {
  setLocale('zh');
  const handlers = new Map();
  const sent = [];
  const timers = new Map();
  let timerId = 0;
  const socket = {
    connected: true,
    on(event, callback) { handlers.set(event, callback); },
    onAny(callback) { handlers.set('any', callback); },
    emit(event, payload) { sent.push({ event, payload }); },
    removeAllListeners() { handlers.clear(); },
    connect() { this.connected = true; handlers.get('connect')?.(); return this; },
    disconnect() { this.connected = false; handlers.get('disconnect')?.('io client disconnect'); return this; },
  };
  const context = {
    hasPenis, physicalGroup, textGroup, activityLabel, cuddleNames, cuddleReason, cuddleState, receivedSpeech, activityAsset,
    localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); } },
    io: () => socket, nativeActivities, activityReason, activityAvailability, createActivityInventoryCheck, extensionActivities, extensionText, renderAction, dictionaryText, t, localizeStatus, validAppearance, copyAppearance, releaseAppearance, afcLovers, embeddedAction,
    exports: {},
    require: () => ({ io: () => socket }),
    window: { setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } },
    crypto: { randomUUID: () => 'message-id' },
    location: { origin: 'https://lite.example' },
    AbortSignal,
    fetch: async () => ({ ok: relayAvailable, json: async () => relayAvailable ? ({ service: 'bc-lite-relay', version: 1 }) : ({}) }),
  };
  const source = readFileSync(new URL('../src/network/client.ts', import.meta.url), 'utf8');
  const javascript = stripTypeScriptTypes(source)
    .replace(/^import .*;\r?\n/gm, '')
    .replaceAll('export ', '');
  vm.runInNewContext(`${javascript}\nexports.BcLiteClient = BcLiteClient;`, context);
  const client = new context.exports.BcLiteClient();
  let state;
  client.subscribe(value => { state = value; });
  await client.login('test', 'not-a-real-password');
  if (!relayAvailable) return { client, handlers, sent, timers, state: () => state };
  handlers.get('LoginResponse')({ AccountName: 'test', Name: 'Test', ID: 'socket', MemberNumber: 123, Environment: environment, ...account });
  handlers.get('ServerInfo')({ OnlinePlayers: 345 });
  return { client, handlers, sent, timers, state: () => state };
}

const request = { Query: '', Space: 'X', Language: '', Game: '', FullRooms: false, ShowLocked: true, SearchDescs: false };

test('cuddle previews both slots and pairing IDs; stale consent cannot replace any item', async () => {
  const f=await setup('PROD'); f.client.setTextCatalog(gameCatalog('zh'));
  const base=[{Group:'BodyUpper',Name:'Normal'}];
  f.handlers.get('ChatRoomSync')({Name:'Room',BlockCategory:['Arousal'],Character:[
    {MemberNumber:123,Name:'Me',Appearance:[...base,{Group:'ItemMisc',Name:'OwnItem',Property:{Custom:'keep'}}],ActivePose:['Kneel']},
    {MemberNumber:55,Name:'Peer',Appearance:[...base,{Group:'ItemMisc',Name:'贴贴'}]},
  ]});
  f.handlers.get('ChatRoomMessage')({Type:'Hidden',Content:'Luzi_XCharacterDrawState',Sender:55,Dictionary:[{prevCharacter:99,associatedAsset:{group:'ItemMisc',asset:'贴贴'}}]});
  const info=f.client.cuddleInfo(55);
  assert.match(info.text,/OwnItem/); assert.match(info.text,/#99/);
  const option=f.client.activityOptions(55,false).find(o=>o.name==='cuddle:ChatOther-ItemTorso-钻进怀里');
  assert.equal(option.reason,null);
  assert.throws(()=>f.client.sendActivity(55,option.group,option.name));
  f.handlers.get('ChatRoomSyncItem')({Item:{Target:55,Group:'ItemMisc',Name:'Replacement'}});
  assert.throws(()=>f.client.sendActivity(55,option.group,option.name,false,info.token),/重新/);
  assert.ok(!f.sent.some(p=>p.event==='ChatRoomCharacterItemUpdate'));
  const current=f.client.cuddleInfo(55); assert.match(current.text,/Replacement/);
  f.client.sendActivity(55,option.group,option.name,false,current.token);
  const own=f.state().characters.find(c=>c.MemberNumber===123).Appearance;
  assert.equal(own.filter(i=>i.Group==='ItemMisc').length,1);
  assert.equal(own.find(i=>i.Group==='ItemMisc').Name,'贴贴');
  assert.equal(f.state().cuddlePartner,55);
  assert.ok(f.sent.filter(p=>p.event==='ChatRoomCharacterItemUpdate').every(p=>p.payload.Target===123));
  assert.equal(f.state().characters.find(c=>c.MemberNumber===55).Appearance.at(-1).Name,'Replacement');
  f.client.stopCuddle(); assert.equal(f.state().cuddlePartner,null);
});

test('comb activity publishes the actual worn tool and rechecks it after item removal', async () => {
  const base={Appearance:[{Group:'BodyUpper',Name:'Normal'},{Group:'ItemHandheld',Name:'Hairbrush'}],ArousalSettings:{Active:'Manual',Zone:'f'.repeat(30),Activity:'z'.repeat(100)}};
  const f=await setup('PROD',true,base); f.client.setTextCatalog(gameCatalog('zh'));
  f.handlers.get('ChatRoomSync')({Name:'Room',Character:[{...base,MemberNumber:123,Name:'Me'},{...base,MemberNumber:55,Name:'Peer'}]});
  f.client.sendActivity(55,'ItemHead','BrushItem');
  const asset=f.sent.at(-1).payload.Dictionary.find(entry=>entry.Tag==='ActivityAsset');
  assert.equal(asset.AssetName,'Hairbrush'); assert.equal(asset.GroupName,'ItemHandheld');
  f.handlers.get('ChatRoomSyncItem')({Item:{Target:123,Group:'ItemHandheld'}});
  assert.equal(f.client.activityOptions(55,true).find(o=>o.name==='BrushItem').reason,'native.blocked');
});

test('incoming cuddle requires explicit acceptance and releases only own cuddle item', async () => {
  const base = [{ Group: 'BodyUpper', Name: 'Normal', Unknown: 'keep' }];
  const f = await setup('PROD');
  f.handlers.get('ChatRoomSync')({ Name: 'Room', Character: [{ MemberNumber: 123, Name: 'Me', Appearance: base }, { MemberNumber: 55, Name: 'Peer', Appearance: [...base, { Group: 'ItemMisc', Name: '贴贴' }] }] });
  const packet = { Type: 'Activity', Content: 'ChatOther-ItemTorso-抱入怀中', Sender: 55, Dictionary: [{ SourceCharacter: 55 }, { TargetCharacter: 123 }, { ActivityName: '抱入怀中' }] };
  f.handlers.get('ChatRoomMessage')(packet);
  assert.equal(f.state().cuddleRequest.sender, 55);
  assert.ok(!f.sent.some(p => p.event === 'ChatRoomCharacterItemUpdate'));
  f.client.respondCuddle(true, f.client.cuddleInfo(55).token);
  const state = f.sent.find(p => p.payload?.Content === 'Luzi_XCharacterDrawState').payload.Dictionary[0];
  assert.equal(state.prevCharacter, 55); assert.equal(state.leash, 'lead');
  f.handlers.get('ChatRoomSyncItem')({ Item: { Target: 123, Group: 'Cloth', Name: 'NewDress', Craft: { Name: 'KeepMe' } } });
  f.client.stopCuddle();
  const own = f.state().characters.find(c => c.MemberNumber === 123).Appearance;
  assert.ok(own.some(i => i.Group === 'Cloth' && i.Craft.Name === 'KeepMe'));
  assert.ok(!own.some(i => i.Group === 'ItemMisc'));
  assert.ok(f.sent.filter(p => p.event === 'ChatRoomCharacterItemUpdate').every(p => p.payload.Target === 123 && p.payload.Group === 'ItemMisc'));
  assert.ok(!f.sent.some(p => p.event === 'AccountUpdate'));
});

test('anatomical aliases use existing body groups and require actual Penis appearance', async () => {
  const f = await setup('PROD'); f.client.setTextCatalog(gameCatalog('zh'));
  const base = { MemberNumber: 55, Name: 'Peer', Appearance: [{ Group: 'Pussy', Name: 'Pussy1' }] };
  f.handlers.get('ChatRoomSync')({ Name: 'Room', Character: [base] });
  assert.ok(!f.client.activityOptions(55, true).some(o => /ItemPenis|ItemGlans/.test(o.name)));
  f.handlers.get('ChatRoomSyncItem')({ Item: { Target: 55, Group: 'Pussy', Name: 'Penis' } });
  const options = f.client.activityOptions(55, true);
  assert.ok(options.some(o => /ItemPenis/.test(o.name) && o.group === 'ItemVulva'));
  assert.ok(!options.some(o => ['ItemPenis', 'ItemGlans'].includes(o.group)));
});

test('fresh login rejoins server LastChatRoom once and failed joins do not loop', async () => {
  const f = await setup('PROD', true, { LastChatRoom: { Name: 'Previous' } });
  assert.equal(f.sent.filter(p => p.event === 'ChatRoomJoin').length, 1);
  assert.equal(f.sent.at(-1).payload.Name, 'Previous');
  f.handlers.get('ServerInfo')({ OnlinePlayers: 123 });
  assert.equal(f.sent.filter(p => p.event === 'ChatRoomJoin').length, 1);
  f.handlers.get('ChatRoomSearchResponse')('RoomNotFound');
  assert.equal(f.state().phase, 'ready');
  assert.match(f.state().status, /RoomNotFound/);
  assert.equal(f.sent.filter(p => p.event === 'ChatRoomCreate').length, 0);
});

test('successful room is remembered across clients; account/environment isolated and manual leave suppresses stale fallback', async () => {
  const storage = new Map();
  const f = await setup('PROD', true, {}, storage);
  f.handlers.get('ChatRoomSync')({ Name: 'MyRoom', Character: [] });
  f.client.disconnect();
  assert.deepEqual([...storage], [['bc-lite-last-room-v1:PROD:123', '"MyRoom"']]);
  const g = await setup('PROD', true, {}, storage);
  assert.equal(g.sent.at(-1).event, 'ChatRoomJoin'); assert.equal(g.sent.at(-1).payload.Name, 'MyRoom');
  const other = await setup('PROD', true, { MemberNumber: 456 }, storage);
  const dev = await setup('DEV', true, {}, storage);
  assert.ok(!other.sent.some(p => p.event === 'ChatRoomJoin'));
  assert.ok(!dev.sent.some(p => p.event === 'ChatRoomJoin'));
  g.handlers.get('ChatRoomSync')({ Name: 'MyRoom', Character: [] }); g.client.leave();
  const h = await setup('PROD', true, { LastChatRoom: { Name: 'Stale' } }, storage);
  assert.ok(!h.sent.some(p => p.event === 'ChatRoomJoin'));
  assert.ok(!JSON.stringify([...storage]).includes('not-a-real-password'));
});

test('invalid last room or unavailable browser storage never prevents login', async () => {
  const invalid = await setup('PROD', true, { LastChatRoom: { Name: { bad: true } } });
  assert.equal(invalid.state().phase, 'ready');
  const denied = { get() { throw new Error('blocked'); }, set() { throw new Error('blocked'); } };
  const f = await setup('PROD', true, { LastChatRoom: { Name: 'ServerRoom' } }, denied);
  assert.equal(f.sent.at(-1).payload.Name, 'ServerRoom');
});

test('room history defaults to 3000, trims oldest on reduction and keeps the limit across reconnects', async () => {
  const f = await setup('PROD');
  for (let i = 0; i < 3005; i++) f.handlers.get('ChatRoomMessage')({ Type: 'Chat', Sender: 55, Content: String(i) });
  assert.equal(f.state().messages.length, 3000);
  assert.equal(f.state().messages[0].text, '5');
  const sent = f.sent.length;
  assert.throws(() => f.client.setMessageLimit(0));
  f.client.setMessageLimit(600);
  assert.equal(f.state().messages.length, 600);
  assert.equal(f.state().messages[0].text, '2405');
  assert.equal(f.sent.length, sent);
  f.client.setMessageLimit(3000);
  assert.equal(f.state().messages.length, 600); // Increasing never restores discarded history.
  f.client.setMessageLimit(600); f.client.disconnect();
  for (let i = 0; i < 605; i++) f.client.handleMessage({ Type: 'Chat', Sender: 55, Content: String(i) });
  assert.equal(f.state().messages.length, 600);
});

test('membership sync does not duplicate native presence, and departed nickname/color survives', async () => {
  const f = await setup('PROD'); f.client.setTextCatalog(gameCatalog('en'));
  const character = { MemberNumber: 55, Name: 'Account', Nickname: 'Nick', LabelColor: '#FFE800' };
  f.handlers.get('ChatRoomSync')({ Name: 'Room', Character: [] });
  f.client.clearMessages();
  f.handlers.get('ChatRoomSyncMemberJoin')({ Character: character });
  assert.equal(f.state().messages.length, 0);
  f.handlers.get('ChatRoomMessage')({ Type: 'Action', Sender: 55, Content: 'ServerEnter', Dictionary: [] });
  assert.equal(f.state().messages.length, 1);
  f.handlers.get('ChatRoomSyncMemberLeave')({ SourceMemberNumber: 55 });
  assert.equal(f.state().messages.length, 1);
  f.handlers.get('ChatRoomMessage')({ Type: 'Action', Sender: 55, Content: 'ServerLeave', Dictionary: [{ Tag: 'SourceCharacter', Text: 'Account' }] });
  assert.equal(f.state().messages.length, 2);
  assert.equal(f.state().messages.at(-1).text, 'Nick [Account] left.');
  assert.equal(f.state().messages.at(-1).presence, true);
  assert.equal(f.state().messages.at(-1).labelColor, '#FFE800');
  const sent = f.sent.length;
  f.client.clearMessages(); assert.equal(f.state().messages.length, 0); assert.equal(f.sent.length, sent);
});

test('incoming LCE ungarbled speech reaches chat and private history without sending any packets', async () => {
  const f=await setup('PROD');
  f.handlers.get('ChatRoomSync')({Name:'Room',Character:[{MemberNumber:123,Name:'Me'},{MemberNumber:55,Name:'Friend'}]});
  const sent=f.sent.length;
  f.handlers.get('ChatRoomMessage')({Type:'Chat',Sender:55,Content:'mm',Dictionary:[{Effects:['gagged'],Original:'hello'},{MsgId:'original-id'}]});
  assert.equal(f.state().messages.at(-1).text,'mm [hello]');
  assert.equal(f.state().messages.at(-1).nativeId,'original-id');
  f.handlers.get('ChatRoomMessage')({Type:'Whisper',Sender:55,Target:123,Content:'mmm',Dictionary:[{Original:'private'},{Tag:'ReplyId',ReplyId:'original-id'}]});
  assert.equal(f.state().whispers.at(-1).text,'mmm [private]');
  assert.equal(f.state().whispers.at(-1).replyId,'original-id');
  assert.equal(f.sent.length,sent);
});

test('compatibility sends clothed online activity but never overrides explicit preferences or room restrictions', async () => {
  const clothing = Object.keys(definitions.items).find(key => key.startsWith('Cloth/') && Object.keys(definitions.items[key]).length === 0).split('/');
  const base = { Name: 'Test', Appearance: [{ Group: clothing[0], Name: clothing[1] }], ArousalSettings: { Active: 'Automatic', Activity: 'z'.repeat(100), Zone: 'f'.repeat(30) } };
  const f = await setup('PROD', true, base);
  const actor = { ...base, MemberNumber: 123 }, target = { ...base, MemberNumber: 55 };
  f.handlers.get('ChatRoomSync')({ Name: 'Room', Character: [actor, target] });
  const option = f.client.activityOptions(55, true).find(option => option.name === 'Whisper' && option.group === 'ItemEars');
  assert.equal(option.reason, null); assert.equal(option.warning, 'native.effects');
  assert.equal(f.client.activityOptions(55, false).find(option => option.name === 'Whisper').reason, null);
  f.client.sendActivity(55, 'ItemEars', 'Whisper', false);
  assert.equal(f.sent.at(-1).payload.Type, 'Activity');
  actor.Appearance.push({ Group:'ItemMouth', Name:'BallGag', Property:{ Effect:[] } });
  f.handlers.get('ChatRoomSync')({ Name:'Room', Character:[actor, target] });
  assert.equal(f.client.activityOptions(55, true).find(value => value.name === 'Whisper').reason, 'native.blocked');
  assert.throws(() => f.client.sendActivity(55, 'ItemEars', 'Whisper', true));
  actor.Appearance.pop();
  target.ArousalSettings = { ...base.ArousalSettings, Activity: 'd'.repeat(100) };
  f.handlers.get('ChatRoomSync')({ Name: 'Room', Character: [actor, target] });
  assert.equal(f.client.activityOptions(55, true).find(option => option.name === 'Whisper').reason, 'native.permission');
  assert.throws(() => f.client.sendActivity(55, 'ItemEars', 'Whisper', true), /偏好/);
  f.handlers.get('ChatRoomSync')({ Name: 'Room', BlockCategory: ['Arousal'], Character: [actor, target] });
  assert.equal(f.client.activityOptions(55, true).find(option => option.name === 'Whisper').reason, 'native.room');
  assert.ok(!f.sent.some(packet => ['AccountUpdate', 'ChatRoomCharacterUpdate'].includes(packet.event)));
});

test('paw activities require the correct wearer in both modes while ordinary automatic-mode activities remain usable', async () => {
  const base={Name:'Test',Appearance:[{Group:'BodyUpper',Name:'Normal'}],ArousalSettings:{Active:'Automatic',Activity:'z'.repeat(100),Zone:'f'.repeat(30)}};
  const f=await setup('PROD',true,base);
  f.client.setTextCatalog(gameCatalog('zh'));
  const actor={...base,MemberNumber:123},target={...base,MemberNumber:55};
  const sync=()=>f.handlers.get('ChatRoomSync')({Name:'Room',Character:[actor,target]});
  const get=(name,mode)=>f.client.activityOptions(55,mode).find(option=>option.name===name);
  const paw='text:ChatOther-ItemHead-猫爪梳毛', squeeze='text:ChatOther-ItemHands-捏猫爪';
  sync();
  for(const mode of [false,true]) {
    assert.equal(get('Pet',mode).reason,null);
    assert.equal(get(paw,mode).reason,'native.blocked');
    assert.equal(get(squeeze,mode).reason,'native.blocked');
    assert.throws(()=>f.client.sendActivity(55,'ItemHead',paw,mode));
  }
  actor.Appearance=[...base.Appearance,{Group:'ItemHands',Name:'PawMittens'}]; sync();
  for(const mode of [false,true]) {
    assert.equal(get(paw,mode).reason,null);
    assert.equal(get(squeeze,mode).reason,'native.blocked');
  }
  actor.Appearance=base.Appearance;
  target.Appearance=[...base.Appearance,{Group:'ItemHands',Name:'ElbowLengthMittens'}]; sync();
  for(const mode of [false,true]) {
    assert.equal(get(paw,mode).reason,'native.blocked');
    assert.equal(get(squeeze,mode).reason,null);
  }
  target.Appearance=base.Appearance; sync();
  assert.throws(()=>f.client.sendActivity(55,'ItemHands',squeeze,true));
});

test('unknown plugin appearance does not disable equipment checks, while fresh restrictions still block sending', async () => {
  const base = {Name:'Test',Appearance:[{Group:'BodyUpper',Name:'Normal'},{Group:'Cloth',Name:'PluginDress'}],ArousalSettings:{Active:'Manual',Activity:'z'.repeat(100),Zone:'f'.repeat(30)}};
  const f = await setup('PROD',true,base);
  const actor = {...base,MemberNumber:123}, target = {...base,MemberNumber:55};
  f.handlers.get('ChatRoomSync')({Name:'Room',Character:[actor,target]});
  const option = mode => f.client.activityOptions(55,mode).find(o => o.name === 'Whisper' && o.group === 'ItemEars');
  assert.equal(option(false).reason,null);
  assert.equal(option(true).reason,null);
  assert.equal(option(true).warning,'');
  f.client.sendActivity(55,'ItemEars','Whisper',true);
  assert.equal(f.sent.at(-1).payload.Type,'Activity');
  actor.Appearance = [...actor.Appearance,{Group:'ItemMouth',Name:'PluginGag',Property:{Effect:['BlockMouth']}}];
  f.handlers.get('ChatRoomSync')({Name:'Room',Character:[actor,target]});
  assert.equal(option(true).reason,'native.blocked');
  assert.throws(() => f.client.sendActivity(55,'ItemEars','Whisper',true));
  actor.Appearance = base.Appearance;
  target.ArousalSettings = {...base.ArousalSettings,Activity:'d'.repeat(100)};
  f.handlers.get('ChatRoomSync')({Name:'Room',Character:[actor,target]});
  assert.equal(option(true).reason,'native.permission');
});

test('ECHO cuddle wears only the own slot and shares native activity plus reciprocal draw state', async () => {
  const f = await setup('PROD');
  f.client.setTextCatalog(gameCatalog('zh'));
  const appearance = [{ Group: 'BodyUpper', Name: 'Normal', Custom: 'preserve' }];
  f.handlers.get('ChatRoomSync')({ Name: 'Room', Character: [{ MemberNumber: 123, Name: 'Test', Appearance: appearance }, { MemberNumber: 55, Name: 'Friend', Appearance: appearance }] });
  const option = f.client.activityOptions(55).find(option => option.name === 'cuddle:ChatOther-ItemTorso-钻进怀里');
  assert.ok(option); assert.equal(option.warning, 'cuddle.help');
  f.client.sendActivity(55, option.group, option.name, false, f.client.cuddleInfo(55).token);
  const packet = f.sent.at(-1).payload;
  assert.equal(packet.Type, 'Activity');
  assert.equal(packet.Content, 'ChatOther-ItemTorso-钻进怀里');
  const text = packet.Dictionary.find(entry => entry.Text)?.Text;
  assert.match(text, /Test.*Friend/);
  assert.doesNotMatch(text, /SourceCharacter|DestinationCharacter|TargetCharacter/);
  assert.ok(packet.Dictionary.some(entry => entry.ActivityName === '钻进怀里'));
  const wear = f.sent.find(p => p.event === 'ChatRoomCharacterItemUpdate').payload;
  assert.equal(wear.Target, 123); assert.equal(wear.Group, 'ItemMisc'); assert.equal(wear.Name, '贴贴');
  const state = f.sent.find(p => p.payload?.Content === 'Luzi_XCharacterDrawState').payload.Dictionary[0];
  assert.equal(state.prevCharacter, 55); assert.equal(state.leash, 'lead');
  assert.equal(f.state().characters.find(c => c.MemberNumber === 123).Appearance[0].Custom, 'preserve');
  assert.ok(!f.sent.some(packet => ['AccountUpdate', 'ChatRoomCharacterUpdate'].includes(packet.event)));
  f.handlers.get('ChatRoomSyncMemberLeave')({ SourceMemberNumber: 55 });
  assert.throws(() => f.client.sendActivity(55, option.group, option.name));
});

test('native activity sends the BC Activity dictionary, rechecks permissions, and never writes appearance', async () => {
  const base = { Name: 'Test', AssetFamily: 'Female3DCG', Appearance: [{ Group: 'BodyUpper', Name: definitions.bodies.BodyUpper[0] }], ArousalSettings: { Active: 'Manual', Activity: 'z'.repeat(100), Zone: 'f'.repeat(30) } };
  const f = await setup('PROD', true, base);
  f.handlers.get('ChatRoomSync')({ Name: 'Room', Character: [{ ...base, MemberNumber: 123 }, { ...base, MemberNumber: 55 }] });
  f.client.sendActivity(55, 'ItemEars', 'Whisper');
  const packet = f.sent.at(-1).payload;
  assert.equal(packet.Type, 'Activity');
  assert.equal(packet.Content, 'ChatOther-ItemEars-Whisper');
  assert.equal(packet.Dictionary.find(entry => entry.ActivityName).ActivityName, 'Whisper');
  assert.equal(packet.Dictionary.find(entry => entry.FocusGroupName).FocusGroupName, 'ItemEars');
  f.handlers.get('ChatRoomSyncMemberLeave')({ SourceMemberNumber: 55 });
  assert.throws(() => f.client.sendActivity(55, 'ItemEars', 'Whisper'));
  assert.ok(!f.sent.some(packet => ['AccountUpdate', 'ChatRoomCharacterUpdate'].includes(packet.event)));
});

test('Lite identity uses its own hidden channel without versions or account data', async () => {
  const f = await setup('PROD');
  f.handlers.get('ChatRoomSync')({ Name: 'Room', Character: [{ MemberNumber: 55, Name: 'Friend' }] });
  const packet = f.sent.find(packet => packet.payload?.Content === 'BCLiteHello').payload;
  assert.equal(JSON.stringify(packet), JSON.stringify({ Type: 'Hidden', Content: 'BCLiteHello', Dictionary: [{ client: 'Lite' }] }));
  const before = f.state().messages.length;
  f.handlers.get('ChatRoomMessage')({ Type: 'Hidden', Content: 'BCEMsg', Sender: 55, Dictionary: [{ message: { type: 'Hello', lce: '1.0' } }] });
  assert.equal(f.sent.at(-1).payload.Target, 55);
  assert.equal(f.state().messages.length, before);
});

test('plugin fallback dialogues render without executing plugins or exposing control packets', async () => {
  const f = await setup('PROD');
  f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [{ MemberNumber: 55, Name: 'Alice' }], Limit: 10 });
  for (const [type, key, file] of [['Activity', 'ChatOther-ItemHead-XSAct_Test', 'ActivityDictionary.csv'], ['Activity', 'ChatOther-ItemHead-LSCG_Test', 'ActivityDictionary.csv'], ['Action', 'BCX_PLAYER_CUSTOM_DIALOG', 'Interface.csv'], ['Action', 'QiAct_ChatFallback', 'Interface.csv']]) {
    f.handlers.get('ChatRoomMessage')({ Type: type, Sender: 55, Content: key, Dictionary: [{ Tag: { Name: 'ignored' } }, { Tag: `MISSING TEXT IN "${file}": ${key}`, Text: 'SourceCharacter smiles <script>not HTML</script>' }] });
    assert.equal(f.state().messages.at(-1).text, 'Alice smiles <script>not HTML</script>');
  }
  f.handlers.get('ChatRoomMessage')({ Type: 'Chat', Sender: 55, Content: 'BCX_PLAYER_CUSTOM_DIALOG', Dictionary: [{ Tag: 'MISSING TEXT IN "Interface.csv": BCX_PLAYER_CUSTOM_DIALOG', Text: 'spoof' }] });
  assert.equal(f.state().messages.at(-1).text, 'BCX_PLAYER_CUSTOM_DIALOG');
  const count = f.state().messages.length;
  f.handlers.get('ChatRoomMessage')({ Type: 'Hidden', Sender: 55, Content: 'BCXMsg', Dictionary: [{ command: 'anything' }] });
  assert.equal(f.state().messages.length, count);
});

test('BC input prefixes and native reply IDs survive the wire', async () => {
  for (const [input, type, content] of [['*waves', 'Emote', 'waves'], ['*waves*', 'Emote', 'waves'], ['(hello', 'Chat', '(hello)'], ['.A SourceCharacter nods', 'Action', 'BCX_PLAYER_CUSTOM_DIALOG']]) {
    const f = await setup('PROD'); f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [], Limit: 10 });
    f.client.sendChat(input, 'native-reply');
    const packet = f.sent.at(-1).payload;
    assert.equal(packet.Type, type); assert.equal(packet.Content, content);
    assert.equal(packet.Dictionary.find(entry => entry.Tag === 'ReplyId').ReplyId, 'native-reply');
  }
});

test('private channels only normalize OOC and preserve action prefixes as literal text', async () => {
  for (const [input, expected] of [['.A waves', '.A waves'], ['.a waves', '.a waves'], ['*waves*', '*waves*'], ['/me waves', '/me waves'], ['(hello', '(hello)'], ['(hello)', '(hello)']]) {
    const f = await setup('PROD');
    f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [{ MemberNumber: 55, Name: 'Alice' }], Limit: 10 });
    f.client.sendChat(`/w 55 ${input}`, 'reply-private');
    const whisper = f.sent.at(-1).payload;
    assert.equal(whisper.Type, 'Whisper');
    assert.equal(whisper.Target, 55);
    assert.equal(whisper.Content, expected);
    assert.equal(whisper.Dictionary.find(entry => entry.Tag === 'ReplyId').ReplyId, 'reply-private');
    f.client.sendBeep(55, input);
    assert.equal(f.sent.at(-1).event, 'AccountBeep');
    assert.equal(f.sent.at(-1).payload.Message, expected);
    assert.equal(f.sent.at(-1).payload.BeepType, '');
  }
});

test('private OOC normalization cannot bypass the message length limit', async () => {
  const f = await setup('PROD');
  assert.throws(() => f.client.sendBeep(55, '(' + 'x'.repeat(999)));
  assert.equal(f.sent.filter(packet => packet.event === 'AccountBeep').length, 0);
});

test('private whispers retain server MsgId and stay in session history across room changes', async () => {
  const f = await setup('PROD'); f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [], Limit: 10 });
  f.handlers.get('ChatRoomMessage')({ Type: 'Whisper', Sender: 55, Target: 123, Content: 'private', Dictionary: [{ MsgId: 'native-1' }, { Tag: 'ReplyId', ReplyId: 'native-0' }] });
  assert.equal(f.state().whispers.at(-1).nativeId, 'native-1');
  assert.equal(f.state().whispers.at(-1).replyId, 'native-0');
  f.client.leave(); assert.equal(f.state().whispers.length, 1);
  f.client.disconnect(); assert.equal(f.state().whispers.length, 0);
});

test('AFC reads only shared lovers and accepts room information only from those members', async () => {
  const f = await setup('PROD', true, { FriendList: [55], OnlineSharedSettings: { AFC: { lovers: [{ memberNumber: 55, name: 'Lover' }] } } });
  f.client.requestLoverRoom(55);
  assert.equal(f.sent.at(-1).payload.BeepType, 'afcBeep');
  assert.equal(f.sent.at(-1).payload.IsSecret, true);
  assert.throws(() => f.client.requestLoverRoom(66));
  const receive = f.handlers.get('AccountBeep');
  receive({ BeepType: 'afcBeep', MemberNumber: 66, Message: 'RoomName', ChatRoomName: 'spoof' });
  assert.equal(f.state().loverRooms[66], undefined);
  receive({ BeepType: 'afcBeep', MemberNumber: 55, Message: 'RoomName', ChatRoomName: 'Shared', ChatRoomSpace: 'X' });
  assert.equal(f.state().loverRooms[55].name, 'Shared');
  assert.equal(f.state().beeps.length, 0);
  receive({ BeepType: 'afcBeep', MemberNumber: 55, Message: 'DelRoom' });
  assert.equal(f.state().loverRooms[55], undefined);
  assert.equal(f.sent.some(p => p.event === 'AccountUpdate'), false);
});

test('BCX-compatible summons require opt-in, allowed sender, ordinary beep, matching text and room', async () => {
  const f = await setup('PROD'); const receive = f.handlers.get('AccountBeep');
  const beep = { MemberNumber: 55, MemberName: 'Allowed', Message: 'summon', ChatRoomName: 'Target', ChatRoomSpace: 'X' };
  receive(beep); assert.equal(f.state().summon, null);
  f.client.configureSummons(true, [55], 'Come here');
  for (const change of [{ MemberNumber: 66 }, { Message: 'other' }, { BeepType: 'BCX' }, { ChatRoomName: '' }, { ChatRoomSpace: 'invalid' }]) {
    receive({ ...beep, ...change }); assert.equal(f.state().summon, null);
  }
  receive(beep); assert.equal(f.state().summon.sender, 55);
  assert.equal(f.sent.some(p => p.event === 'ChatRoomJoin'), false);
  f.client.acceptSummon(); assert.equal(f.sent.at(-1).payload.Name, 'Target');
  assert.equal(f.state().summon, null);
  receive(beep); f.client.configureSummons(false, [], 'Come here');
  assert.throws(() => f.client.acceptSummon());
});

test('text interactions send readable actions but never change appearance', async () => {
  const f = await setup('PROD'); f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [{ Name: 'Alice', MemberNumber: 55 }], Limit: 10 });
  f.client.sendInteraction(55, 'wave');
  const packet = f.sent.at(-1).payload;
  assert.equal(packet.Type, 'Action');
  assert.match(packet.Dictionary[0].Text, /Test.*Alice/);
  assert.equal(f.sent.some(p => /CharacterUpdate|AccountUpdate/.test(p.event)), false);
  assert.throws(() => f.client.sendInteraction(99, 'wave'));
});

test('temporary disconnect rejoins the last room once after both login and server readiness', async () => {
  const f = await setup('PROD');
  f.handlers.get('ChatRoomSync')({ Name: 'Private Room', Character: [], Limit: 10 });
  f.handlers.get('disconnect')('ping timeout');
  f.handlers.get('connect')();
  f.handlers.get('LoginResponse')({ AccountName: 'test', Name: 'Test', ID: 'socket-new', MemberNumber: 123, Environment: 'PROD' });
  assert.equal(f.sent.filter(p => p.event === 'ChatRoomJoin').length, 0);
  f.handlers.get('ServerInfo')({ OnlinePlayers: 1 });
  assert.equal(f.sent.filter(p => p.event === 'ChatRoomJoin').length, 1);
  assert.equal(f.sent.at(-1).payload.Name, 'Private Room');
  f.handlers.get('ChatRoomSearchResponse')('RoomFull');
  f.handlers.get('ServerInfo')({ OnlinePlayers: 2 });
  assert.equal(f.sent.filter(p => p.event === 'ChatRoomJoin').length, 1);
  assert.doesNotMatch(f.client.connectionDiagnostics(), /Private Room|AccountName|Password/);
});

test('resume checks use one bounded native query; backgrounding cancels the watchdog', async () => {
  const f = await setup('PROD');
  f.client.resumeConnection(); f.client.resumeConnection();
  assert.equal(f.sent.filter(p => p.event === 'AccountQuery').length, 1);
  f.client.recordLifecycle('hidden');
  // The ordinary friends timeout may remain; the recovery watchdog was cancelled.
  for (const callback of [...f.timers.values()]) callback();
  assert.equal(f.sent.filter(p => p.event === 'AccountLogin').length, 0);
});

test('normal server traffic satisfies a foreground liveness probe without a friends reply', async () => {
  const f = await setup('PROD');
  f.client.resumeConnection();
  f.handlers.get('any')('ChatRoomMessage', {});
  for (const callback of [...f.timers.values()]) callback();
  assert.equal(f.sent.filter(packet => packet.event === 'AccountLogin').length, 0);
});

test('a foreground probe response avoids reconnect; a missing response restarts transport', async () => {
  const good = await setup('PROD');
  good.client.resumeConnection();
  good.handlers.get('AccountQueryResult')({ Query: 'OnlineFriends', Result: [] });
  for (const callback of [...good.timers.values()]) callback();
  assert.equal(good.sent.filter(p => p.event === 'AccountLogin').length, 0);
  const bad = await setup('PROD');
  bad.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [], Limit: 10 });
  bad.client.resumeConnection();
  // Recovery watchdog is registered before the friends query timer.
  [...bad.timers.values()][0]();
  assert.equal(bad.sent.filter(p => p.event === 'AccountLogin').length, 1);
  assert.match(bad.client.connectionDiagnostics(), /resume-probe-timeout/);
});

test('logout, server disconnect and duplicate login never resume or reclaim a session', async () => {
  for (const stop of ['logout', 'server', 'duplicate']) {
    const f = await setup('PROD');
    f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [], Limit: 10 });
    f.client.resumeConnection();
    if (stop === 'logout') f.client.disconnect();
    else if (stop === 'server') f.handlers.get('disconnect')('io server disconnect');
    else f.handlers.get('ForceDisconnect')('ErrorDuplicatedLogin');
    const count = f.sent.length;
    f.client.recordLifecycle('hidden'); f.client.resumeConnection();
    for (const callback of [...f.timers.values()]) callback();
    assert.equal(f.sent.length, count);
  }
});

test('connection diagnostics are bounded and exclude account data and arbitrary server reasons', async () => {
  const f = await setup('PROD');
  for (let i = 0; i < 100; i++) f.client.recordLifecycle('visible');
  f.handlers.get('disconnect')('secret-user-message');
  const log = f.client.connectionDiagnostics();
  assert.equal(log.split('\n').length, 80);
  assert.doesNotMatch(log, /secret-user-message|not-a-real-password/);
});

const safetyAccount = () => ({ AssetFamily: 'Female3DCG', GameplaySettings: { EnableSafeword: true }, AllowedInteractions: 1, ActivePose: ['Kneel'], Appearance: [{ Group: 'Cloth', Name: 'Dress', Color: 'Red' }, { Group: 'ECHO-custom', Name: 'Custom', Property: { opaque: true } }] });

test('confirmed safeword revert alone writes the exact cloned login appearance and native permissions', async () => {
  const account = safetyAccount();
  const original = JSON.stringify(account.Appearance);
  const f = await setup('PROD', true, account);
  account.Appearance[0].Color = 'Mutated outside client';
  f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [{ MemberNumber: 123, Name: 'Test', Appearance: [{ Group: 'ItemArms', Name: 'Rope' }] }] });
  assert.equal(f.sent.some(p => p.event === 'ChatRoomCharacterUpdate'), false);
  f.client.activateSafeword('revert');
  const update = f.sent.find(p => p.event === 'ChatRoomCharacterUpdate').payload;
  assert.equal(update.ID, 'socket');
  assert.equal(JSON.stringify(update.Appearance), original);
  assert.equal(JSON.stringify(update.ActivePose), '["Kneel"]');
  const saved = f.sent.find(p => p.event === 'AccountUpdate').payload;
  assert.equal(saved.AllowedInteractions, 3);
  assert.equal(saved.ItemPermission, 3);
  assert.equal('OnlineSharedSettings' in saved, false);
  assert.equal(f.state().phase, 'in-room');
  assert.equal(f.sent.at(-1).payload.Content, 'ActionActivateSafewordRevert');
  const count = f.sent.length;
  assert.throws(() => f.client.activateSafeword('revert'), /稍候/);
  assert.equal(f.sent.length, count);
});

test('release follows current full and single-item updates, retains clothes and unknown groups, then leaves', async () => {
  const f = await setup('PROD', true, { ...safetyAccount(), Ownership: { MemberNumber: 99 } });
  const worn = [{ Group: 'Cloth', Name: 'NewDress' }, { Group: 'ECHO-custom', Name: 'KeepMe' }, { Group: 'ItemArms', Name: 'Rope' }, { Group: 'ItemNeck', Name: 'SlaveCollar', Property: { Effect: ['GagHeavy'] } }];
  f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [{ MemberNumber: 123, Name: 'Test', Appearance: worn }] });
  f.handlers.get('ChatRoomSyncItem')({ Source: 55, Item: { Target: 123, Group: 'Cloth', Name: 'LatestDress', Color: 'Blue' } });
  f.client.activateSafeword('release');
  const update = f.sent.find(p => p.event === 'AccountUpdate').payload;
  assert.equal(update.Appearance.find(i => i.Group === 'Cloth').Name, 'LatestDress');
  assert.equal(update.Appearance.some(i => i.Group === 'ItemArms'), false);
  assert.equal(update.Appearance.some(i => i.Group === 'ECHO-custom'), true);
  assert.equal(JSON.stringify(update.Appearance.find(i => i.Name === 'SlaveCollar').Property), '{"TypeRecord":{"noarch":0}}');
  assert.equal('AllowedInteractions' in update, false);
  assert.equal(worn[3].Property.Effect[0], 'GagHeavy');
  assert.equal(f.sent.at(-2).payload.Content, 'ActionActivateSafewordRelease');
  assert.equal(f.sent.at(-1).event, 'ChatRoomLeave');
  assert.equal(f.state().room, null);
});

test('safeword refuses disabled, unsupported, incomplete or disconnected sessions without writes', async () => {
  for (const change of [{ GameplaySettings: { EnableSafeword: false } }, { GameplaySettings: undefined }, { AssetFamily: 'Unknown' }, { Appearance: undefined }]) {
    const f = await setup('PROD', true, { ...safetyAccount(), ...change });
    f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [{ MemberNumber: 123, Name: 'Test', Appearance: [] }] });
    const before = f.sent.length;
    assert.throws(() => f.client.activateSafeword('revert'));
    assert.equal(f.sent.length, before);
  }
  const f = await setup('PROD', true, safetyAccount());
  f.handlers.get('ChatRoomSync')({ Name: 'Test', Game: 'GGTS', Character: [{ MemberNumber: 123, Name: 'Test', Appearance: [] }] });
  assert.throws(() => f.client.activateSafeword('release'), /GGTS/);
  f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [{ MemberNumber: 123, Name: 'Test' }] });
  assert.throws(() => f.client.activateSafeword('release'), /完整外觀/);
  f.client.disconnect();
  assert.throws(() => f.client.activateSafeword('revert'));
});

test('stricter interaction permissions stay strict and slash safeword never leaks into chat', async () => {
  const f = await setup('PROD', true, { ...safetyAccount(), AllowedInteractions: 4 });
  f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [{ MemberNumber: 123, Name: 'Test', Appearance: [] }] });
  const before = f.sent.length;
  assert.throws(() => f.client.sendChat('/safeword'), /安全詞/);
  assert.equal(f.sent.length, before);
  f.client.activateSafeword('revert');
  assert.equal(f.sent.find(p => p.event === 'AccountUpdate').payload.AllowedInteractions, 4);
});

test('character Status packets never enter history or notify UI; matching chat text remains', async () => {
  const f = await setup('PROD');
  let updates = 0;
  f.client.subscribe(() => updates++);
  const before = updates;
  const history = f.state().messages;
  for (const Content of ['Talk', 'null', 'Wardrobe', 'Struggle', 'Preference', null]) {
    f.handlers.get('ChatRoomMessage')({ Type: 'Status', Sender: 55, Content });
  }
  assert.equal(f.state().messages, history);
  assert.equal(updates, before);
  for (const Content of ['Talk', 'null']) {
    f.handlers.get('ChatRoomMessage')({ Type: 'Chat', Sender: 55, Content });
    assert.equal(f.state().messages.at(-1).text, Content);
  }
  f.handlers.get('ChatRoomMessage')({ Type: 'ServerMessage', Content: 'RealServerNotice' });
  assert.equal(f.state().messages.at(-1).text, 'RealServerNotice');
});

test('missing relay does not send credentials or fall back to direct BC connection', async () => {
  const fixture = await setup(undefined, false);
  assert.equal(fixture.state().phase, 'error');
  assert.equal(fixture.handlers.size, 0);
  assert.equal(fixture.sent.length, 0);
  assert.match(fixture.state().status, /中繼未就緒/);
});

test('duplicate login stops reconnection credentials and clears pending operations', async () => {
  const fixture = await setup('PROD');
  fixture.client.search(request);
  fixture.handlers.get('ForceDisconnect')('ErrorDuplicatedLogin');
  fixture.handlers.get('connect')();
  assert.equal(fixture.state().phase, 'error');
  assert.equal(fixture.timers.size, 0);
  assert.equal(fixture.sent.some(item => item.event === 'AccountLogin'), false);
});

test('login environment is preserved and DEV never claims production login', async () => {
  const dev = await setup('DEV');
  assert.equal(dev.state().player.Environment, 'DEV');
  assert.match(dev.state().status, /已登入 DEV/);
  assert.match((await setup('PROD')).state().status, /已登入正式環境 PROD/);
  assert.match((await setup()).state().status, /正式環境尚未確認/);
});

test('rapid region changes coalesce and discard the previous region response', async () => {
  const f = await setup('PROD');
  f.client.search(request);
  f.client.search({ ...request, Space:'M' });
  f.client.search({ ...request, Space:'' });
  assert.equal(f.sent.filter(p => p.event === 'ChatRoomSearch').length, 1);
  f.handlers.get('ChatRoomSearchResult')([{ Name:'Female', Space:'X' }]);
  assert.equal(f.state().rooms.length, 0);
  assert.equal(f.sent.at(-1).payload.Space, '');
  f.handlers.get('ChatRoomSearchResult')([{ Name:'Mixed', Space:'' }]);
  assert.equal(f.state().rooms[0].Name, 'Mixed');
});

test('timed-out searches retry on a fresh authenticated transport', async () => {
  const fixture = await setup();
  fixture.client.search(request);
  [...fixture.timers.values()][0]();
  fixture.client.search(request);
  assert.equal(fixture.sent.filter(item => item.event === 'ChatRoomSearch').length, 1);
  fixture.handlers.get('ChatRoomSearchResult')([{ Name:'Old room', Space:'X' }]);
  assert.equal(fixture.state().rooms.length, 0);
  assert.equal(fixture.sent.filter(item => item.event === 'AccountLogin').length, 1);
  fixture.handlers.get('LoginResponse')({ AccountName:'test', Name:'Test', ID:'new', MemberNumber:123 });
  fixture.handlers.get('ServerInfo')({ OnlinePlayers:1 });
  assert.equal(fixture.sent.filter(item => item.event === 'ChatRoomSearch').length, 2);
  assert.equal(fixture.state().rooms.length, 0);
  fixture.handlers.get('ChatRoomSearchResult')([]);
  assert.equal(fixture.state().status, '找到 0 個房間');
});

test('creation waits for room sync; periodic ServerInfo cannot reset pending operation', async () => {
  const fixture = await setup();
  fixture.client.createRoom('Lite test', 'X', 'CN', true);
  const payload = fixture.sent.find(item => item.event === 'ChatRoomCreate').payload;
  assert.equal(payload.Space, 'X');
  assert.equal(payload.Visibility.length, 0);
  assert.equal(payload.Admin[0], 123);
  fixture.handlers.get('ServerInfo')({ OnlinePlayers: 456 });
  assert.equal(fixture.state().phase, 'joining');
  fixture.handlers.get('ChatRoomCreateResponse')('ChatRoomCreated');
  assert.equal(fixture.state().phase, 'joining');
  fixture.handlers.get('ChatRoomSync')({ Name: 'Lite test', Character: [], Limit: 10 });
  assert.equal(fixture.state().phase, 'in-room');
  assert.equal(fixture.timers.size, 0);
});

test('creation failure restores controls and exposes server error', async () => {
  const fixture = await setup();
  fixture.client.createRoom('Lite test', 'X', '', false);
  fixture.handlers.get('ChatRoomCreateResponse')('RoomAlreadyExist');
  assert.equal(fixture.state().phase, 'ready');
  assert.match(fixture.state().status, /RoomAlreadyExist/);
  assert.equal(fixture.timers.size, 0);
});

test('native friends query validates response, times out and clears on logout', async () => {
  const f = await setup('PROD');
  f.client.refreshFriends();
  assert.equal(f.sent.at(-1).event, 'AccountQuery');
  assert.equal(f.sent.at(-1).payload.Query, 'OnlineFriends');
  assert.throws(() => f.client.refreshFriends(), /查詢中/);
  f.handlers.get('AccountQueryResult')({ Query: 'OnlineFriends', Result: [{ MemberNumber: 55, MemberName: 'Friend', ChatRoomName: 'Test room' }, null] });
  assert.equal(f.state().friends.length, 1);
  assert.equal(f.timers.size, 0);
  f.client.refreshFriends();
  [...f.timers.values()][0]();
  assert.match(f.state().friendsStatus, /逾時/);
  f.client.disconnect();
  assert.equal(f.state().friends.length, 0);
  assert.equal(f.timers.size, 0);
});

test('friend updates preserve opaque custom outfit and shared settings; missing list is never overwritten', async () => {
  const appearance = [{ Group: 'UnknownEchoSlot', Name: 'custom', Property: { nested: ['data'] } }];
  const settings = { Echo: { opaque: true } };
  const f = await setup('PROD', true, { Appearance: appearance, OnlineSharedSettings: settings, FriendList: [77, 88] });
  f.client.setFriend(99, true);
  f.client.setFriend(77, false);
  assert.equal(JSON.stringify(f.sent.at(-1).payload), JSON.stringify({ FriendList: [88, 99] }));
  assert.equal(f.state().player.Appearance, appearance);
  assert.equal(f.state().player.OnlineSharedSettings, settings);
  for (const item of f.sent) assert.equal('Appearance' in item.payload || 'OnlineSharedSettings' in item.payload, false);
  const missing = await setup('PROD');
  assert.throws(() => missing.client.setFriend(99, true), /停止修改/);
});

test('BEEP interoperates with FCM native text, ignores control packets, and is bounded', async () => {
  const f = await setup('PROD');
  f.client.sendBeep(55, 'hello');
  assert.equal(f.sent.at(-1).event, 'AccountBeep');
  assert.equal(f.sent.at(-1).payload.BeepType, '');
  assert.equal(f.sent.at(-1).payload.IsSecret, true);
  assert.equal(f.state().beeps[0].incoming, false);
  assert.throws(() => f.client.sendBeep(55, 'too fast'), /稍等/);
  const receive = f.handlers.get('AccountBeep');
  receive({ MemberNumber: 55, MemberName: 'Friend', BeepType: 'FCMChatPrivate', Message: '{control}' });
  receive({ MemberNumber: 55, MemberName: 'Friend', BeepType: '', Message: { invalid: true } });
  assert.equal(f.state().beeps.length, 1);
  for (let index = 0; index < 310; index++) receive({ MemberNumber: 55, MemberName: 'Friend', BeepType: '', Message: `text ${index}` });
  assert.equal(f.state().beeps.length, 300);
  assert.equal(f.state().beeps.at(-1).text, 'text 309');
  f.client.disconnect();
  assert.equal(f.state().beeps.length, 0);
  assert.throws(() => f.client.sendBeep(55, 'offline'), /未連線/);
});

test('disconnected chat throws instead of silently consuming a draft', async () => {
  const f = await setup('PROD');
  assert.throws(() => f.client.sendChat('draft'), /草稿/);
  f.handlers.get('ChatRoomSync')({ Name: 'test', Character: [], Limit: 10 });
  f.handlers.get('disconnect')('transport close');
  const before = f.sent.length;
  assert.throws(() => f.client.sendChat('draft'), /草稿/);
  assert.equal(f.sent.length, before);
});

test('same-room synchronization preserves chat history', async () => {
  const f = await setup('PROD');
  f.handlers.get('ChatRoomSync')({ Name: 'test', Character: [], Limit: 10 });
  f.handlers.get('ChatRoomMessage')({ Type: 'Chat', Sender: 123, Content: 'keep me' });
  const messages = f.state().messages;
  f.handlers.get('ChatRoomSync')({ Name: 'test', Character: [], Limit: 10 });
  assert.equal(f.state().messages, messages);
});

test('room and character synchronization never write back unknown ECHO appearance', async () => {
  const appearance = [{ Group: 'ECHO-custom', Name: 'Unknown', Color: ['#123456'], Property: { extra: { opaque: true } } }];
  const f = await setup('PROD', true, { Appearance: appearance, FriendList: [] });
  f.handlers.get('ChatRoomSync')({ Name: 'test', Character: [{ MemberNumber: 123, Name: 'Test', Appearance: appearance }], Limit: 10 });
  f.handlers.get('ChatRoomSyncCharacter')({ Character: { MemberNumber: 123, Name: 'Test', Appearance: [] } });
  f.client.sendChat('hello');
  f.client.setFriend(55, true);
  f.client.leave();
  assert.equal(f.state().player.Appearance, appearance);
  for (const packet of f.sent.filter(packet => packet.event === 'AccountUpdate')) {
    assert.deepEqual(Object.keys(packet.payload), ['FriendList']);
  }
  assert.equal(f.sent.some(packet => /CharacterUpdate|CharacterItemUpdate/.test(packet.event)), false);
});

test('search while in-room retains membership and messages, including search errors', async () => {
  const f = await setup('PROD');
  f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [], Limit: 10 });
  const messages = f.state().messages;
  f.client.search(request);
  f.handlers.get('ChatRoomSearchResult')([]);
  f.handlers.get('ChatRoomSearchResponse')('Error');
  assert.equal(f.state().phase, 'in-room');
  assert.equal(f.state().room.Name, 'Test');
  assert.equal(f.state().messages, messages);
  assert.equal(f.sent.some(packet => packet.event === 'ChatRoomLeave'), false);
});

test('creation sends native permissions, custom URLs and default map without loading resources', async () => {
  const f = await setup('PROD');
  f.client.createRoom('Advanced', 'X', 'CN', false, 'Description', 5, {
    Background: 'MainHall', Admin: [55], Whitelist: [66], Ban: [77], Game: 'LARP',
    Visibility: ['Admin', 'Whitelist'], Access: ['Admin'], BlockCategory: ['Photos'],
    Custom: { ImageURL: 'https://example.org/background.png', MusicURL: 'https://example.org/audio.mp3' }, MapData: { Type: 'Hybrid', Fog: true },
  });
  const payload = f.sent.find(packet => packet.event === 'ChatRoomCreate').payload;
  assert.equal(JSON.stringify(payload.Admin), '[123,55]');
  assert.equal(payload.Custom.ImageURL, 'https://example.org/background.png');
  assert.equal(payload.MapData.Tiles, 'd'.repeat(1600));
  assert.equal(payload.MapData.Objects.length, 1600);
  assert.equal(payload.Access[0], 'Admin');
  assert.equal(payload.Ban[0], 77);
  assert.equal(payload.Game, 'LARP');
});

test('invalid map and unsafe custom URL fail before creating or changing phase', async () => {
  const f = await setup('PROD');
  assert.throws(() => f.client.createRoom('Test', 'X', 'CN', false, '', 5, { MapData: { Type: 'Always', Tiles: 'broken' } }), /地圖格式/);
  assert.throws(() => f.client.createRoom('Test', 'X', 'CN', false, '', 5, { Custom: { ImageURL: 'javascript:alert(1)' } }), /HTTPS/);
  assert.equal(f.state().phase, 'ready');
  assert.equal(f.sent.some(packet => packet.event === 'ChatRoomCreate'), false);
});

test('item actions resolve assets, craft names, focus groups and language changes', async () => {
  const f = await setup('PROD');
  const zh = gameCatalog('zh');
  const en = gameCatalog('en');
  const assetKey = Object.keys(en).find(key => key.startsWith('Asset.ItemArms.'));
  const asset = assetKey.split('.').at(-1);
  f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [{ MemberNumber: 55, Name: 'Alice' }, { MemberNumber: 66, Name: 'Bob' }], Limit: 10 });
  const receive = f.handlers.get('ChatRoomMessage');
  for (const action of ['ActionUse', 'ActionRemove']) {
    receive({ Type: 'Action', Sender: 55, Content: action, Dictionary: [{ SourceCharacter: 55 }, { Tag: 'DestinationCharacter', MemberNumber: 66 }, { TargetCharacter: 66 }, { Tag: action === 'ActionUse' ? 'NextAsset' : 'PrevAsset', GroupName: 'ItemArms', AssetName: asset }, { Tag: 'FocusAssetGroup', FocusGroupName: 'ItemArms' }] });
    assert.doesNotMatch(f.state().messages.at(-1).text, /ActionUse|ActionRemove/);
  }
  f.client.setTextCatalog(zh);
  assert.ok(f.state().messages.at(-1).text.includes(zh[assetKey]));
  assert.ok(f.state().messages.at(-1).text.includes(zh['Group.ItemArms']));
  setLocale('en'); f.client.relocalize(); f.client.setTextCatalog(en);
  assert.match(f.state().messages.at(-1).text, /Alice.*removes.*Bob/);
  assert.ok(f.state().messages.at(-1).text.includes(en[assetKey]));
  receive({ Type: 'Action', Sender: 55, Content: 'ActionUse', Dictionary: [{ SourceCharacter: 55 }, { Tag: 'DestinationCharacter', MemberNumber: 66 }, { Tag: 'NextAsset', GroupName: 'ItemArms', AssetName: 'Unknown', CraftName: 'My <custom> item' }, { Tag: 'FocusAssetGroup', FocusGroupName: 'ItemArms' }] });
  assert.ok(f.state().messages.at(-1).text.includes('My <custom> item'));
  receive({ Type: 'Chat', Sender: 55, Content: 'ActionUse' });
  f.client.setTextCatalog(zh);
  assert.equal(f.state().messages.at(-1).text, 'ActionUse');
  setLocale('zh');
});

test('activity keys resolve through bundled translations, names and late catalog load', async () => {
  const f = await setup('PROD');
  const key = 'ChatOther-ItemEars-Lick';
  const catalog = gameCatalog('zh');
  f.handlers.get('ChatRoomSync')({ Name: 'Test', Character: [{ MemberNumber: 55, Name: 'Alice' }, { MemberNumber: 66, Name: 'Bob' }], Limit: 10 });
  f.handlers.get('ChatRoomMessage')({ Type: 'Activity', Sender: 55, Content: key, Dictionary: [{ SourceCharacter: 55 }, { TargetCharacter: 66 }] });
  f.client.setTextCatalog(catalog);
  assert.match(f.state().messages.at(-1).text, /Alice.*舔.*Bob.*耳/);
  f.handlers.get('ChatRoomMessage')({ Type: 'Activity', Sender: 55, Content: key, Dictionary: [{ Tag: 'SourceCharacter', MemberNumber: 55 }, { Tag: 'TargetCharacterName', MemberNumber: 66 }] });
  assert.match(f.state().messages.at(-1).text, /Alice.*舔.*Bob.*耳/);
  f.handlers.get('ChatRoomMessage')({ Type: 'Chat', Sender: 55, Content: key });
  assert.equal(f.state().messages.at(-1).text, key);
  f.handlers.get('ChatRoomMessage')({ Type: 'Activity', Sender: 55, Content: 'UnknownPluginAction' });
  assert.equal(f.state().messages.at(-1).text, 'UnknownPluginAction');
});
