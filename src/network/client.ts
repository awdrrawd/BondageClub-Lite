import { canFollowLeash } from "../action/leash";
import { LeashSession } from "./leash-session";
import { interactionPermission } from "../action/interaction-permission";
import { RoomSearch } from "./room-search";
import { t, localizeStatus } from "../i18n";
import { afcLovers } from "../profile/afc";
import { decodeFriendNames, contactName } from "../profile/friend-names";
import { renderAction, dictionaryText } from "../action/render";
import { nativeActivities, activityReason, activityAvailability, createActivityInventoryCheck, activityAsset } from "../action/native";
import { receivedSpeech } from "./speech";
import { extensionActivities, extensionText } from "../action/extensions";
import { activityLabel, hasPenis, physicalGroup, textGroup } from "../action/labels";
import { cuddleNames, cuddleReason, cuddleState, createCuddleItem } from "../action/cuddle";
import { validAppearance, copyAppearance, releaseAppearance, type BundledItem } from "../safety/safeword";
import { io, type Socket } from "socket.io-client";
import type { CharacterSummary, ChatMessage, ClientSnapshot, DictionaryEntry, DisplayMessage, OnlineFriend, PlayerSummary, RoomCreateOptions, RoomSearchRequest, RoomSearchResult, RoomSync } from "../shared/types";

const MAX_MESSAGES = 3000;
const SEARCH_TIMEOUT_MS = 8_000;

// OOC stays plain text in every channel; private messages never parse action prefixes.
function normalizeOoc(text: string): string {
  return text.startsWith("(") && !text.endsWith(")") ? `${text})` : text;
}

type Listener = (snapshot: Readonly<ClientSnapshot>) => void;
type Credentials = { accountName: string; password: string };

const initialSnapshot = (): ClientSnapshot => ({ phase: "idle", status: t("m179"), player: null, rooms: [], room: null, characters: [], messages: [], friends: [], friendsQueryState: "idle", friendsStatus: t("m014"), beeps: [], whispers: [], loverRooms: {}, summon: null });

function displayName(character: CharacterSummary | undefined): string {
  if (!character) return t("m180");
  const name = character.Nickname?.trim() || character.Name?.trim() || t("m180");
  return `${name} #${character.MemberNumber}`;
}

