import { io, type Socket } from "socket.io-client";
import type { CharacterSummary, ChatMessage, ClientSnapshot, DictionaryEntry, DisplayMessage, OnlineFriend, PlayerSummary, RoomCreateOptions, RoomSearchRequest, RoomSearchResult, RoomSync } from "./types";

const MAX_MESSAGES = 600;
const SEARCH_TIMEOUT_MS = 8_000;

type Listener = (snapshot: Readonly<ClientSnapshot>) => void;
type Credentials = { accountName: string; password: string };

const initialSnapshot = (): ClientSnapshot => ({ phase: "idle", status: "尚未連線", player: null, rooms: [], room: null, characters: [], messages: [], friends: [], friendsStatus: "尚未查詢", beeps: [] });

function displayName(character: CharacterSummary | undefined): string {
  if (!character) return "未知玩家";
  const name = character.Nickname?.trim() || character.Name?.trim() || "未知玩家";
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
  let text = content;
  for (const entry of dictionary) {
    if (!entry.Tag) continue;
    const replacement = dictionaryText(entry);
    if (replacement) text = text.replaceAll(entry.Tag, replacement);
  }
  return text;
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

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async login(accountName: string, password: string): Promise<void> {
    const trimmedName = accountName.trim();
    if (!trimmedName || !password) throw new Error("請輸入帳號與密碼");
    this.disconnect();
    this.credentials = { accountName: trimmedName, password };
    this.manualDisconnect = false;
    this.loginAccepted = false;
    this.serverReady = false;
    const attempt = this.credentials;
    this.patch({ ...initialSnapshot(), phase: "connecting", status: "正在檢查本站連線中繼…" });
    try {
      const response = await fetch("/api/relay-status", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      const data = await response.json();
      if (!response.ok || data.service !== "bc-lite-relay" || data.version !== 1) throw new Error();
      if (this.credentials !== attempt) return;
      this.connectSocket();
    } catch {
      if (this.credentials !== attempt) return;
      this.credentials = null;
      this.patch({ phase: "error", status: "中繼未就緒：請確認 Pages 已部署 _worker.js，並能開啟 /api/relay-status" });
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
    if (!this.canSend()) throw new Error("伺服器尚未準備完成");
    if (this.searchTimer !== null) throw new Error("上一個搜尋仍在進行中");
    this.patch({ rooms: [], status: "正在搜尋房間…" });
    this.clearSearchTimer();
    this.searchTimer = window.setTimeout(() => {
      this.clearSearchTimer();
      this.patch({ status: "搜尋逾時（未收到伺服器回應），可以重新搜尋" });
    }, SEARCH_TIMEOUT_MS);
    this.socket!.emit("ChatRoomSearch", { ...request, Query: request.Query.toUpperCase().trim() });
  }

  refreshFriends(): void {
    if (!this.canSend()) throw new Error("請等待連線恢復");
    if (this.friendsTimer !== null) throw new Error("好友查詢中，請稍候");
    this.friendsTimer = window.setTimeout(() => {
      this.clearFriendsTimer();
      this.patch({ friendsStatus: "查詢逾時；目前清單可能已過期，請重新整理" });
    }, SEARCH_TIMEOUT_MS);
    this.patch({ friendsStatus: "正在查詢好友…" });
    this.socket!.emit("AccountQuery", { Query: "OnlineFriends" });
  }

  setFriend(memberNumber: number, enabled: boolean): void {
    if (!this.canSend()) throw new Error("請等待連線恢復");
    if (!Number.isSafeInteger(memberNumber) || memberNumber <= 0 || memberNumber === this.state.player?.MemberNumber) throw new Error("請輸入其他玩家的有效編號");
    const current = this.state.player?.FriendList;
    if (!Array.isArray(current)) throw new Error("伺服器未提供完整好友清單，已停止修改以免覆寫資料");
    const next = enabled ? [...new Set([...current, memberNumber])] : current.filter(id => id !== memberNumber);
    this.socket!.emit("AccountUpdate", { FriendList: next });
    this.patch({ player: { ...this.state.player!, FriendList: next }, friendsStatus: "好友變更已送出（伺服器無確認回覆）；重新登入可核對" });
  }

  sendBeep(memberNumber: number, raw: string): void {
    if (!this.canSend()) throw new Error("未連線；訊息未送出，也不會在重連後補送");
    if (!Number.isSafeInteger(memberNumber) || memberNumber <= 0 || memberNumber === this.state.player?.MemberNumber) throw new Error("請輸入其他玩家的有效編號");
    const message = raw.trim();
    if (!message || message.length > 1000) throw new Error("BEEP 請填 1–1000 個字元");
    if (Date.now() - this.lastBeepAt < 1500) throw new Error("請稍等一下再傳送 BEEP");
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
    this.patch({ phase: "joining", status: `正在加入「${roomName}」…`, messages: [] });
    this.socket!.emit("ChatRoomJoin", { Name: roomName });
  }

  createRoom(name: string, space: RoomSearchRequest["Space"], language: RoomSearchRequest["Language"], unlisted: boolean, description = "BC Lite chat room", limit = 10, options: RoomCreateOptions = {}): void {
    if (!this.canSend() || this.state.phase !== "ready") throw new Error("請等待目前操作完成");
    if (!name.trim() || name.trim().length > 20) throw new Error("房名請填 1–20 個字元");
    if (description.length > 100 || !Number.isInteger(limit) || limit < 2 || limit > 10) throw new Error("描述最多 100 字，人數上限 2–10 人");
    for (const list of [options.Admin, options.Whitelist, options.Ban]) if (list && (list.length > 100 || list.some(id => !Number.isSafeInteger(id) || id <= 0))) throw new Error("名單必須為有效玩家編號，最多 100 人");
    for (const url of [options.Custom?.ImageURL, options.Custom?.MusicURL]) if (url && (!/^https:\/\//i.test(url) || url.length > 2000)) throw new Error("自訂網址請使用 HTTPS，最多 2000 字元");
    if (options.Game && !["ClubCard", "LARP", "MagicBattle", "GGTS"].includes(options.Game)) throw new Error("不支援的遊戲類型");
    const map = options.MapData;
    if (map && (!["Never", "Hybrid", "Always"].includes(map.Type) || [map.Tiles, map.Objects, map.Effects].some(value => value !== undefined && (typeof value !== "string" || value.length !== 1600)))) throw new Error("地圖格式不符：網格必須為 40×40（1600 字元）");
    this.startRoomTimer();
    this.patch({ phase: "joining", status: `正在建立「${name.trim()}」…` });
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
    this.patch({ phase: "ready", room: null, characters: [], messages: [], status: "已離開房間" });
  }

  sendChat(raw: string): void {
    const text = raw.trim();
    if (!text) return;
    if (!this.state.room || !this.canSend()) throw new Error("未連線或不在房間；草稿尚未送出");
    if (text.length > 1000) throw new Error("訊息不得超過 1000 個字元");
    if (Date.now() - this.lastChatAt < 350) throw new Error("傳送過快，請稍候；草稿仍保留");
    let message: ChatMessage;
    const whisper = text.match(/^\/w(?:hisper)?\s+(\d+)\s+([\s\S]+)$/i);
    if (whisper) {
      const target = Number(whisper[1]);
      if (!this.state.characters.some((character) => character.MemberNumber === target)) throw new Error("密語對象不在目前房間");
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
      this.patch({ phase: "authenticating", status: "連線成功，正在登入…" });
      this.socket!.emit("AccountLogin", { AccountName: this.credentials.accountName, Password: this.credentials.password });
    });
    this.socket.on("LoginQueue", (position: unknown) => this.patch({ status: `登入排隊中（第 ${String(position)} 位）…` }));
    this.socket.on("LoginResponse", (data: unknown) => this.handleLogin(data));
    this.socket.on("AccountQueryResult", (data: { Query?: string; Result?: OnlineFriend[] }) => {
      if (data?.Query !== "OnlineFriends") return;
      this.clearFriendsTimer();
      if (!Array.isArray(data.Result)) { this.patch({ friendsStatus: "好友回應格式錯誤，保留原清單" }); return; }
      const friends = data.Result.filter(friend => friend && Number.isSafeInteger(friend.MemberNumber) && typeof friend.MemberName === "string");
      this.patch({ friends, friendsStatus: `查詢完成：${friends.length} 位可見在線好友 · ${new Date().toLocaleTimeString()}` });
    });
    this.socket.on("AccountBeep", (data: { MemberNumber?: number; MemberName?: string; BeepType?: string; Message?: unknown }) => {
      // FCM sends normal text separately from attachment/control packets. Never show or execute those packets.
      if (!data || (data.BeepType && data.BeepType !== "") || !Number.isSafeInteger(data.MemberNumber) || data.MemberNumber! <= 0) return;
      if (data.Message !== undefined && typeof data.Message !== "string") return;
      this.addBeep(data.MemberNumber!, typeof data.MemberName === "string" ? data.MemberName : `#${data.MemberNumber}`, (data.Message || "（BEEP 通知）").slice(0, 1000), true);
    });
    this.socket.on("ServerInfo", (info: { OnlinePlayers?: number }) => {
      this.serverReady = true;
      this.patch({ onlinePlayers: typeof info?.OnlinePlayers === "number" ? info.OnlinePlayers : undefined });
      if (this.loginAccepted && this.state.phase === "waiting-server") this.patch({ phase: "ready", status: this.loginStatus() });
    });
    this.socket.on("ChatRoomSearchResult", (rooms: RoomSearchResult[]) => {
      this.clearSearchTimer();
      if (!Array.isArray(rooms)) { this.patch({ status: "搜尋回應格式不符，並非零個房間" }); return; }
      const safeRooms = rooms;
      this.patch({ rooms: safeRooms, status: `找到 ${safeRooms.length} 個房間` });
    });
    this.socket.on("ChatRoomSearchResponse", (result: unknown) => {
      if (this.state.phase !== "joining") { this.patch({ status: `房間回應：${String(result)}` }); return; }
      if (result !== "JoinedRoom") { this.clearRoomTimer(); this.patch({ phase: "ready", room: null, characters: [], status: `無法加入房間：${String(result)}` }); }
    });
    this.socket.on("ChatRoomCreateResponse", (result: unknown) => {
      if (result === "ChatRoomCreated") this.patch({ status: "房間已建立，等待房間同步…" });
      else { this.clearRoomTimer(); this.patch({ phase: "ready", status: `建立房間失敗：${String(result)}` }); }
    });
    this.socket.on("ChatRoomSync", (room: RoomSync) => {
      this.clearRoomTimer();
      const characters = Array.isArray(room.Character) ? room.Character : [];
      const sameRoom = this.state.room?.Name === room.Name;
      this.patch({ phase: "in-room", room, characters, messages: sameRoom ? this.state.messages : [], status: `已加入「${room.Name}」` });
      if (!sameRoom) this.localMessage(`已加入「${room.Name}」`);
    });
    this.socket.on("ChatRoomSyncMemberJoin", (data: { Character?: CharacterSummary }) => {
      if (!data?.Character) return;
      this.patch({ characters: this.upsertCharacter(data.Character) });
      this.localMessage(`${displayName(data.Character)} 加入房間`);
    });
    this.socket.on("ChatRoomSyncMemberLeave", (data: { SourceMemberNumber?: number }) => {
      const character = this.findCharacter(data?.SourceMemberNumber);
      this.patch({ characters: this.state.characters.filter((item) => item.MemberNumber !== data?.SourceMemberNumber) });
      this.localMessage(`${displayName(character)} 離開房間`);
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
      const status = reason === "ErrorDuplicatedLogin" ? "帳號已在別處登入" : `伺服器中斷：${String(reason)}`;
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
      this.patch({ friends: [], friendsStatus: "連線中斷，請重查好友狀態" });
      if (reason === "io server disconnect") {
        this.credentials = null;
        this.patch({ phase: "error", status: "伺服器終止連線，請重新登入", room: null, characters: [] });
      } else this.patch({ phase: "reconnecting", status: `連線中斷（${reason}），正在重試…`, room: null, characters: [] });
    });
    this.socket.on("connect_error", () => {
      if (!this.manualDisconnect && this.credentials) this.patch({ phase: "reconnecting", status: "中繼 WebSocket 連線失敗，正在重試；請檢查 Network 的 /socket.io/ 狀態" });
    });
  }

  private handleLogin(data: unknown): void {
    if (typeof data === "string") {
      this.credentials = null;
      this.patch({ phase: "error", status: data === "InvalidNamePassword" ? "帳號或密碼錯誤" : `登入失敗：${data}` });
      this.socket?.disconnect();
      return;
    }
    if (!data || typeof data !== "object") { this.patch({ phase: "error", status: "登入回應格式錯誤" }); return; }
    const value = data as Partial<PlayerSummary>;
    if (!value.AccountName || !value.Name || !value.ID || !Number.isFinite(value.MemberNumber)) {
      this.patch({ phase: "error", status: "登入資料不完整" }); return;
    }
    this.loginAccepted = true;
    const player: PlayerSummary = { AccountName: value.AccountName, ID: value.ID, MemberNumber: value.MemberNumber!, Name: value.Name, Nickname: value.Nickname,
      Description: value.Description, Owner: value.Owner, Ownership: value.Ownership, Lovership: value.Lovership,
      Environment: typeof value.Environment === "string" ? value.Environment : undefined,
      FriendList: Array.isArray(value.FriendList) && value.FriendList.every(Number.isSafeInteger) ? value.FriendList : undefined,
      Appearance: Array.isArray(value.Appearance) ? value.Appearance : undefined,
      OnlineSharedSettings: value.OnlineSharedSettings && typeof value.OnlineSharedSettings === "object" ? value.OnlineSharedSettings : undefined };
    this.patch({ player, phase: "waiting-server", status: "帳密驗證通過，等待伺服器資訊…" });
    if (this.serverReady) this.patch({ phase: "ready", status: this.loginStatus() });
  }

  private loginStatus(): string {
    const environment = this.state.player?.Environment;
    if (environment === "PROD") return "已登入正式環境 PROD";
    if (environment === "DEV") return "已登入 DEV；無法查詢 PROD 的好友與房間";
    return "帳密驗證通過；正式環境尚未確認";
  }

  private handleMessage(message: ChatMessage): void {
    if (!message || message.Type === "Hidden") return;
    const sender = this.findCharacter(message.Sender);
    const target = this.findCharacter(message.Target);
    const dictionary = message.Dictionary?.map((entry) => {
      if (dictionaryText(entry) || !Number.isFinite(entry.MemberNumber)) return entry;
      const character = this.findCharacter(entry.MemberNumber);
      return character ? { ...entry, CharacterName: character.Nickname?.trim() || character.Name } : entry;
    });
    this.appendMessage({
      id: crypto.randomUUID(), sender: message.Sender ?? null, senderName: displayName(sender),
      targetName: message.Type === "Whisper" ? displayName(target || this.state.player || undefined) : undefined,
      text: formatServerText(message.Content, dictionary), type: message.Type, time: new Date(),
    });
  }

  private localMessage(text: string): void {
    this.appendMessage({ id: crypto.randomUUID(), sender: null, senderName: "系統", text, type: "Local", time: new Date() });
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
      this.patch({ phase: "ready", status: "進房操作逾時，未收到 ChatRoomSync；可重試" });
    }, 12_000);
  }
  private clearSearchTimer(): void { if (this.searchTimer !== null) window.clearTimeout(this.searchTimer); this.searchTimer = null; }
  private patch(change: Partial<ClientSnapshot>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener(this.state);
  }
}

export const bcClient = new BcLiteClient();
