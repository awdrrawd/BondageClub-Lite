import { t, localizeStatus } from "./i18n";
import { io, type Socket } from "socket.io-client";
import type { CharacterSummary, ChatMessage, ClientSnapshot, DictionaryEntry, DisplayMessage, OnlineFriend, PlayerSummary, RoomCreateOptions, RoomSearchRequest, RoomSearchResult, RoomSync } from "./types";

const MAX_MESSAGES = 600;
const SEARCH_TIMEOUT_MS = 8_000;

type Listener = (snapshot: Readonly<ClientSnapshot>) => void;
type Credentials = { accountName: string; password: string };

const initialSnapshot = (): ClientSnapshot => ({ phase: "idle", status: t("m179"), player: null, rooms: [], room: null, characters: [], messages: [], friends: [], friendsQueryState: "idle", friendsStatus: t("m014"), beeps: [] });

function displayName(character: CharacterSummary | undefined): string {
  if (!character) return t("m180");
  const name = character.Nickname?.trim() || character.Name?.trim() || t("m180");
  return `${name} #${character.MemberNumber}`;
}

function dictionaryText(entry: DictionaryEntry): string | null {
  if (typeof entry.Text === "string") return entry.Text;
  if (typeof entry.CharacterName === "string") return entry.CharacterName;
  if (typeof entry.Name === "string") return entry.Name;
  if (typeof entry.AssetName === "string") return entry.AssetName;
  return null;
}

