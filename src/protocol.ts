import { io, type Socket } from "socket.io-client";
import type { CharacterSummary, ChatMessage, ClientSnapshot, DictionaryEntry, DisplayMessage, PlayerSummary, RoomSearchRequest, RoomSearchResult, RoomSync } from "./types";

const SERVER_URL = "https://bondage-club-server.herokuapp.com";
const MAX_MESSAGES = 600;
const SEARCH_TIMEOUT_MS = 8_000;

type Listener = (snapshot: Readonly<ClientSnapshot>) => void;
type Credentials = { accountName: string; password: string };

const initialSnapshot = (): ClientSnapshot => ({ phase: "idle", status: "尚未連線", player: null, rooms: [], room: null, characters: [], messages: [] });

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

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  login(accountName: string, password: string): void {
    const trimmedName = accountName.trim();
    if (!trimmedName || !password) throw new Error("請輸入帳號與密碼");
    this.disconnect();
    this.credentials = { accountName: trimmedName, password };
    this.manualDisconnect = false;
    this.loginAccepted = false;
    this.serverReady = false;
    this.patch({ ...initialSnapshot(), phase: "connecting", status: "正在連線到 BC…" });
    this.connectSocket();
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.credentials = null;
    this.loginAccepted = false;
    this.serverReady = false;
    this.clearSearchTimer();
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
    this.searchTimer = window.setTimeout(() => this.patch({ status: "搜尋逾時，請稍後再試" }), SEARCH_TIMEOUT_MS);
    this.socket!.emit("ChatRoomSearch", { ...request, Query: request.Query.toUpperCase().trim() });
  }

  join(roomName: string): void {
    if (!this.canSend() || !roomName.trim()) return;
    this.patch({ phase: "joining", status: `正在加入「${roomName}」…`, messages: [] });
    this.socket!.emit("ChatRoomJoin", { Name: roomName });
  }

  leave(): void {
    if (this.socket?.connected && this.state.room) this.socket.emit("ChatRoomLeave", "");
    this.patch({ phase: "ready", room: null, characters: [], messages: [], status: "已離開房間" });
  }

  sendChat(raw: string): void {
    const text = raw.trim();
    if (!text || !this.state.room || !this.canSend()) return;
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
    this.socket!.emit("ChatRoomChat", message);
    if (message.Type === "Whisper") this.handleMessage({ ...message, Sender: this.state.player?.MemberNumber });
  }

  private connectSocket(): void {
    this.socket = io(SERVER_URL, {
      transports: ["websocket"], upgrade: false, reconnection: true, reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000, reconnectionDelayMax: 15_000, timeout: 20_000,
    });
    this.socket.on("connect", () => {
      if (!this.credentials) return;
      this.patch({ phase: "authenticating", status: "連線成功，正在登入…" });
      this.socket!.emit("AccountLogin", { AccountName: this.credentials.accountName, Password: this.credentials.password });
    });
    this.socket.on("LoginQueue", (position: unknown) => this.patch({ status: `登入排隊中（第 ${String(position)} 位）…` }));
    this.socket.on("LoginResponse", (data: unknown) => this.handleLogin(data));
    this.socket.on("ServerInfo", () => {
      this.serverReady = true;
      if (this.loginAccepted && !this.state.room) this.patch({ phase: "ready", status: "登入成功，可以搜尋房間" });
    });
    this.socket.on("ChatRoomSearchResult", (rooms: RoomSearchResult[]) => {
      this.clearSearchTimer();
      const safeRooms = Array.isArray(rooms) ? rooms : [];
      this.patch({ rooms: safeRooms, status: `找到 ${safeRooms.length} 個房間` });
    });
    this.socket.on("ChatRoomSearchResponse", (result: unknown) => {
      if (result !== "JoinedRoom") this.patch({ phase: "ready", status: `無法加入房間：${String(result)}` });
    });
    this.socket.on("ChatRoomSync", (room: RoomSync) => {
      const characters = Array.isArray(room.Character) ? room.Character : [];
      this.patch({ phase: "in-room", room, characters, messages: [], status: `已加入「${room.Name}」` });
      this.localMessage(`已加入「${room.Name}」`);
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
      this.patch({ phase: "error", status });
      this.socket?.disconnect();
    });
    this.socket.on("disconnect", (reason) => {
      if (this.manualDisconnect || !this.credentials) return;
      this.serverReady = false;
      this.loginAccepted = false;
      this.patch({ phase: "reconnecting", status: `連線中斷（${reason}），正在重試…`, room: null, characters: [] });
    });
    this.socket.on("connect_error", () => {
      if (!this.manualDisconnect) this.patch({ phase: "reconnecting", status: "無法連線，正在重試…" });
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
    const player: PlayerSummary = { AccountName: value.AccountName, ID: value.ID, MemberNumber: value.MemberNumber!, Name: value.Name, Nickname: value.Nickname };
    this.patch({ player, phase: this.serverReady ? "ready" : "waiting-server", status: this.serverReady ? "登入成功，可以搜尋房間" : "登入成功，等待伺服器準備…" });
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
      targetName: message.Type === "Whisper" ? displayName(target) : undefined,
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
  private clearSearchTimer(): void { if (this.searchTimer !== null) window.clearTimeout(this.searchTimer); this.searchTimer = null; }
  private patch(change: Partial<ClientSnapshot>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener(this.state);
  }
}

export const bcClient = new BcLiteClient();