export class BcLiteClient {
  private socket: Socket | null = null;
  private credentials: Credentials | null = null;
  private listeners = new Set<Listener>();
  private messageListeners = new Set<(message: DisplayMessage) => void>();
  subscribeMessages(listener: (message: DisplayMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => { this.messageListeners.delete(listener); };
  }
  private publishMessage(message: DisplayMessage): void {
    for (const listener of this.messageListeners) {
      try { listener(message); } catch { /* Extensions cannot interrupt the client. */ }
    }
  }
  private state = initialSnapshot();
  private travel: { room: string; space: string; valid: () => boolean; kind: 'leash' | 'summon' } | null = null;
  private leash = new LeashSession({
    eligible: holder => canFollowLeash(this.state, holder),
    hidden: (target, content) => { if (this.canSend()) this.socket!.emit('ChatRoomChat', {Type:'Hidden', Content:content, Target:target}); },
    changed: leashHolder => this.patch({leashHolder}),
  });
  private moveTo(room: string, space: string, valid: () => boolean, kind: 'leash' | 'summon'): void {
    if (!this.canSend() || !['ready','in-room'].includes(this.state.phase) || !valid()) return;
    if (this.state.room?.Name === room || this.travel?.room === room && this.travel.space === space) return;
    this.travel = { room, space, valid, kind };
    this.searches.search({Query:room, Language:'', Space:space as RoomSearchRequest['Space'], Game:'', FullRooms:true, ShowLocked:true, SearchDescs:false});
  }
  private cancelTravel(): void { this.travel = null; }

  private searches = new RoomSearch({
    canSend: () => this.canSend(),
    status: code => {
      if (code === "timeout") { if (this.travel?.kind === "leash") this.leash.clear(); this.cancelTravel(); }
      if (code === "blocked") throw new Error(t("m184"));
      this.patch(code === "queued" ? { rooms: [] } : code === "loading" ? { rooms: [], status: t("m186") } : { status: t("m187") });
    },
    send: request => { this.socket!.emit("ChatRoomSearch", request); },
    reconnect: () => { this.socket!.disconnect().connect(); },
  });
  private messageLimit = MAX_MESSAGES;
  setMessageLimit(limit: number): void {
    if (![600, 1500, 3000].includes(limit)) throw new RangeError("Invalid history limit");
    this.messageLimit = limit;
    if (this.state.messages.length > limit) this.patch({ messages: this.state.messages.slice(-limit) });
  }
  private loginAccepted = false;
  private manualDisconnect = false;
  private serverReady = false;
  private roomTimer: number | null = null;
  private friendsTimer: number | null = null;
  private lastBeepAt = 0;
  private lastChatAt = 0;
  private lastIdentityReply = 0;
  private departed = new Map<number, CharacterSummary>();
  private cuddlePair: { peer: number; room: string; state: ReturnType<typeof cuddleState> } | null = null;
  private cuddleRequestAt = 0;
  private cuddlePeers = new Map<number, number>();
  cuddleInfo(memberNumber: number): { token: string; text: string } {
    const self = this.cuddleSelf(), peer = this.state.characters.find(c => c.MemberNumber === memberNumber);
    if (!peer || !this.canSend() || !this.state.room || cuddleReason(self, peer)) throw new Error(t("native.data"));
    const slots = [self, peer].map(character => {
      const item = (character.Appearance as BundledItem[]).find(item => item.Group === "ItemMisc");
      const partner = character.MemberNumber === self.MemberNumber ? this.cuddlePair?.peer : this.cuddlePeers.get(character.MemberNumber);
      const label = !item ? t("cuddle.empty") : item.Name === "贴贴" ? `${t("cuddle.item")} · ${partner ? `#${partner}` : t("cuddle.unknownPartner")}` : this.textCatalog[`Asset.ItemMisc.${item.Name}`] || item.Name;
      return { id: character.MemberNumber, item, partner, text: `${displayName(character)} · ItemMisc: ${label}` };
    });
    return { token: JSON.stringify([this.state.room.Name, slots.map(({ id, item, partner }) => ({ id, item, partner }))]), text: `${slots.map(slot => slot.text).join("\n")}\n\n${t("cuddle.confirm")}` };
  }
  private confirmCuddle(memberNumber: number, token?: string): void {
    if (!token || token !== this.cuddleInfo(memberNumber).token) throw new Error(t("cuddle.changed"));
  }
  private cuddleSelf(): CharacterSummary {
    const character = this.state.characters.find(c => c.MemberNumber === this.state.player?.MemberNumber);
    return { ...this.state.player!, Appearance: this.safetyCurrent ?? undefined, ActivePose: character?.ActivePose !== undefined ? character.ActivePose : this.state.player?.ActivePose };
  }
  private updateCharacterAppearance(memberNumber: number, appearance: BundledItem[]): void {
    if (memberNumber === this.state.player?.MemberNumber) this.safetyCurrent = copyAppearance(appearance);
    this.patch({ characters: this.state.characters.map(character => character.MemberNumber === memberNumber
      ? { ...character, Appearance: copyAppearance(appearance) } : character) });
  }
  /** Confirmed own-slot change: preserve opaque bundles and update the room's authoritative snapshot. */
  private publishCuddleItem(item?: BundledItem): void {
    const player = this.state.player;
    if (!player?.ID || !this.canSend() || !this.state.room || !validAppearance(this.safetyCurrent)) throw new Error(t("native.data"));
    const appearance = copyAppearance(this.safetyCurrent).filter(entry => entry.Group !== "ItemMisc");
    if (item) appearance.push(item);
    const pose = this.cuddleSelf().ActivePose;
    this.updateCharacterAppearance(player.MemberNumber, appearance);
    this.patch({player:{...player,Appearance:copyAppearance(appearance)}});
    this.socket!.emit("ChatRoomCharacterItemUpdate", { Target:player.MemberNumber, Group:"ItemMisc", Color:"Default", Difficulty:0, ...item });
    // Single-item broadcasts alone do not commit ChatRoomData (BC ChatRoomCharacterUpdate / ECHO cuddle).
    // Do not use AccountUpdate: this is a room interaction, not an account wardrobe save.
    this.socket!.emit("ChatRoomCharacterUpdate", { ID:player.ID, Appearance:copyAppearance(appearance), ...(pose !== undefined ? {ActivePose:pose} : {}) });
  }
  private syncCuddle(target?: number): void {
    if (!this.canSend() || !this.state.room) return;
    this.socket!.emit("ChatRoomChat", { Type: "Hidden", Content: "Luzi_XCharacterDrawState", Dictionary: [this.cuddlePair?.state || {}], ...(target ? { Target: target } : {}) });
  }
  private wearCuddle(peer: CharacterSummary, name: string, receiving = false): void {
    const reason = cuddleReason(this.cuddleSelf(), peer);
    if (reason || !this.canSend() || !this.state.room) throw new Error(t((reason || "native.data") as Parameters<typeof t>[0]));
    this.publishCuddleItem(createCuddleItem());
    this.cuddlePair = { peer: peer.MemberNumber, room: this.state.room.Name, state: cuddleState(name, peer.MemberNumber, receiving) };
    this.syncCuddle();
    this.patch({ cuddlePartner: peer.MemberNumber });
  }
  stopCuddle(): void {
    if (!this.canSend() || !this.state.room) return;
    if (!this.cuddlePair && !this.safetyCurrent?.some(item => item.Group === "ItemMisc" && item.Name === "贴贴")) return;
    if (this.safetyCurrent?.some(item => item.Group === "ItemMisc" && item.Name === "贴贴")) {
      this.publishCuddleItem();
    }
    this.cuddlePair = null; this.patch({ cuddlePartner: null, characters: [...this.state.characters] }); this.syncCuddle();
  }
  respondCuddle(accept: boolean, token?: string): void {
    const request = this.state.cuddleRequest;
    if (!accept || !request || request.expires < Date.now()) { this.patch({ cuddleRequest: null }); return; }
    this.confirmCuddle(request.sender, token);
    const peer = this.state.characters.find(c => c.MemberNumber === request.sender);
    if (peer) this.wearCuddle(peer, request.name, true);
    this.patch({ cuddleRequest: null });
  }
  clearMessages(): void { this.patch({ messages: [] }); }

  restoreMessages(owner: string, messages: DisplayMessage[]): void {
    const player = this.state.player;
    if (!player || owner !== `${player.Environment || 'unknown'}:${player.MemberNumber}`) return;
    const merged = new Map([...messages, ...this.state.messages].map(message => [message.id, message]));
    const next = [...merged.values()].sort((a,b) => +a.time - +b.time).slice(-this.messageLimit);
    if (next.length !== this.state.messages.length || next.some((row,i) => row.id !== this.state.messages[i]?.id)) this.patch({messages: next});
  }
  private textCatalog: Record<string, string> = {};
  private safetyBaseline: { appearance: BundledItem[]; pose: string[] | null; assetFamily?: string } | null = null;
  private safetyCurrent: BundledItem[] | null = null;
  private lastSafewordAt = 0;
  private returnRoom: string | null = null;
  private summonRule = { enabled: false, members: [] as number[], text: "Come to my room immediately" };
  configureSummons(enabled: boolean, members: number[], text: string): void {
    if (members.length > 100 || members.some(id => !Number.isSafeInteger(id) || id <= 0) || !text.trim() || text.length > 200) throw new Error(t("summon.invalid"));
    this.cancelTravel();
    this.summonRule = { enabled, members: [...new Set(members)], text: text.trim() };
    this.patch({ summon: null });
  }
  private summonAllowed(member: number): boolean {
    const self = {...this.state.player, ...this.state.characters.find(c => c.MemberNumber === this.state.player?.MemberNumber)};
    return Number.isSafeInteger(member) && member > 0 && member !== self.MemberNumber && this.summonRule.enabled && this.summonRule.members.includes(member) && ![self.BlackList,self.GhostList].some(list => list !== undefined && (!Array.isArray(list) || list.includes(member)));
  }
  dismissSummon(): void { this.cancelTravel(); this.patch({ summon: null }); }
  acceptSummon(): void {
    const summon = this.state.summon;
    if (!summon || !this.summonRule.enabled || !this.summonAllowed(summon.sender) || summon.expires < Date.now() || !this.canSend() || !["ready", "in-room"].includes(this.state.phase)) throw new Error(t("summon.expired"));
    this.patch({ summon: null });
    this.moveTo(summon.room, summon.space, () => this.summonAllowed(summon.sender) && summon.expires >= Date.now(), "summon");
  }
  private recoveryTimer: number | null = null;
  private lastResumeCheck = 0;
  private diagnostics: Array<{ time: string; event: string }> = [];

  recordLifecycle(event: "visible" | "hidden" | "online" | "offline" | "pageshow"): void {
    this.recordConnection(event);
    if (event === "hidden" || event === "offline") { this.clearRecovery(); this.lastResumeCheck = 0; }
  }
  connectionDiagnostics(): string { return this.diagnostics.map(row => `${row.time} ${row.event}`).join("\n"); }
  private recordConnection(event: string): void {
    this.diagnostics.push({ time: new Date().toISOString(), event });
    this.diagnostics = this.diagnostics.slice(-80);
  }
  private clearRecovery(): void {
    if (this.recoveryTimer !== null) window.clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
  }
  resumeConnection(): void {
    if (!this.credentials || this.manualDisconnect || !this.socket || this.recoveryTimer !== null || Date.now() - this.lastResumeCheck < 15000) return;
    this.lastResumeCheck = Date.now();
    this.recordConnection("resume-check");
    if (!this.socket.connected) { this.socket.connect(); return; }
    // Use an existing BC read-only request, not invented heartbeat packets.
    if (!this.canSend()) return;
    this.recoveryTimer = window.setTimeout(() => {
      this.recoveryTimer = null;
      if (!this.credentials || this.manualDisconnect) return;
      this.recordConnection("resume-probe-timeout");
      this.socket?.disconnect().connect();
    }, 12000);
    if (this.friendsTimer === null) this.refreshFriends();
  }
  private finishLogin(): void {
    this.patch({ phase: "ready", status: this.loginStatus() });
    const remembered = this.readLastRoom();
    const room = this.returnRoom || (remembered === undefined ? this.validRoomName(this.state.player?.LastChatRoom?.Name) : remembered);
    this.returnRoom = null;
    if (room) { this.recordConnection("rejoin-attempt"); this.join(room); }
    const search = this.searches.takeRecovery();
    if (search) this.search(search);
  }

  private validRoomName(value: unknown): string | null {
    return typeof value === "string" && value.trim() && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
  }
  private lastRoomKey(): string | null {
    const player = this.state.player;
    if (!player) return null;
    return `bc-lite-last-room-v1:${encodeURIComponent(player.Environment || "unknown")}:${player.MemberNumber}`;
  }
  private readLastRoom(): string | null | undefined {
    try {
      const key = this.lastRoomKey(); if (!key) return undefined;
      const raw = localStorage.getItem(key); if (raw === null) return undefined;
      const saved = JSON.parse(raw);
      if (saved === null) return null; // Explicit leave or rejected join: do not reuse stale server data.
      return this.validRoomName(saved) || undefined;
    } catch { return undefined; }
  }
  private rememberLastRoom(name: string | null): void {
    try { const key = this.lastRoomKey(); if (key) localStorage.setItem(key, JSON.stringify(name === null ? null : this.validRoomName(name))); }
    catch { /* Joining still works if browser storage is unavailable. */ }
  }

  setTextCatalog(catalog: Record<string, string>): void {
    this.textCatalog = catalog;
    this.patch({ messages: this.state.messages.map(message => message.translation ? { ...message, text: this.renderServerMessage(message.translation.content, message.type, message.translation.dictionary) } : message) });
  }

  relocalize(): void {
    this.patch({ status: localizeStatus(this.state.status), friendsStatus: localizeStatus(this.state.friendsStatus), messages: this.state.messages.map(message => message.type === "Local" ? { ...message, text: localizeStatus(message.text), senderName: t("m240") } : message) });
  }

  private renderServerMessage(content: string, type: string, dictionary: DictionaryEntry[]): string {
    return renderAction(content, type, dictionary, this.textCatalog);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async login(accountName: string, password: string): Promise<void> {
    const trimmedName = accountName.trim();
    if (!trimmedName || !password) throw new Error(t("m181"));
    this.disconnect();
    this.credentials = { accountName: trimmedName, password };
    this.manualDisconnect = false;
    this.loginAccepted = false;
    this.serverReady = false;
    const attempt = this.credentials;
    this.patch({ ...initialSnapshot(), phase: "connecting", status: t("m182") });
    try {
      const response = await fetch("/api/relay-status", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      const data = await response.json();
      if (!response.ok || data.service !== "bc-lite-relay" || data.version !== 1) throw new Error();
      if (this.credentials !== attempt) return;
      this.connectSocket();
    } catch {
      if (this.credentials !== attempt) return;
      this.credentials = null;
      this.patch({ phase: "error", status: t("m183") });
    }
  }

  disconnect(): void {
    this.interruptDeliveries();
    this.cancelTravel(); this.leash.clear();
    this.searches.reset(true);
    this.cuddlePair = null; this.cuddlePeers.clear();
    this.departed.clear();
    this.summonRule = { enabled: false, members: [], text: "Come to my room immediately" };
    this.clearRecovery();
    this.returnRoom = null;
    this.lastResumeCheck = 0;
    this.diagnostics = [];
    this.safetyBaseline = null;
    this.safetyCurrent = null;
    this.lastSafewordAt = 0;
    this.manualDisconnect = true;
    this.credentials = null;
    this.loginAccepted = false;
    this.serverReady = false;
    this.clearSearchTimer();
    this.clearRoomTimer();
    this.clearFriendsTimer();
    this.lastBeepAt = 0;
    this.lastChatAt = 0;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.patch(initialSnapshot());
  }

  search(request: RoomSearchRequest): void { this.cancelTravel(); this.searches.search(request); }

  refreshFriends(): void {
    if (!this.canSend()) throw new Error(t("m188"));
    if (this.friendsTimer !== null) throw new Error(t("m189"));
    this.friendsTimer = window.setTimeout(() => {
      this.clearFriendsTimer();
      this.patch({ friendsQueryState: "error", friendsStatus: t("m190") });
    }, SEARCH_TIMEOUT_MS);
    this.patch({ friendsQueryState: "loading", friendsStatus: t("m191") });
    this.socket!.emit("AccountQuery", { Query: "OnlineFriends" });
  }

  setFriend(memberNumber: number, enabled: boolean): void {
    if (!this.canSend()) throw new Error(t("m188"));
    if (!Number.isSafeInteger(memberNumber) || memberNumber <= 0 || memberNumber === this.state.player?.MemberNumber) throw new Error(t("m192"));
    const current = this.state.player?.FriendList;
    if (!Array.isArray(current)) throw new Error(t("m193"));
    const next = enabled ? [...new Set([...current, memberNumber])] : current.filter(id => id !== memberNumber);
    this.socket!.emit("AccountUpdate", { FriendList: next });
    this.patch({ player: { ...this.state.player!, FriendList: next }, friendsStatus: t("m194") });
  }

  sendBeep(memberNumber: number, raw: string): void {
    if (!this.canSend()) throw new Error(t("m195"));
    if (!Number.isSafeInteger(memberNumber) || memberNumber <= 0 || memberNumber === this.state.player?.MemberNumber) throw new Error(t("m192"));
    const message = normalizeOoc(raw.trim());
    if (!message || message.length > 1000) throw new Error(t("m196"));
    if (Date.now() - this.lastBeepAt < 1500) throw new Error(t("m197"));
    this.lastBeepAt = Date.now();
    this.socket!.emit("AccountBeep", { MemberNumber: memberNumber, BeepType: "", Message: message, IsSecret: true });
    this.addBeep(memberNumber, contactName(this.state, memberNumber), message, false);
  }

  clearBeeps(): void { this.patch({ beeps: [] }); }

  private clearFriendsTimer(): void {
    if (this.friendsTimer !== null) window.clearTimeout(this.friendsTimer);
    this.friendsTimer = null;
  }

  private addBeep(memberNumber: number, name: string, text: string, incoming: boolean): void {
    const beep = { id: crypto.randomUUID(), memberNumber, name, text, incoming, time: new Date() };
    this.patch({ beeps: [...this.state.beeps, beep].slice(-300) });
    this.publishMessage({ id: beep.id, type: "Beep", text, time: beep.time,
      sender: incoming ? memberNumber : this.state.player?.MemberNumber ?? null,
      senderName: incoming ? name : displayName(this.state.player ?? undefined),
      target: incoming ? this.state.player?.MemberNumber : memberNumber });
  }

  join(roomName: string): void {
    if (!this.canSend() || !roomName.trim() || this.state.phase !== "ready") return;
    this.startRoomTimer();
    this.patch({ phase: "joining", status: t("m198", [roomName]) });
    this.socket!.emit("ChatRoomJoin", { Name: roomName });
  }

  createRoom(name: string, space: RoomSearchRequest["Space"], language: RoomSearchRequest["Language"], unlisted: boolean, description = "BC Lite chat room", limit = 10, options: RoomCreateOptions = {}): void {
    if (!this.canSend() || this.state.phase !== "ready") throw new Error(t("m199"));
    if (!name.trim() || name.trim().length > 20) throw new Error(t("m200"));
    if (description.length > 100 || !Number.isInteger(limit) || limit < 2 || limit > 10) throw new Error(t("m201"));
    for (const list of [options.Admin, options.Whitelist, options.Ban]) if (list && (list.length > 100 || list.some(id => !Number.isSafeInteger(id) || id <= 0))) throw new Error(t("m202"));
    for (const url of [options.Custom?.ImageURL, options.Custom?.MusicURL]) if (url && (!/^https:\/\//i.test(url) || url.length > 2000)) throw new Error(t("m203"));
    if (options.Game && !["ClubCard", "LARP", "MagicBattle", "GGTS"].includes(options.Game)) throw new Error(t("m204"));
    const map = options.MapData;
    if (map && (!["Never", "Hybrid", "Always"].includes(map.Type) || [map.Tiles, map.Objects, map.Effects].some(value => value !== undefined && (typeof value !== "string" || value.length !== 1600)))) throw new Error(t("m205"));
    this.startRoomTimer();
    this.patch({ phase: "joining", status: t("m206", [name.trim()]) });
    this.socket!.emit("ChatRoomCreate", {
      Name: name.trim(), Description: description, Background: options.Background || "MainHall",
      Space: space, Language: language || "EN", Game: options.Game || "", Limit: limit,
      Admin: [...new Set([this.state.player!.MemberNumber, ...(options.Admin || [])])], Whitelist: options.Whitelist || [], Ban: options.Ban || [], BlockCategory: options.BlockCategory || [],
      Visibility: options.Visibility ?? (unlisted ? [] : ["All"]), Access: options.Access ?? ["All"],
      ...(options.Custom ? { Custom: options.Custom } : {}),
      ...(map && map.Type !== "Never" ? { MapData: { ...map, Tiles: map.Tiles ?? "d".repeat(1600), Objects: map.Objects ?? "d".repeat(1600) } } : {}),
    });
  }

  leave(): void { this.leaveRoom(); }
  private leaveRoom(preserveLeash = false): void {
    this.cancelTravel(); if (!preserveLeash) this.leash.clear();
    this.stopCuddle(); this.patch({ cuddleRequest: null });
    this.returnRoom = null;
    this.rememberLastRoom(null);
    if (this.socket?.connected && this.state.room) this.socket.emit("ChatRoomLeave", "");
    this.patch({ phase: "ready", room: null, characters: [], status: t("m207") });
  }

  /** Explicit UI-confirmed exception to the normal no-appearance-write policy. */
  activateSafeword(mode: "revert" | "release"): void {
    if (mode !== "revert" && mode !== "release") throw new Error(t("safety.unavailable"));
    const player = this.state.player;
    if (!player || !this.canSend() || this.state.phase !== "in-room" || !this.state.room) throw new Error(t("m208"));
    if (player.GameplaySettings?.EnableSafeword !== true || this.state.room.Game === "GGTS") throw new Error(t("safety.disabled"));
    if (!player.ID) throw new Error(t("m208"));
    if (mode === "revert" && !this.safetyBaseline) throw new Error(t("safety.noBackup"));
    if (mode === "release" && !this.safetyCurrent) throw new Error(t("safety.noCurrent"));
    if (mode === "release" && player.AssetFamily && player.AssetFamily !== "Female3DCG") throw new Error(t("safety.releaseUnsupported"));
    if (Date.now() - this.lastSafewordAt < 2000) throw new Error(t("safety.wait"));
    const owned = Boolean(player.Ownership?.MemberNumber || player.Owner?.startsWith("NPC-"));
    const appearance = mode === "revert" ? copyAppearance(this.safetyBaseline!.appearance) : releaseAppearance(this.safetyCurrent!, owned);
    const pose = mode === "revert" && this.safetyBaseline!.pose ? [...this.safetyBaseline!.pose] : null;
    const assetFamily = mode === "revert" ? this.safetyBaseline!.assetFamily : player.AssetFamily;
    const permission = mode === "revert" ? Math.max(3, player.AllowedInteractions ?? 3) : player.AllowedInteractions;
    const update = { Appearance: appearance, ...(assetFamily ? {AssetFamily:assetFamily} : {}),
      ...(mode === "revert" ? { AllowedInteractions: permission, ItemPermission: permission } : {}) };
    this.lastSafewordAt = Date.now();
    this.socket!.emit("AccountUpdate", update);
    this.socket!.emit("ChatRoomCharacterUpdate", { ID: player.ID, Appearance: appearance, ActivePose: pose });
    const paired = !!this.cuddlePair;
    this.cuddlePair = null;
    if (paired) this.syncCuddle();
    this.socket!.emit("ChatRoomChat", { Type: "Action", Content: mode === "revert" ? "ActionActivateSafewordRevert" : "ActionActivateSafewordRelease", Dictionary: [{ SourceCharacter: player.MemberNumber }] });
    this.safetyCurrent = copyAppearance(appearance);
    this.patch({ player: { ...player, Appearance: copyAppearance(appearance), ActivePose: pose, AllowedInteractions: permission, ...(assetFamily ? {AssetFamily:assetFamily} : {}) },
      characters:this.state.characters.map(character=>character.MemberNumber===player.MemberNumber ? {...character,Appearance:copyAppearance(appearance),ActivePose:pose} : character),
      cuddlePartner:null, cuddleRequest:null });
    if (mode === "release") this.leave();
    this.localMessage(t("safety.sent"));
  }

  requestLoverRoom(memberNumber: number): void {
    if (!this.canSend() || !afcLovers(this.state.player).some(lover => lover.memberNumber === memberNumber) || !this.state.player?.FriendList?.includes(memberNumber)) throw new Error(t("afc.unavailable"));
    if (Date.now() - this.lastBeepAt < 1000) throw new Error(t("m210"));
    this.lastBeepAt = Date.now();
    this.socket!.emit("AccountBeep", { MemberNumber: memberNumber, BeepType: "afcBeep", Message: "ReqRoom", IsSecret: true });
  }

  sendInteraction(memberNumber: number, action: "wave" | "nod" | "smile" | "hug"): void {
    const target = this.findCharacter(memberNumber);
    if (!target || !this.state.room || !this.canSend()) throw new Error(t("m208"));
    const keys = { wave: "interaction.waveText", nod: "interaction.nodText", smile: "interaction.smileText", hug: "interaction.hugText" } as const;
    if (!Object.hasOwn(keys, action)) return;
    this.sendChat(`.a ${t(keys[action], [this.state.player?.Nickname || this.state.player?.Name, target.Nickname || target.Name])}`);
  }

  activityOptions(memberNumber: number, compatibility = false, strictActor = false) {
    const actor = { ...this.state.player!, ...this.state.characters.find(c => c.MemberNumber === this.state.player?.MemberNumber) };
    const target = this.state.characters.find(c => c.MemberNumber === memberNumber);
    if (!target || !actor.MemberNumber || !this.state.room) return [];
    const checkInventory = createActivityInventoryCheck(actor, target, !strictActor);
    const permission = interactionPermission(this.state, memberNumber);
    const permissionReason = permission === "permission-unknown" ? "native.data" : permission ? "native.permission" : null;
    const native = nativeActivities.flatMap(activity => {
      // A tool belongs to an activity, not to each of its target zones.
      const item = activityAsset(actor, target, activity.name);
      const suffix = item ? ` · ${this.textCatalog[`Asset.${item.GroupName}.${item.AssetName}`] || item.AssetName}` : "";
      return (memberNumber === actor.MemberNumber ? activity.self : activity.target).map(group => {
        const availability = activityAvailability(!this.canSend() ? "native.data" : permissionReason || activityReason(actor, target, group, activity.name, this.state.room!, checkInventory), compatibility);
        return {
          group, name: activity.name, groupLabel: this.textCatalog[`DialogGroupName${textGroup(group, target)}`] || this.textCatalog[`Group.${group}`] || group,
          label: activityLabel(activity.name, group, target, memberNumber === actor.MemberNumber, this.textCatalog) + suffix,
          reason: availability.reason,
          warning: availability.warning || (!availability.reason && (actor.ArousalSettings?.Active !== "Manual" || activity.special) ? "native.effects" : ""),
          source: "BC",
        };
      });
    });
    const extensions = extensionActivities.filter(entry => entry.self === (actor.MemberNumber === memberNumber) && Object.hasOwn(this.textCatalog, entry.key) && (!["ItemPenis", "ItemGlans"].includes(entry.group) || hasPenis(target))).map(entry => ({
      group: physicalGroup(entry.group), name: `${entry.source === "echo" && cuddleNames.includes(entry.name) ? "cuddle" : "text"}:${entry.key}`, groupLabel: this.textCatalog[`DialogGroupName${textGroup(physicalGroup(entry.group), target)}`] || this.textCatalog[`Group.${physicalGroup(entry.group)}`] || entry.group,
      label: entry.name === "钻进怀里" ? t("interaction.cuddleIn") : entry.name === "抱入怀中" ? t("interaction.cuddleHold") : activityLabel(entry.name, physicalGroup(entry.group), target, entry.self, this.textCatalog),
      reason: !this.canSend() ? "native.data" : permissionReason || (this.state.room!.BlockCategory?.includes("Arousal") || target.ArousalSettings?.Active === "Inactive" ? "native.permission" : this.state.room!.MapType && this.state.room!.MapType !== "Never" ? "native.room" : checkInventory(physicalGroup(entry.group), entry.prerequisites ?? ["ZoneAccessible"])),
      warning: entry.source === "echo" && cuddleNames.includes(entry.name) ? "cuddle.help" : "interaction.textOnly", source: entry.source,
    }));
    for (const option of extensions) {
      const availability = activityAvailability(option.reason, compatibility);
      option.reason = availability.reason;
      if (availability.warning) option.warning = availability.warning;
      if (option.name.startsWith("cuddle:")) { option.reason = this.canSend() ? cuddleReason(this.cuddleSelf(), target) : "native.data"; option.warning = "cuddle.help"; }
    }
    if (this.safetyCurrent?.some(item => item.Group === "ItemMisc" && item.Name === "贴贴")) extensions.unshift({ group: "ItemTorso", name: "cuddle:stop", groupLabel: this.textCatalog["Group.ItemTorso"] || "ItemTorso", label: t("cuddle.stop"), reason: null, warning: "", source: "echo" });
    return [...native, ...extensions];
  }

  sendActivity(memberNumber: number, group: string, name: string, compatibility = false, cuddleToken?: string): void {
    const option = this.activityOptions(memberNumber, compatibility).find(value => value.group === group && value.name === name);
    if (!option || option.reason) throw new Error(t((option?.reason || "native.target") as Parameters<typeof t>[0]));
    if (name === "cuddle:stop") { this.stopCuddle(); return; }
    if (name.startsWith("cuddle:")) {
      if (Date.now() - this.lastChatAt < 350) throw new Error(t("m210"));
      const entry = extensionActivities.find(entry => entry.key === name.slice(7) && cuddleNames.includes(entry.name));
      const peer = this.state.characters.find(c => c.MemberNumber === memberNumber);
      if (!entry || !peer) throw new Error(t("native.target"));
      this.confirmCuddle(memberNumber, cuddleToken);
      this.wearCuddle(peer, entry.name); this.lastChatAt = Date.now();
      this.socket!.emit("ChatRoomChat", { Type: "Activity", Content: entry.key, Dictionary: [
        { SourceCharacter: this.state.player!.MemberNumber }, { TargetCharacter: memberNumber }, { FocusGroupName: group }, { ActivityName: entry.name },
        { Tag: `MISSING ACTIVITY DESCRIPTION FOR KEYWORD ${entry.key}`, Text: extensionText(entry.key, group, this.state.player!, peer, this.textCatalog) },
      ] }); return;
    }
    if (name.startsWith("text:")) {
      const target = this.state.characters.find(c => c.MemberNumber === memberNumber)!;
      this.sendChat(`.a ${extensionText(name.slice(5), group, this.state.player!, target, this.textCatalog)}`);
      return;
    }
    if (Date.now() - this.lastChatAt < 350) throw new Error(t("m210"));
    this.lastChatAt = Date.now();
    const target = this.state.characters.find(c => c.MemberNumber === memberNumber)!;
    const actor = { ...this.state.player!, ...this.state.characters.find(c => c.MemberNumber === this.state.player?.MemberNumber) };
    const asset = activityAsset(actor, target, name);
    this.socket!.emit("ChatRoomChat", { Type: "Activity", Content: `Chat${memberNumber === this.state.player!.MemberNumber ? "Self" : "Other"}-${textGroup(group, target)}-${name}`, Dictionary: [
      { SourceCharacter: this.state.player!.MemberNumber },
      { TargetCharacter: memberNumber }, { FocusGroupName: group }, { ActivityName: name },
      ...(asset ? [asset] : []),
    ] });
  }

  private announceLite(target?: number): void {
    if (!this.canSend() || !this.state.room || target === this.state.player?.MemberNumber) return;
    this.socket!.emit("ChatRoomChat", { Type: "Hidden", Content: "BCLiteHello", Dictionary: [{ client: "Lite" }], ...(target ? { Target: target } : {}) });
  }

  sendChat(raw: string, replyId?: string): void {
    const text = raw.trim();
    if (!text) return;
    if (/^\/safeword(?:\s|$)/i.test(text)) throw new Error(t("safety.command"));
    if (!this.state.room || !this.canSend()) throw new Error(t("m208"));
    if (text.length > 1000) throw new Error(t("m209"));
    if (Date.now() - this.lastChatAt < 350) throw new Error(t("m210"));
    let message: ChatMessage;
    const whisper = text.match(/^\/w(?:hisper)?\s+(\d+)\s+([\s\S]+)$/i);
    if (whisper) {
      const target = Number(whisper[1]);
      if (!this.state.characters.some((character) => character.MemberNumber === target)) throw new Error(t("m211"));
      message = { Type: "Whisper", Target: target, Content: normalizeOoc(whisper[2].trim()) };
    } else if (/^\/me\s+/i.test(text)) {
      message = { Type: "Emote", Content: text.replace(/^\/me\s+/i, "").trim() };
    } else if (/^\.a\s+/i.test(text)) {
      message = { Type: "Action", Content: "BCX_PLAYER_CUSTOM_DIALOG", Dictionary: [{ Tag: 'MISSING TEXT IN "Interface.csv": BCX_PLAYER_CUSTOM_DIALOG', Text: text.replace(/^\.a\s+/i, "") }] };
    } else if (text.startsWith("*") && text.length > 1) {
      message = { Type: "Emote", Content: text.slice(1).replace(/\*$/, "").trim() };
    } else {
      message = { Type: "Chat", Content: normalizeOoc(text) };
    }
    if (!message.Content.trim()) return;
    if (message.Content.length > 1000) throw new Error(t("m209"));
    message.Dictionary = [...(message.Dictionary || []), { Tag: "SourceCharacter", MemberNumber: this.state.player?.MemberNumber }];
    // Match official ServerSend: native chat IDs enable replies and message-content hooks.
    if (["Chat", "Whisper", "Emote"].includes(message.Type)) message.Dictionary.push({ Tag: "MsgId", MsgId: crypto.randomUUID() });
    if (replyId && replyId.length <= 256 && ["Chat", "Whisper", "Emote"].includes(message.Type)) message.Dictionary.push({ Tag: "ReplyId", ReplyId: replyId });
    this.lastChatAt = Date.now();
    const id = String(message.Dictionary.find(entry => entry.Tag === "MsgId")?.MsgId || crypto.randomUUID());
    if (!message.Dictionary.some(entry => entry.Tag === "MsgId")) message.Dictionary.push({ Tag: "MsgId", MsgId: id });
    const dropped = (this.state.deliveries || []).slice(0, -19);
    for (const item of dropped) { window.clearTimeout(this.deliveryTimers.get(item.id)); this.deliveryTimers.delete(item.id); }
    this.patch({ deliveries: [...(this.state.deliveries || []).slice(-19), { id, text, status: "pending" }] });
    this.deliveryTimers.set(id, window.setTimeout(() => this.settleDelivery(id, "unconfirmed"), 15000));
    this.socket!.emit("ChatRoomChat", message);
    if (message.Type === "Whisper") this.handleMessage({ ...message, Sender: this.state.player?.MemberNumber });
  }

  private deliveryTimers = new Map<string, number>();
  private settleDelivery(id: string, status: "confirmed" | "unconfirmed"): void {
    window.clearTimeout(this.deliveryTimers.get(id)); this.deliveryTimers.delete(id);
    this.patch({ deliveries: this.state.deliveries?.map(item => item.id === id ? { ...item, status } : item) });
  }
  private interruptDeliveries(): void {
    for (const timer of this.deliveryTimers.values()) window.clearTimeout(timer);
    this.deliveryTimers.clear();
    this.patch({ deliveries: this.state.deliveries?.map(item => item.status === "pending" ? { ...item, status: "unconfirmed" } : item) });
  }

  private connectSocket(): void {
    this.socket = io(location.origin, {
      transports: ["websocket"], upgrade: false, reconnection: true, reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000, reconnectionDelayMax: 15_000, timeout: 20_000,
    });
    // Any authenticated server event proves transport liveness; a slow friends query alone must not disconnect active chat.
    this.socket.onAny(() => {
      if (this.canSend() && this.recoveryTimer !== null) { this.clearRecovery(); this.recordConnection("probe-response"); }
    });
    this.socket.on("connect", () => {
      this.searches.reset();
      this.clearRecovery();
      this.recordConnection("connected");
      if (!this.credentials) return;
      this.loginAccepted = false;
      this.serverReady = false;
      this.patch({ phase: "authenticating", status: t("m212") });
      this.socket!.emit("AccountLogin", { AccountName: this.credentials.accountName, Password: this.credentials.password });
    });
    this.socket.on("LoginQueue", (position: unknown) => this.patch({ status: t("m213", [String(position)]) }));
    this.socket.on("LoginResponse", (data: unknown) => this.handleLogin(data));
    this.socket.on("AccountQueryResult", (data: { Query?: string; Result?: OnlineFriend[] }) => {
      if (data?.Query !== "OnlineFriends") return;
      this.clearRecovery();
      this.recordConnection("probe-response");
      this.clearFriendsTimer();
      if (!Array.isArray(data.Result)) { this.patch({ friendsQueryState: "error", friendsStatus: t("m214") }); return; }
      const friends = data.Result.filter(friend => friend && Number.isSafeInteger(friend.MemberNumber) && typeof friend.MemberName === "string");
      const player = this.state.player;
      const missingNames = friends.filter(friend => !player?.FriendNames?.[friend.MemberNumber]);
      const namedPlayer = player && missingNames.length ? {...player, FriendNames: {...player.FriendNames, ...Object.fromEntries(missingNames.map(friend => [friend.MemberNumber, friend.MemberName.slice(0,100)]))}} : player;
      const loverRooms = Object.fromEntries(Object.entries(this.state.loverRooms || {}).filter(([id]) => friends.some(friend => friend.MemberNumber === Number(id))));
      this.patch({ player: namedPlayer, friends, loverRooms, friendsQueryState: "ready", friendsStatus: t("m215", [friends.length, new Date().toLocaleTimeString()]) });
    });
    this.socket.on("AccountBeep", (data: { MemberNumber?: number; MemberName?: string; BeepType?: string; Message?: unknown; ChatRoomName?: string; ChatRoomSpace?: string }) => {
      if (data?.BeepType === 'Leash') {
        const holder = this.leash.current(this.state.characters);
        if (holder && holder.MemberNumber === data.MemberNumber && typeof data.ChatRoomName === 'string' && data.ChatRoomName.trim() && data.ChatRoomName.length <= 100 && ['X','M',''].includes(data.ChatRoomSpace ?? 'invalid')) {
          this.moveTo(data.ChatRoomName, data.ChatRoomSpace!, () => this.leash.current(this.state.characters)?.MemberNumber === data.MemberNumber, 'leash');
        }
        return;
      }
      if (data && !data.BeepType && this.summonRule.enabled && this.summonAllowed(data.MemberNumber!) && typeof data.Message === "string" && (data.Message.trim().toLowerCase() === "summon" || data.Message.toLowerCase().startsWith(this.summonRule.text.toLowerCase())) && typeof data.ChatRoomName === "string" && data.ChatRoomName.trim() && data.ChatRoomName.length <= 100 && ["X", "M", ""].includes(data.ChatRoomSpace ?? "invalid")) {
        this.patch({ summon: { sender: data.MemberNumber!, room: data.ChatRoomName, space: data.ChatRoomSpace!, expires: Date.now() + 60000 } });
      }
      if (data?.BeepType === "afcBeep") {
        if (!afcLovers(this.state.player).some(lover => lover.memberNumber === data.MemberNumber)) return;
        const rooms = { ...this.state.loverRooms };
        if (data.Message === "DelRoom") delete rooms[data.MemberNumber!];
        else if (["RoomName", "ReqRoom"].includes(String(data.Message)) && typeof data.ChatRoomName === "string" && data.ChatRoomName.length <= 100) rooms[data.MemberNumber!] = { name: data.ChatRoomName, space: data.ChatRoomSpace || "X" };
        this.patch({ loverRooms: rooms });
        return; // Do not broadcast our private room or respond to relation-control messages.
      }
      // FCM sends normal text separately from attachment/control packets. Never show or execute those packets.
      if (!data || (data.BeepType && data.BeepType !== "") || !Number.isSafeInteger(data.MemberNumber) || data.MemberNumber! <= 0) return;
      if (data.Message !== undefined && typeof data.Message !== "string") return;
      this.addBeep(data.MemberNumber!, typeof data.MemberName === "string" ? data.MemberName : `#${data.MemberNumber}`, (data.Message || t("m216")).slice(0, 1000), true);
    });
    this.socket.on("ServerInfo", (info: { OnlinePlayers?: number }) => {
      this.serverReady = true;
      this.patch({ onlinePlayers: typeof info?.OnlinePlayers === "number" ? info.OnlinePlayers : undefined });
      if (this.loginAccepted && this.state.phase === "waiting-server") this.finishLogin();
    });
    this.socket.on("ChatRoomSearchResult", (rooms: RoomSearchResult[]) => {
      const queued = this.searches.complete();
      if (queued === false) return;
      if (queued) { this.searches.search(queued); return; }
      if (!Array.isArray(rooms)) { this.cancelTravel(); this.patch({ status: t("m217") }); return; }
      if (this.travel) {
        const travel = this.travel; this.travel = null;
        const destination = rooms.find(room => room && room.Name === travel.room && room.Space === travel.space);
        const blocksLeash = travel.kind === 'leash' && destination?.BlockCategory?.includes('Leashing');
        if (!travel.valid() || blocksLeash || destination?.CanJoin !== true || !Number.isSafeInteger(destination.MemberCount) || !Number.isSafeInteger(destination.MemberLimit) || destination.MemberCount < 0 || destination.MemberCount >= destination.MemberLimit || destination.MapType && destination.MapType !== 'Never') {
          if (travel.kind === 'leash') this.leash.clear();
          this.localMessage(t('follow.unavailable')); return;
        }
        if (this.state.room) this.leaveRoom(travel.kind === 'leash');
        this.join(destination.Name); return;
      }
      const safeRooms = rooms;
      this.patch({ rooms: safeRooms, status: t("m218", [safeRooms.length]) });
    });
    this.socket.on("ChatRoomSearchResponse", (result: unknown) => {
      if (result === "RoomKicked") {
        this.cancelTravel(); this.leash.clear();
        this.returnRoom = null; this.rememberLastRoom(null); this.clearRoomTimer();
        this.patch({ phase: "ready", room: null, characters: [], status: t("m220", [String(result)]) }); return;
      }
      if (this.state.phase !== "joining") { this.patch({ status: t("m219", [String(result)]) }); return; }
      if (result !== "JoinedRoom") { this.cancelTravel(); this.leash.clear(); this.rememberLastRoom(null); this.clearRoomTimer(); this.patch({ phase: "ready", room: null, characters: [], status: t("m220", [String(result)]) }); }
    });
    this.socket.on("ChatRoomCreateResponse", (result: unknown) => {
      if (result === "ChatRoomCreated") this.patch({ status: t("m221") });
      else { this.clearRoomTimer(); this.patch({ phase: "ready", status: t("m222", [String(result)]) }); }
    });
    this.socket.on("ChatRoomSync", (room: RoomSync) => {
      this.clearRoomTimer();
      if (this.validRoomName(room.Name)) this.rememberLastRoom(room.Name);
      const characters = Array.isArray(room.Character) ? room.Character : [];
      const sameRoom = this.state.room?.Name === room.Name;
      if (!sameRoom) this.patch({ cuddleRequest: null });
      if (!sameRoom) { this.departed.clear(); this.cuddlePeers.clear(); }
      const self = characters.find(character => character.MemberNumber === this.state.player?.MemberNumber);
      if (this.cuddlePair && (this.cuddlePair.room !== room.Name || !characters.some(c => c.MemberNumber === this.cuddlePair?.peer) || !validAppearance(self?.Appearance) || !self.Appearance.some(i => i.Group === "ItemMisc" && i.Name === "贴贴"))) this.cuddlePair = null;
      this.safetyCurrent = validAppearance(self?.Appearance) ? copyAppearance(self.Appearance) : null;
      this.patch({ phase: "in-room", room, characters, cuddlePartner: this.cuddlePair?.peer ?? null, status: t("m223", [room.Name]) });
      if (!sameRoom) this.localMessage(t("m223", [room.Name]));
      if (!sameRoom) this.announceLite();
      if (this.cuddlePair) this.syncCuddle();
    });
    this.socket.on("ChatRoomSyncMemberJoin", (data: { Character?: CharacterSummary }) => {
      if (!data?.Character) return;
      this.patch({ characters: this.upsertCharacter(data.Character) });
      this.departed.delete(data.Character.MemberNumber);
      this.announceLite(data.Character.MemberNumber);
      if (this.cuddlePair) this.syncCuddle(data.Character.MemberNumber);
    });
    this.socket.on("ChatRoomSyncMemberLeave", (data: { SourceMemberNumber?: number }) => {
      if (data?.SourceMemberNumber) this.cuddlePeers.delete(data.SourceMemberNumber);
      if (data?.SourceMemberNumber) this.leash.departed(data.SourceMemberNumber);
      const character = this.findCharacter(data?.SourceMemberNumber);
      if (this.cuddlePair?.peer === data?.SourceMemberNumber) this.stopCuddle();
      if (character) { this.departed.set(character.MemberNumber, character); if (this.departed.size > 100) this.departed.delete(this.departed.keys().next().value!); }
      this.patch({ characters: this.state.characters.filter((item) => item.MemberNumber !== data?.SourceMemberNumber) });
      // Native ServerLeave/Disconnect supplies the single visible notification.
    });
    for (const event of ["ChatRoomSyncCharacter", "ChatRoomSyncSingle"]) {
      this.socket.on(event, (data: { Character?: CharacterSummary }) => {
        if (data?.Character) {
          if (data.Character.MemberNumber === this.state.player?.MemberNumber) this.safetyCurrent = validAppearance(data.Character.Appearance) ? copyAppearance(data.Character.Appearance) : null;
          this.patch({ characters: this.upsertCharacter(data.Character) });
        }
      });
    }
    this.socket.on("ChatRoomSyncItem", (data: { Item?: Record<string, unknown> }) => {
      const item = data?.Item;
      if (!item || typeof item.Target !== "number") return;
      const own = item.Target === this.state.player?.MemberNumber;
      if (typeof item.Group !== "string" || (item.Name !== undefined && typeof item.Name !== "string")) { if (own) this.safetyCurrent = null; return; }
      const character = this.state.characters.find(c => c.MemberNumber === item.Target);
      const appearance = own ? this.safetyCurrent : character?.Appearance;
      if (!validAppearance(appearance)) return;
      const next = appearance.filter(entry => entry.Group !== item.Group);
      if (typeof item.Name === "string") {
        const { Target: _target, ...bundle } = item;
        next.push(bundle as BundledItem);
      }
      this.updateCharacterAppearance(item.Target, next);
      if (this.cuddlePair && item.Group === "ItemMisc" && (own || item.Target === this.cuddlePair.peer) && item.Name !== "贴贴") this.stopCuddle();
    });
    this.socket.on("ChatRoomSyncRoomProperties", (room: Partial<RoomSync>) => {
      if (this.state.room) this.patch({ room: { ...this.state.room, ...room } });
    });
    this.socket.on("ChatRoomMessage", (message: ChatMessage) => {
      const id = Array.isArray(message?.Dictionary) ? message.Dictionary.find(entry => entry?.Tag === "MsgId")?.MsgId : undefined;
      if (message?.Sender === this.state.player?.MemberNumber && typeof id === "string" && this.state.deliveries?.some(item => item.id === id)) this.settleDelivery(id, "confirmed");
      this.handleMessage(message);
    });
    this.socket.on("ForceDisconnect", (reason: unknown) => {
      this.patch({ summon: null });
      this.clearRecovery();
      this.returnRoom = null;
      this.recordConnection(reason === "ErrorDuplicatedLogin" ? "duplicate-login" : "forced-disconnect");
      const status = reason === "ErrorDuplicatedLogin" ? t("m226") : t("m227", [String(reason)]);
      this.credentials = null;
      this.loginAccepted = false;
      this.serverReady = false;
      this.clearSearchTimer();
      this.clearRoomTimer();
      this.clearFriendsTimer();
      this.patch({ phase: "error", status });
      this.socket?.disconnect();
    });
    this.socket.on("disconnect", (reason) => {
      this.interruptDeliveries();
      this.searches.reset();
      this.cancelTravel(); this.leash.clear();
      this.patch({ summon: null });
      this.clearRecovery();
      this.recordConnection(["ping timeout", "transport close", "transport error", "io server disconnect", "io client disconnect"].includes(reason) ? reason : "disconnected");
      if (this.manualDisconnect || !this.credentials) return;
      if (this.state.room) this.localMessage(t("stability.gap"));
      if (reason !== "io server disconnect" && this.state.room) this.returnRoom = this.state.room.Name;
      this.serverReady = false;
      this.loginAccepted = false;
      this.clearSearchTimer();
      this.clearRoomTimer();
      this.clearFriendsTimer();
      this.patch({ friends: [], loverRooms: {}, friendsQueryState: "idle", friendsStatus: t("m228") });
      if (reason === "io server disconnect") {
        this.returnRoom = null;
        this.credentials = null;
        this.patch({ phase: "error", status: t("m229"), room: null, characters: [] });
      } else this.patch({ phase: "reconnecting", status: t("m230", [reason]), room: null, characters: [] });
    });
    this.socket.on("connect_error", () => {
      if (!this.manualDisconnect && this.credentials) this.patch({ phase: "reconnecting", status: t("m231") });
    });
  }

  private handleLogin(data: unknown): void {
    if (typeof data === "string") {
      this.credentials = null;
      this.patch({ phase: "error", status: data === "InvalidNamePassword" ? t("m232") : t("m233", [data]) });
      this.socket?.disconnect();
      return;
    }
    if (!data || typeof data !== "object") { this.patch({ phase: "error", status: t("m234") }); return; }
    const value = data as Partial<PlayerSummary>;
    if (!value.AccountName || !value.Name || !value.ID || !Number.isFinite(value.MemberNumber)) {
      this.patch({ phase: "error", status: t("m235") }); return;
    }
    this.loginAccepted = true;
    const player: PlayerSummary = { AccountName: value.AccountName, ID: value.ID, MemberNumber: value.MemberNumber!, Name: value.Name, Nickname: value.Nickname,
      BlackList: value.BlackList, WhiteList: value.WhiteList, GhostList: value.GhostList, Reputation: value.Reputation,
      Description: value.Description, Owner: value.Owner, Ownership: value.Ownership, Lovership: value.Lovership,
      AssetFamily: value.AssetFamily, LabelColor: value.LabelColor,
      LastChatRoom: value.LastChatRoom && typeof value.LastChatRoom === "object" ? { Name: this.validRoomName(value.LastChatRoom.Name) || undefined } : null,
      ArousalSettings: value.ArousalSettings,
      GameplaySettings: value.GameplaySettings,
      AllowedInteractions: Number.isInteger(value.AllowedInteractions) ? value.AllowedInteractions : undefined,
      ActivePose: Array.isArray(value.ActivePose) && value.ActivePose.every(pose => typeof pose === "string") ? [...value.ActivePose] : null,
      Environment: typeof value.Environment === "string" ? value.Environment : undefined,
      FriendList: Array.isArray(value.FriendList) && value.FriendList.every(Number.isSafeInteger) ? value.FriendList : undefined,
      FriendNames: decodeFriendNames(value.FriendNames),
      // Preserve complete AEE/SCA/ECHO bundles, including unknown Property/Craft
      // fields. Loading an asset registry here would silently strip plugin items.
      Appearance: validAppearance(value.Appearance) ? copyAppearance(value.Appearance) : Array.isArray(value.Appearance) ? value.Appearance : undefined,
      OnlineSharedSettings: value.OnlineSharedSettings && typeof value.OnlineSharedSettings === "object" ? value.OnlineSharedSettings : undefined };
    const previous = this.state.player;
    const changedAccount = previous && (previous.MemberNumber !== player.MemberNumber || previous.Environment !== player.Environment);
    // Keep the original login backup during automatic reconnects; never replace it with a changed outfit.
    if (!previous || changedAccount || !this.safetyBaseline) this.safetyBaseline = validAppearance(player.Appearance)
      ? { appearance: copyAppearance(player.Appearance), pose: player.ActivePose ? [...player.ActivePose] : null, assetFamily:player.AssetFamily } : null;
    this.safetyCurrent = null;
    this.patch({ ...(changedAccount ? initialSnapshot() : {}), player, phase: "waiting-server", status: t("m236") });
    if (this.serverReady) this.finishLogin();
  }

  private loginStatus(): string {
    const environment = this.state.player?.Environment;
    if (environment === "PROD") return t("m237");
    if (environment === "DEV") return t("m238");
    return t("m239");
  }

  private handleMessage(message: ChatMessage): void {
    if (message?.Type === 'Hidden' && ['HoldLeash','StopHoldLeash','PingHoldLeash','RemoveLeash'].includes(message.Content)) {
      const sender = this.state.characters.find(c => c.MemberNumber === message.Sender);
      if (sender && this.canSend() && this.state.phase === 'in-room' && (!message.Target || message.Target === this.state.player?.MemberNumber)) this.leash.message(sender, message.Content);
      return;
    }
    if (message?.Type === 'Action' && typeof message.Content === 'string' && message.Content.startsWith('ServerDisconnect') && message.Sender === this.state.leashHolder) { this.cancelTravel(); this.leash.clear(); }

    if (message?.Type === "Hidden" && message.Content === "Luzi_XCharacterDrawState" && this.state.characters.some(character => character.MemberNumber === message.Sender)) {
      const state = message.Dictionary?.[0] as { prevCharacter?: number; nextCharacter?: number; associatedAsset?: { group?: string; asset?: string } } | undefined;
      const peer = state?.prevCharacter ?? state?.nextCharacter;
      if (Number.isSafeInteger(peer) && peer! > 0 && peer !== message.Sender && state?.associatedAsset?.group === "ItemMisc" && state.associatedAsset.asset === "贴贴") this.cuddlePeers.set(message.Sender!, peer!);
      else this.cuddlePeers.delete(message.Sender!);
      if (this.cuddlePair?.peer === message.Sender && this.cuddlePeers.get(message.Sender!) !== this.state.player?.MemberNumber) this.stopCuddle();
      this.patch({ characters: [...this.state.characters] });
      return;
    }
    if (message?.Type === "Hidden" && ["BCEMsg", "LCEMsg"].includes(message.Content) && Array.isArray(message.Dictionary)) {
      const hello = message.Dictionary.find(entry => entry && typeof entry === "object" && "message" in entry) as { message?: { type?: string; lce?: string } } | undefined;
      if (hello?.message?.type === "Hello" && (message.Content === "LCEMsg" || typeof hello.message.lce === "string") && message.Sender !== this.state.player?.MemberNumber && this.state.characters.some(character => character.MemberNumber === message.Sender) && Date.now() - this.lastIdentityReply > 3000) {
        this.lastIdentityReply = Date.now(); this.announceLite(message.Sender);
      }
    }
    // BC Status packets (Talk, "null", Wardrobe, etc.) drive character indicators,
    // not chat history. Filter by packet type, never by user-entered content.
    if (!message || message.Type === "Hidden" || message.Type === "Status" || typeof message.Content !== "string") return;
    const presence = message.Type === "Action" && /^(ServerEnter|ServerLeave|ServerDisconnect|ServerBan|ServerKick)/.test(message.Content);
    const sender = this.findCharacter(message.Sender) || (presence ? this.departed.get(message.Sender!) : undefined);
    const target = this.findCharacter(message.Target);
    const dictionary = (Array.isArray(message.Dictionary) ? message.Dictionary : []).slice(0, 200).filter(entry => entry && typeof entry === "object").map((entry) => {
      if (dictionaryText(entry) || !Number.isFinite(entry.MemberNumber)) return entry;
      const character = this.findCharacter(entry.MemberNumber);
      return character ? { ...entry, CharacterName: character.Nickname?.trim() || character.Name } : entry;
    });
    const sourceId = dictionary.find(entry => typeof entry.SourceCharacter === "number")?.SourceCharacter;
    const targetId = dictionary.find(entry => typeof entry.TargetCharacter === "number")?.TargetCharacter;
    const sourceCharacter = this.findCharacter(typeof sourceId === "number" ? sourceId : message.Sender) || (presence ? sender : undefined);
    const targetCharacter = this.findCharacter(typeof targetId === "number" ? targetId : message.Target);
    const sourceName = presence && sourceCharacter?.Nickname && sourceCharacter.Nickname !== sourceCharacter.Name ? `${sourceCharacter.Nickname} [${sourceCharacter.Name}]` : sourceCharacter?.Nickname || sourceCharacter?.Name;
    if (presence && sourceName) for (const entry of dictionary) if (["SourceCharacter", "SourceCharacterName"].includes(entry.Tag || "")) entry.Text = sourceName;
    const targetEntry = dictionary.find(entry => ["TargetCharacter", "TargetCharacterName", "DestinationCharacter", "DestinationCharacterName"].includes(entry.Tag || ""));
    const destinationName = (targetEntry ? dictionaryText(targetEntry) : null) || targetCharacter?.Nickname || targetCharacter?.Name;
    for (const [tags, name] of [[['SourceCharacter', 'SourceCharacterName'], sourceName], [['TargetCharacter', 'TargetCharacterName', 'DestinationCharacter', 'DestinationCharacterName'], destinationName]] as const) {
      if (name) for (const tag of tags) if (!dictionary.some(entry => entry.Tag === tag)) dictionary.push({ Tag: tag, Text: name });
    }
    const translated = ["Action", "Activity", "ServerMessage"].includes(message.Type);
    const cuddle = /^ChatOther-(ItemTorso|ItemTorso2|ItemArms)-(钻进怀里|抱入怀中)$/.exec(message.Content);
    if (message.Type === "Activity" && cuddle && sourceId === message.Sender && targetId === this.state.player?.MemberNumber && sender && sender.MemberNumber !== this.state.player?.MemberNumber && this.canSend() && this.state.room && !cuddleReason(this.cuddleSelf(), sender) && Date.now() - this.cuddleRequestAt > 10000) {
      this.cuddleRequestAt = Date.now(); this.patch({ cuddleRequest: { sender: sender.MemberNumber, name: cuddle[2], expires: Date.now() + 60000 } });
    }
    this.appendMessage({
      id: crypto.randomUUID(), sender: message.Sender ?? null, senderName: displayName(sender),
      presence, labelColor: sender?.LabelColor,
      target: message.Type === "Whisper" ? message.Target ?? this.state.player?.MemberNumber : undefined,
      targetName: message.Type === "Whisper" ? displayName(target || this.state.player || undefined) : undefined,
      text: translated ? this.renderServerMessage(message.Content, message.Type, dictionary) : receivedSpeech(message.Content, message.Type, dictionary), type: message.Type, time: new Date(),
      ...(translated ? { translation: { content: message.Content, dictionary } } : {}),
      nativeId: typeof dictionary.find(entry => typeof entry.MsgId === "string")?.MsgId === "string" ? String(dictionary.find(entry => typeof entry.MsgId === "string")!.MsgId).slice(0, 256) : undefined,
      replyId: typeof dictionary.find(entry => entry.Tag === "ReplyId")?.ReplyId === "string" ? String(dictionary.find(entry => entry.Tag === "ReplyId")!.ReplyId) : undefined,
    });
  }

  private localMessage(text: string): void {
    this.appendMessage({ id: crypto.randomUUID(), sender: null, senderName: t("m240"), text, type: "Local", time: new Date() });
  }

  private appendMessage(message: DisplayMessage): void {
    message = { ...message, roomName: this.state.room?.Name };
    this.patch({ messages: [...this.state.messages, message].slice(-this.messageLimit), ...(message.type === "Whisper" ? { whispers: [...(this.state.whispers || []), message].slice(-300) } : {}) });
    this.publishMessage(message);
  }

  private upsertCharacter(character: CharacterSummary): CharacterSummary[] {
    return [...this.state.characters.filter((item) => item.MemberNumber !== character.MemberNumber), character].sort((a, b) => a.MemberNumber - b.MemberNumber);
  }

  private findCharacter(memberNumber: number | undefined): CharacterSummary | undefined {
    if (memberNumber === this.state.player?.MemberNumber) return this.state.player ?? undefined;
    return this.state.characters.find((character) => character.MemberNumber === memberNumber);
  }

  private canSend(): boolean { return Boolean(this.socket?.connected && this.loginAccepted && this.serverReady); }
  private clearRoomTimer(): void { if (this.roomTimer !== null) window.clearTimeout(this.roomTimer); this.roomTimer = null; }
  private startRoomTimer(): void {
    this.clearRoomTimer();
    this.roomTimer = window.setTimeout(() => {
      this.clearRoomTimer();
      this.cancelTravel(); this.leash.clear();
      this.patch({ phase: "ready", status: t("m241") });
    }, 12_000);
  }
  private clearSearchTimer(): void { this.searches.clearTimer(); }
  private patch(change: Partial<ClientSnapshot>): void {
    this.state = { ...this.state, ...change };
    if (this.state.leashHolder && this.state.phase === 'in-room' && (change.characters || change.player || change.room)) this.leash.current(this.state.characters);
    for (const listener of this.listeners) listener(this.state);
  }
}

export const bcClient = new BcLiteClient();