export function formatServerText(content: string, dictionary: DictionaryEntry[] = []): string {
  const replacements = new Map<string, string>();
  for (const entry of dictionary) {
    if (!entry.Tag) continue;
    const replacement = dictionaryText(entry);
    if (replacement !== null) replacements.set(entry.Tag, replacement);
  }
  const keys = [...replacements.keys()].sort((a, b) => b.length - a.length).map(key => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return keys.length ? content.replace(new RegExp(keys.join("|"), "g"), key => replacements.get(key)!) : content;
}

export class BcLiteClient {
  private socket: Socket | null = null;
  private credentials: Credentials | null = null;
  private listeners = new Set<Listener>();
  private state = initialSnapshot();
  private loginAccepted = false;
  private manualDisconnect = false;
  private serverReady = false;
  private searchTimer: number | null = null;
  private roomTimer: number | null = null;
  private friendsTimer: number | null = null;
  private lastBeepAt = 0;
  private lastChatAt = 0;
  private textCatalog: Record<string, string> = {};

  setTextCatalog(catalog: Record<string, string>): void {
    this.textCatalog = catalog;
    this.patch({ messages: this.state.messages.map(message => message.translation ? { ...message, text: this.renderServerMessage(message.translation.content, message.type, message.translation.dictionary) } : message) });
  }

  relocalize(): void {
    this.patch({ status: localizeStatus(this.state.status), friendsStatus: localizeStatus(this.state.friendsStatus), messages: this.state.messages.map(message => message.type === "Local" ? { ...message, text: localizeStatus(message.text), senderName: t("m240") } : message) });
  }

  private renderServerMessage(content: string, type: string, dictionary: DictionaryEntry[]): string {
    const key = type === "ServerMessage" ? `ServerMessage${content}` : content;
    const fallback = content === "ActionUse" ? t("action.use") : content === "ActionRemove" ? t("action.remove") : content === "ActionSwap" ? t("action.swap") : content;
    const template = Object.hasOwn(this.textCatalog, key) ? this.textCatalog[key] : Object.hasOwn(this.textCatalog, content) ? this.textCatalog[content] : fallback;
    const entries = dictionary.map(entry => {
      const group = entry.GroupName ?? entry.AssetGroupName;
      if (entry.Tag && typeof entry.TextToLookUp === "string") return { ...entry, Text: this.textCatalog[entry.TextToLookUp] || entry.TextToLookUp };
      if (entry.Tag && typeof entry.AssetName === "string") {
        const name = this.textCatalog[`Asset.${group}.${entry.AssetName}`] || entry.AssetName;
        return { ...entry, Text: typeof entry.CraftName === "string" && entry.CraftName ? entry.CraftName : name };
      }
      if (entry.Tag && typeof group === "string" && !entry.Text) return { ...entry, Text: this.textCatalog[`Group.${group}`] || group };
      return entry;
    });
    const focus = dictionary.find(entry => typeof entry.FocusGroupName === "string" || (!entry.Tag && typeof entry.AssetGroupName === "string"));
    if (focus) {
      const group = String(focus.FocusGroupName || focus.AssetGroupName);
      entries.push({ Tag: "FocusAssetGroup", Text: this.textCatalog[`Group.${group}`] || group });
    }
    return formatServerText(template, entries);
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

  search(request: RoomSearchRequest): void {
    if (!this.canSend()) throw new Error(t("m184"));
    if (this.searchTimer !== null) throw new Error(t("m185"));
    this.patch({ rooms: [], status: t("m186") });
    this.clearSearchTimer();
    this.searchTimer = window.setTimeout(() => {
      this.clearSearchTimer();
      this.patch({ status: t("m187") });
    }, SEARCH_TIMEOUT_MS);
    this.socket!.emit("ChatRoomSearch", { ...request, Query: request.Query.toUpperCase().trim() });
  }

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
    const message = raw.trim();
    if (!message || message.length > 1000) throw new Error(t("m196"));
    if (Date.now() - this.lastBeepAt < 1500) throw new Error(t("m197"));
    this.lastBeepAt = Date.now();
    this.socket!.emit("AccountBeep", { MemberNumber: memberNumber, BeepType: "", Message: message, IsSecret: true });
    this.addBeep(memberNumber, this.state.friends.find(friend => friend.MemberNumber === memberNumber)?.MemberName || `#${memberNumber}`, message, false);
  }

  clearBeeps(): void { this.patch({ beeps: [] }); }

  private clearFriendsTimer(): void {
    if (this.friendsTimer !== null) window.clearTimeout(this.friendsTimer);
    this.friendsTimer = null;
  }

  private addBeep(memberNumber: number, name: string, text: string, incoming: boolean): void {
    this.patch({ beeps: [...this.state.beeps, { id: crypto.randomUUID(), memberNumber, name, text, incoming, time: new Date() }].slice(-300) });
  }

  join(roomName: string): void {
    if (!this.canSend() || !roomName.trim() || this.state.phase !== "ready") return;
    this.startRoomTimer();
    this.patch({ phase: "joining", status: t("m198", [roomName]), messages: [] });
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

  leave(): void {
    if (this.socket?.connected && this.state.room) this.socket.emit("ChatRoomLeave", "");
    this.patch({ phase: "ready", room: null, characters: [], messages: [], status: t("m207") });
  }

  sendChat(raw: string): void {
    const text = raw.trim();
    if (!text) return;
    if (!this.state.room || !this.canSend()) throw new Error(t("m208"));
    if (text.length > 1000) throw new Error(t("m209"));
    if (Date.now() - this.lastChatAt < 350) throw new Error(t("m210"));
    let message: ChatMessage;
    const whisper = text.match(/^\/w(?:hisper)?\s+(\d+)\s+([\s\S]+)$/i);
    if (whisper) {
      const target = Number(whisper[1]);
      if (!this.state.characters.some((character) => character.MemberNumber === target)) throw new Error(t("m211"));
      message = { Type: "Whisper", Target: target, Content: whisper[2].trim() };
    } else if (/^\/me\s+/i.test(text)) {
      message = { Type: "Emote", Content: text.replace(/^\/me\s+/i, "").trim() };
    } else if (text.startsWith("*") && text.endsWith("*") && text.length > 2) {
      message = { Type: "Emote", Content: text.slice(1, -1).trim() };
    } else {
      message = { Type: "Chat", Content: text };
    }
    message.Dictionary = [{ Tag: "SourceCharacter", MemberNumber: this.state.player?.MemberNumber }];
    this.lastChatAt = Date.now();
    this.socket!.emit("ChatRoomChat", message);
    if (message.Type === "Whisper") this.handleMessage({ ...message, Sender: this.state.player?.MemberNumber });
  }

  private connectSocket(): void {
    this.socket = io(location.origin, {
      transports: ["websocket"], upgrade: false, reconnection: true, reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000, reconnectionDelayMax: 15_000, timeout: 20_000,
    });
    this.socket.on("connect", () => {
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
      this.clearFriendsTimer();
      if (!Array.isArray(data.Result)) { this.patch({ friendsQueryState: "error", friendsStatus: t("m214") }); return; }
      const friends = data.Result.filter(friend => friend && Number.isSafeInteger(friend.MemberNumber) && typeof friend.MemberName === "string");
      this.patch({ friends, friendsQueryState: "ready", friendsStatus: t("m215", [friends.length, new Date().toLocaleTimeString()]) });
    });
    this.socket.on("AccountBeep", (data: { MemberNumber?: number; MemberName?: string; BeepType?: string; Message?: unknown }) => {
      // FCM sends normal text separately from attachment/control packets. Never show or execute those packets.
      if (!data || (data.BeepType && data.BeepType !== "") || !Number.isSafeInteger(data.MemberNumber) || data.MemberNumber! <= 0) return;
      if (data.Message !== undefined && typeof data.Message !== "string") return;
      this.addBeep(data.MemberNumber!, typeof data.MemberName === "string" ? data.MemberName : `#${data.MemberNumber}`, (data.Message || t("m216")).slice(0, 1000), true);
    });
    this.socket.on("ServerInfo", (info: { OnlinePlayers?: number }) => {
      this.serverReady = true;
      this.patch({ onlinePlayers: typeof info?.OnlinePlayers === "number" ? info.OnlinePlayers : undefined });
      if (this.loginAccepted && this.state.phase === "waiting-server") this.patch({ phase: "ready", status: this.loginStatus() });
    });
    this.socket.on("ChatRoomSearchResult", (rooms: RoomSearchResult[]) => {
      this.clearSearchTimer();
      if (!Array.isArray(rooms)) { this.patch({ status: t("m217") }); return; }
      const safeRooms = rooms;
      this.patch({ rooms: safeRooms, status: t("m218", [safeRooms.length]) });
    });
    this.socket.on("ChatRoomSearchResponse", (result: unknown) => {
      if (this.state.phase !== "joining") { this.patch({ status: t("m219", [String(result)]) }); return; }
      if (result !== "JoinedRoom") { this.clearRoomTimer(); this.patch({ phase: "ready", room: null, characters: [], status: t("m220", [String(result)]) }); }
    });
    this.socket.on("ChatRoomCreateResponse", (result: unknown) => {
      if (result === "ChatRoomCreated") this.patch({ status: t("m221") });
      else { this.clearRoomTimer(); this.patch({ phase: "ready", status: t("m222", [String(result)]) }); }
    });
    this.socket.on("ChatRoomSync", (room: RoomSync) => {
      this.clearRoomTimer();
      const characters = Array.isArray(room.Character) ? room.Character : [];
      const sameRoom = this.state.room?.Name === room.Name;
      this.patch({ phase: "in-room", room, characters, messages: sameRoom ? this.state.messages : [], status: t("m223", [room.Name]) });
      if (!sameRoom) this.localMessage(t("m223", [room.Name]));
    });
    this.socket.on("ChatRoomSyncMemberJoin", (data: { Character?: CharacterSummary }) => {
      if (!data?.Character) return;
      this.patch({ characters: this.upsertCharacter(data.Character) });
      this.localMessage(t("m224", [displayName(data.Character)]));
    });
    this.socket.on("ChatRoomSyncMemberLeave", (data: { SourceMemberNumber?: number }) => {
      const character = this.findCharacter(data?.SourceMemberNumber);
      this.patch({ characters: this.state.characters.filter((item) => item.MemberNumber !== data?.SourceMemberNumber) });
      this.localMessage(t("m225", [displayName(character)]));
    });
    for (const event of ["ChatRoomSyncCharacter", "ChatRoomSyncSingle"]) {
      this.socket.on(event, (data: { Character?: CharacterSummary }) => {
        if (data?.Character) this.patch({ characters: this.upsertCharacter(data.Character) });
      });
    }
    this.socket.on("ChatRoomSyncRoomProperties", (room: Partial<RoomSync>) => {
      if (this.state.room) this.patch({ room: { ...this.state.room, ...room } });
    });
    this.socket.on("ChatRoomMessage", (message: ChatMessage) => this.handleMessage(message));
    this.socket.on("ForceDisconnect", (reason: unknown) => {
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
      if (this.manualDisconnect || !this.credentials) return;
      this.serverReady = false;
      this.loginAccepted = false;
      this.clearSearchTimer();
      this.clearRoomTimer();
      this.clearFriendsTimer();
      this.patch({ friends: [], friendsQueryState: "idle", friendsStatus: t("m228") });
      if (reason === "io server disconnect") {
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
      Description: value.Description, Owner: value.Owner, Ownership: value.Ownership, Lovership: value.Lovership,
      Environment: typeof value.Environment === "string" ? value.Environment : undefined,
      FriendList: Array.isArray(value.FriendList) && value.FriendList.every(Number.isSafeInteger) ? value.FriendList : undefined,
      Appearance: Array.isArray(value.Appearance) ? value.Appearance : undefined,
      OnlineSharedSettings: value.OnlineSharedSettings && typeof value.OnlineSharedSettings === "object" ? value.OnlineSharedSettings : undefined };
    this.patch({ player, phase: "waiting-server", status: t("m236") });
    if (this.serverReady) this.patch({ phase: "ready", status: this.loginStatus() });
  }

  private loginStatus(): string {
    const environment = this.state.player?.Environment;
    if (environment === "PROD") return t("m237");
    if (environment === "DEV") return t("m238");
    return t("m239");
  }

  private handleMessage(message: ChatMessage): void {
    // BC Status packets (Talk, "null", Wardrobe, etc.) drive character indicators,
    // not chat history. Filter by packet type, never by user-entered content.
    if (!message || message.Type === "Hidden" || message.Type === "Status" || typeof message.Content !== "string") return;
    const sender = this.findCharacter(message.Sender);
    const target = this.findCharacter(message.Target);
    const dictionary = (Array.isArray(message.Dictionary) ? message.Dictionary : []).filter(entry => entry && typeof entry === "object").map((entry) => {
      if (dictionaryText(entry) || !Number.isFinite(entry.MemberNumber)) return entry;
      const character = this.findCharacter(entry.MemberNumber);
      return character ? { ...entry, CharacterName: character.Nickname?.trim() || character.Name } : entry;
    });
    const sourceId = dictionary.find(entry => typeof entry.SourceCharacter === "number")?.SourceCharacter;
    const targetId = dictionary.find(entry => typeof entry.TargetCharacter === "number")?.TargetCharacter;
    const sourceCharacter = this.findCharacter(typeof sourceId === "number" ? sourceId : message.Sender);
    const targetCharacter = this.findCharacter(typeof targetId === "number" ? targetId : message.Target);
    const sourceName = sourceCharacter?.Nickname || sourceCharacter?.Name;
    const targetEntry = dictionary.find(entry => ["TargetCharacter", "TargetCharacterName", "DestinationCharacter", "DestinationCharacterName"].includes(entry.Tag || ""));
    const destinationName = (targetEntry ? dictionaryText(targetEntry) : null) || targetCharacter?.Nickname || targetCharacter?.Name;
    for (const [tags, name] of [[['SourceCharacter', 'SourceCharacterName'], sourceName], [['TargetCharacter', 'TargetCharacterName', 'DestinationCharacter', 'DestinationCharacterName'], destinationName]] as const) {
      if (name) for (const tag of tags) if (!dictionary.some(entry => entry.Tag === tag)) dictionary.push({ Tag: tag, Text: name });
    }
    const translated = ["Action", "Activity", "ServerMessage"].includes(message.Type);
    this.appendMessage({
      id: crypto.randomUUID(), sender: message.Sender ?? null, senderName: displayName(sender),
      target: message.Type === "Whisper" ? message.Target ?? this.state.player?.MemberNumber : undefined,
      targetName: message.Type === "Whisper" ? displayName(target || this.state.player || undefined) : undefined,
      text: translated ? this.renderServerMessage(message.Content, message.Type, dictionary) : message.Content, type: message.Type, time: new Date(),
      ...(translated ? { translation: { content: message.Content, dictionary } } : {}),
    });
  }

  private localMessage(text: string): void {
    this.appendMessage({ id: crypto.randomUUID(), sender: null, senderName: t("m240"), text, type: "Local", time: new Date() });
  }

  private appendMessage(message: DisplayMessage): void {
    this.patch({ messages: [...this.state.messages, message].slice(-MAX_MESSAGES) });
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
      this.patch({ phase: "ready", status: t("m241") });
    }, 12_000);
  }
  private clearSearchTimer(): void { if (this.searchTimer !== null) window.clearTimeout(this.searchTimer); this.searchTimer = null; }
  private patch(change: Partial<ClientSnapshot>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener(this.state);
  }
}

export const bcClient = new BcLiteClient();
