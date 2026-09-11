import type { UiClient } from "../ui/app";
import type { ClientSnapshot, DisplayMessage, RoomSync } from "../shared/types";

/** Synthetic session only: no real client inheritance, sockets, fetch, credentials or persistent data. */
export function createPreviewClient() {
  const people = [
    { MemberNumber: 101, Name: "Liko", Nickname: "Liko", LabelColor: "#f59bc5", Description: "這是離線測試人物。\n可以測試長篇 BIO、換行與文字圈選。", Appearance: [{ Group: "BodyUpper", Name: "Normal" }], FriendList: [202,303] },
    { MemberNumber: 202, Name: "Mira", LabelColor: "#88cfca", Description: "A quiet evening, a good conversation.", Appearance: [{ Group: "BodyUpper", Name: "Normal" }] },
    { MemberNumber: 303, Name: "小夜", LabelColor: "#c4b0ff", Description: "慢慢聊，不趕時間。", Appearance: [{ Group: "BodyUpper", Name: "Normal" }] },
  ];
  const room = (Name = "夜間休息室"): RoomSync => ({ Name, Description: "聊天、休息，分享今天的小事。", Language: "CN", Space: "X", Limit: 20, Character: people, SourceMemberNumber: 101 });
  let sequence = 0;
  const message = (text: string, type: DisplayMessage["type"] = "Chat", sender = 202): DisplayMessage => ({ id: `preview-${++sequence}`, nativeId: `preview-native-${sequence}`, sender, senderName: people.find(p => p.MemberNumber === sender)?.Name || "Liko", text, type, time: new Date() });
  let state: ClientSnapshot = {
    phase: "in-room", status: "離線預覽 · 所有資料均為虛構", player: { ...people[0], AccountName: "preview", ID: "preview", Environment: "PREVIEW" }, room: room(), characters: people,
    rooms: [], friendsQueryState: "ready", friendsStatus: "離線測試好友", friends: [{ MemberNumber: 202, MemberName: "Mira", Type: "Friend", ChatRoomName: "夜間休息室" }],
    messages: [ { ...message("Mira 加入了房間", "Action"), presence: true }, message("晚上好，今天過得怎麼樣？"), message("剛忙完，終於有時間坐下來聊聊。", "Chat", 101), message("端起杯子，在窗邊坐下。", "Emote", 303), message("Mira 輕輕拍了拍 Liko 的肩膀。", "Activity"), message("這是一則較長的訊息，用來測試手機上的閱讀寬度、名稱與時間排列，以及換行後是否依然保有舒服的行距。"), message("(這裡可以測試 OOC、回覆和悄悄話。)", "Chat", 303) ],
    whispers: [{ ...message("想在這裡聊一下嗎？", "Whisper"), target:101, targetName:"Liko" }],
    beeps: [{ id:"preview-beep", memberNumber:202, name:"Mira", text:"等等見！", incoming:true, time:new Date() }], loverRooms: {}, summon:null,
  };
  const listeners = new Set<(snapshot: Readonly<ClientSnapshot>) => void>();
  const patch = (change: Partial<ClientSnapshot>) => { state = { ...state, ...change }; listeners.forEach(fn => fn(state)); };
  const append = (text: string, type: DisplayMessage["type"] = "Chat", sender = 101) => patch({ messages: [...state.messages, message(text, type, sender)].slice(-3000) });
  const client: UiClient = {
    subscribe(fn) { listeners.add(fn); fn(state); return () => { listeners.delete(fn); }; },
    async login() { patch({ phase:"in-room", player:{ ...people[0], AccountName:"preview", ID:"preview" }, room:room(), characters:people }); },
    disconnect() { patch({ phase:"idle", player:null, room:null, characters:[] }); },
    search(request) { patch({ rooms: ["夜間休息室", "午後茶會", "Quiet conversations", "週末小聚", ...Array.from({ length:24 }, (_,i) => `測試房間 ${i + 1}`)].map((Name, i) => ({ Name, Description:i ? "歡迎坐下來聊聊。" : "聊天、休息，分享今天的小事。", Creator:"Preview", CreatorMemberNumber:101, CanJoin:i !== 27, MemberCount:i === 26 ? 20 : (i % 17) + 1, MemberLimit:20, Language:"CN", Space:request.Space, Access:i === 2 || i === 27 ? ["Whitelist"] : ["All"], MapType:i === 3 ? "Always" : "Never", Friends:i === 0 ? [{ MemberNumber:202, MemberName:"Mira" }] : [] })).filter(room => (!request.Query || room.Name.toLowerCase().includes(request.Query.toLowerCase())) && (request.FullRooms !== false || room.MemberCount < room.MemberLimit) && (request.ShowLocked !== false || room.CanJoin)) }); },
    join(name) { patch({ phase:"in-room", room:room(name), characters:people }); },
    createRoom(name) { this.join(name); },
    leave() { patch({ phase:"ready", room:null, characters:[] }); },
    sendChat(raw, replyId) {
      const whisper = raw.match(/^\/w\s+(\d+)\s+([\s\S]+)$/i);
      if (whisper) { patch({ whispers:[...(state.whispers || []), { ...message(whisper[2], "Whisper",101), target:Number(whisper[1]), targetName:people.find(p => p.MemberNumber === Number(whisper[1]))?.Name, replyId }] }); return; }
      patch({ messages:[...state.messages, { ...message(raw.replace(/^\/me\s+|^\*/, ""), /^(\/me\s|\*)/.test(raw) ? "Emote" : "Chat",101), replyId }] });
    },
    sendBeep(memberNumber, text) { patch({ beeps:[...state.beeps, { id:`preview-beep-${++sequence}`, memberNumber, name:people.find(p => p.MemberNumber === memberNumber)?.Name || "Preview", text, incoming:false, time:new Date() }] }); },
    clearMessages() { patch({ messages:[] }); },
    restoreMessages() {},
    refreshFriends() { patch({ friendsStatus:"離線好友資料已更新" }); },
    setFriend(member, add) { if (state.player) patch({ player:{ ...state.player, FriendList:add ? [...new Set([...(state.player.FriendList || []),member])] : state.player.FriendList?.filter(id => id !== member) } }); },
    requestLoverRoom() {}, setMessageLimit(limit) { patch({ messages:state.messages.slice(-limit) }); }, setTextCatalog() {}, relocalize() {},
    recordLifecycle() {}, resumeConnection() { patch({ status:"離線預覽 · 不會連接 BC" }); }, connectionDiagnostics() { return "OFFLINE UI PREVIEW — NO NETWORK SESSION"; },
    activityOptions() { return [
      ...[["ItemHead","頭部"],["ItemHands","手部"],["ItemMouth","嘴巴"],["ItemTorso","軀幹"],["ItemTorso2","軀幹"],["ItemNipples","乳頭"]].map(([group,groupLabel]) => ({group,groupLabel,name:"Pet",label:"撫摸",reason:null,warning:"native.effects",source:"BC"})),
      {group:"ItemHead",groupLabel:"頭部",name:"BrushItem",label:"梳頭 · 梳子",reason:"native.blocked",warning:"",source:"BC"},
      {group:"ItemTorso",groupLabel:"軀幹",name:"cuddle:preview",label:"貼貼（虛構）",reason:null,warning:"cuddle.help",source:"echo"},
    ]; },
    sendActivity(member, _group, name) { if (name.startsWith("cuddle:")) patch({cuddlePartner:member,characters:[...state.characters]}); append(`測試互動：${name}`,"Activity"); },
    activateSafeword() { append("離線安全詞測試：沒有改寫任何真實外觀。", "Local"); },
    cuddleInfo(member) { return { token: "preview", text: `離線模擬（不改寫外觀）\nLiko #101 · ItemMisc: 空\n#${member} · ItemMisc: 貼貼 + #404（虛構既有配對）\n\n是否模擬替換自己的格子並貼貼？` }; },
    configureSummons() {}, dismissSummon() { patch({ summon:null }); }, acceptSummon() { patch({ summon:null }); }, respondCuddle() { patch({ cuddleRequest:null }); },
  };
  return { client, inject: () => append("這是新收到的測試訊息。", "Chat",202), stress: () => patch({ messages:Array.from({ length:3000 }, (_,i) => message(`歷史訊息 ${i + 1} · 測試捲動、回覆及分批顯示。`,"Chat",i % 2 ? 101 : 202)) }), simulateDisconnect: () => patch({ phase:"reconnecting", status:"模擬斷線 · 不會連線", room:null, characters:[] }) };
}
