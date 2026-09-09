import "./style.css";
import { bcClient } from "./protocol";
import type { ClientSnapshot, DisplayMessage, RoomSearchRequest, RoomSearchResult } from "./types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("找不到應用程式根節點");

const escapeText = (value: unknown): string => String(value ?? "");
class LiteApp {
  private snapshot: Readonly<ClientSnapshot> | null = null;
  private accountName = "";
  private password = "";
  private query = "";
  private chatDraft = "";
  private language: RoomSearchRequest["Language"] = "";
  private space: RoomSearchRequest["Space"] = "X";
  private newRoomName = "";
  private unlisted = true;
  private showFull = false;
  private showLocked = true;
  private searchDescriptions = false;
  private notice = "";

  constructor() {
    bcClient.subscribe((snapshot) => {
      this.snapshot = snapshot;
      this.render();
    });
  }

  private render(): void {
    if (!this.snapshot) return;
    const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    const focusId = active?.id;
    const selectionStart = active?.selectionStart;

    app!.replaceChildren(this.buildShell());
    if (focusId) {
      const next = document.getElementById(focusId) as HTMLInputElement | HTMLTextAreaElement | null;
      next?.focus({ preventScroll: true });
      if (next && selectionStart !== null && selectionStart !== undefined) next.setSelectionRange(selectionStart, selectionStart);
    }
  }

  private buildShell(): HTMLElement {
    const state = this.snapshot!;
    const shell = this.el("main", "app-shell");
    const header = this.el("header", "app-header");
    const brand = this.el("div", "brand");
    brand.append(this.el("span", "brand-mark", "BC"), this.el("div", "", "Lite"));
    const connection = this.el("div", `connection phase-${state.phase}`);
    connection.append(this.el("span", "status-dot"), this.el("span", "", state.status));
    header.append(brand, connection);

    const content = this.el("div", "app-content");
    if (state.phase === "idle" || state.phase === "connecting" || state.phase === "authenticating" || state.phase === "waiting-server" || state.phase === "reconnecting" || state.phase === "error") {
      content.append(this.buildLogin());
    } else if (state.room) {
      content.append(this.buildRoom());
    } else {
      content.append(this.buildSearch());
    }
    shell.append(header, content, this.buildFooter());
    return shell;
  }

  private buildLogin(): HTMLElement {
    const state = this.snapshot!;
    const wrap = this.el("section", "login-layout");
    const intro = this.el("div", "intro-panel");
    intro.append(
      this.el("p", "eyebrow", "LOW-BANDWIDTH CLIENT"),
      this.el("h1", "", "只帶聊天室，輕一點登入。"),
      this.el("p", "lede", "不載入角色繪圖、服裝素材與遊戲畫面；瀏覽器直接連到 BC，本站不經手也不儲存帳密。"),
      this.feature("WebSocket 直連", "沒有自架中繼伺服器"),
      this.feature("純文字聊天室", "搜尋、進房、聊天與密語"),
      this.feature("密碼只在記憶體", "重新整理或登出即消失"),
    );
    const card = this.el("form", "login-card") as HTMLFormElement;
    card.autocomplete = "off";
    card.append(this.el("h2", "", "登入 Bondage Club"));
    const account = this.input("AccountName", "帳號", "text", this.accountName);
    account.autocomplete = "username";
    account.addEventListener("input", () => { this.accountName = account.value; });
    const password = this.input("Password", "密碼", "password", this.password);
    password.autocomplete = "current-password";
    password.addEventListener("input", () => { this.password = password.value; });
    card.append(this.field("帳號", account), this.field("密碼", password));
    const busy = !["idle", "error"].includes(state.phase);
    const submit = this.button(busy ? "連線中…" : "登入", "primary", "submit");
    submit.disabled = busy;
    card.append(submit);
    if (busy) {
      const cancel = this.button("取消", "ghost", "button");
      cancel.addEventListener("click", () => bcClient.disconnect());
      card.append(cancel);
    }
    card.append(this.el("p", "security-note", "提醒：登入會讓同帳號在其他 BC 視窗斷線。請只使用你信任的部署網址。"));
    if (this.notice || state.phase === "error") card.append(this.el("div", "form-notice", this.notice || state.status));
    card.addEventListener("submit", (event) => {
      event.preventDefault();
      this.notice = "";
      try { bcClient.login(this.accountName, this.password); } catch (error) { this.notice = error instanceof Error ? error.message : "無法登入"; this.render(); }
    });
    wrap.append(intro, card);
    return wrap;
  }

  private buildSearch(): HTMLElement {
    const state = this.snapshot!;
    const section = this.el("section", "search-view");
    const heading = this.el("div", "view-heading");
    const titleWrap = this.el("div");
    titleWrap.append(this.el("p", "eyebrow", `登入為 ${state.player?.Nickname || state.player?.Name} #${state.player?.MemberNumber}`), this.el("h1", "", "搜尋聊天室"));
    const logout = this.button("登出", "ghost", "button");
    logout.addEventListener("click", () => { this.password = ""; bcClient.disconnect(); });
    heading.append(titleWrap, logout);

    const form = this.el("form", "search-form") as HTMLFormElement;
    const query = this.input("RoomQuery", "房名或描述", "search", this.query);
    query.addEventListener("input", () => { this.query = query.value; });
    const language = this.select("語言", [["", "全部"], ["EN", "EN"], ["CN", "CN"], ["DE", "DE"], ["FR", "FR"], ["ES", "ES"], ["RU", "RU"], ["UA", "UA"]], this.language);
    language.addEventListener("change", () => { this.language = language.value as RoomSearchRequest["Language"]; });
    const space = this.select("區域", [["X", "混合區 (X)"], ["", "女性區"], ["M", "男性區 (M)"]], this.space);
    space.addEventListener("change", () => { this.space = space.value as RoomSearchRequest["Space"]; });
    form.append(this.field("關鍵字", query), this.field("語言", language), this.field("區域", space));
    const options = this.el("div", "search-options");
    options.append(
      this.checkbox("包含已滿房間", this.showFull, (value) => { this.showFull = value; }),
      this.checkbox("顯示鎖定房間", this.showLocked, (value) => { this.showLocked = value; }),
      this.checkbox("同時搜尋描述", this.searchDescriptions, (value) => { this.searchDescriptions = value; }),
    );
    const search = this.button("搜尋", "primary", "submit");
    form.append(options, search);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.notice = "";
      try {
        bcClient.search({ Query: this.query, Language: this.language, Space: this.space, Game: "", FullRooms: this.showFull, ShowLocked: this.showLocked, SearchDescs: this.searchDescriptions });
      } catch (error) { this.notice = error instanceof Error ? error.message : "搜尋失敗"; this.render(); }
    });

    const resultHeader = this.el("div", "result-header");
    resultHeader.append(this.el("h2", "", "房間列表"), this.el("span", "result-count", `${state.rooms.length} 間`));
    const rooms = this.el("div", "room-list");
    if (!state.rooms.length) rooms.append(this.el("div", "empty-state", "輸入條件後搜尋；空白搜尋會列出公開房間。"));
    else state.rooms.forEach((room) => rooms.append(this.roomCard(room)));
    const status = this.el("p", "form-notice", this.notice || state.status);
    status.setAttribute("role", "status");
    const environment = state.player?.Environment;
    const diagnostics = this.el("div", "form-notice");
    diagnostics.append(this.el("p", "", `伺服器登入環境：${environment || "未提供（不能判定為 PROD）"} · 網頁來源：${location.origin}`));
    diagnostics.append(this.el("p", "", environment === "DEV"
      ? "你已登入 DEV 環境。BC 依網頁 Origin 分配環境；正式環境的好友和房間不會出現在這裡，建立房間也不會改變環境。"
      : environment === "PROD" ? "伺服器確認為正式環境。搜尋會排除隱藏房間；輸入完整房名可搜尋隱藏房間，仍受權限與其他篩選條件限制。"
      : "帳密驗證已通過，但伺服器未確認正式環境；不能只以登入成功或在線人數判定。"));
    diagnostics.append(this.el("small", "", `伺服器總在線人數：${state.onlinePlayers ?? "未知"}（不代表所在環境人數）`));
    const create = this.el("form", "search-form") as HTMLFormElement;
    const roomName = this.input("NewRoomName", "輸入房名", "text", this.newRoomName);
    roomName.maxLength = 20;
    roomName.addEventListener("input", () => { this.newRoomName = roomName.value; });
    const createButton = this.button("建立並進入", "primary", "submit");
    createButton.disabled = state.phase !== "ready";
    const directJoin = this.button("按房名加入", "secondary", "button");
    directJoin.disabled = state.phase !== "ready";
    directJoin.addEventListener("click", () => { if (create.reportValidity()) bcClient.join(this.newRoomName.trim()); });
    create.append(this.field("建立房間／直接加入（建立時沿用上方區域與語言）", roomName), this.checkbox("不列入公開搜尋", this.unlisted, value => { this.unlisted = value; }), createButton, directJoin);
    create.addEventListener("submit", event => {
      event.preventDefault();
      this.notice = "";
      try { bcClient.createRoom(this.newRoomName, this.space, this.language, this.unlisted); }
      catch (error) { this.notice = error instanceof Error ? error.message : "建立失敗"; this.render(); }
    });
    section.append(heading, form, status, diagnostics, this.el("h2", "", "建立或直接加入房間"), create, resultHeader, rooms);
    return section;
  }

  private roomCard(room: RoomSearchResult): HTMLElement {
    const card = this.el("article", "room-card");
    const top = this.el("div", "room-card-top");
    const meta = this.el("div", "room-tags");
    meta.append(this.el("span", "tag", room.Language || "—"), this.el("span", "tag", `${room.MemberCount}/${room.MemberLimit}`));
    if (room.Access && !room.Access.includes("All")) meta.append(this.el("span", "tag locked", "受限"));
    top.append(this.el("h3", "", room.Name), meta);
    card.append(top, this.el("p", "room-description", room.Description || "沒有房間描述"), this.el("p", "room-creator", `建立者：${room.Creator || `#${room.CreatorMemberNumber}`}`));
    const join = this.button(room.CanJoin ? "加入" : "無法加入", room.CanJoin ? "secondary" : "ghost", "button");
    join.disabled = !room.CanJoin || this.snapshot!.phase === "joining";
    join.addEventListener("click", () => bcClient.join(room.Name));
    card.append(join);
    return card;
  }

  private buildRoom(): HTMLElement {
    const state = this.snapshot!;
    const layout = this.el("section", "room-view");
    const sidebar = this.el("aside", "member-panel");
    const roomInfo = this.el("div", "room-info");
    roomInfo.append(this.el("p", "eyebrow", state.room!.Language || "CHAT ROOM"), this.el("h1", "", state.room!.Name), this.el("p", "", state.room!.Description || "沒有房間描述"));
    const leave = this.button("離開房間", "ghost danger", "button");
    leave.addEventListener("click", () => bcClient.leave());
    roomInfo.append(leave);
    sidebar.append(roomInfo, this.el("h2", "member-title", `房內成員 · ${state.characters.length}`));
    const members = this.el("div", "member-list");
    state.characters.forEach((character) => {
      const member = this.el("button", "member-row") as HTMLButtonElement;
      member.type = "button";
      member.append(this.el("span", "member-avatar", (character.Nickname || character.Name || "?").slice(0, 1).toUpperCase()), this.el("span", "member-name", character.Nickname || character.Name), this.el("span", "member-number", `#${character.MemberNumber}`));
      member.title = "點擊填入密語指令";
      member.addEventListener("click", () => { this.chatDraft = `/w ${character.MemberNumber} `; this.render(); document.getElementById("InputChat")?.focus(); });
      members.append(member);
    });
    sidebar.append(members);

    const chat = this.el("div", "chat-room-div");
    chat.id = "chat-room-div";
    const topMenu = this.el("div", "chat-room-top-menu");
    topMenu.id = "chat-room-top-menu";
    topMenu.append(this.el("strong", "", state.room!.Name), this.el("span", "", `${state.characters.length}/${state.room!.Limit}`));
    const mobileLeave = this.button("離開", "ghost", "button");
    mobileLeave.addEventListener("click", () => bcClient.leave());
    topMenu.append(mobileLeave);
    const struggle = this.el("div", "chat-room-struggle-bar"); struggle.id = "chat-room-struggle-bar";
    const log = this.el("div", "text-area-chat-log"); log.id = "TextAreaChatLog"; log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite");
    state.messages.forEach((message) => log.append(this.messageNode(message)));
    const reply = this.el("div", "chat-room-reply-indicator"); reply.id = "chat-room-reply-indicator";
    const bot = this.el("form", "chat-room-bot") as HTMLFormElement; bot.id = "chat-room-bot";
    const input = document.createElement("textarea"); input.id = "InputChat"; input.placeholder = "輸入訊息…（/me 動作，/w 編號 密語）"; input.maxLength = 1000; input.value = this.chatDraft;
    const length = this.el("span", "input-chat-length", `${this.chatDraft.length}/1000`); length.id = "InputChatLength";
    input.addEventListener("input", () => { this.chatDraft = input.value; length.textContent = `${input.value.length}/1000`; });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); bot.requestSubmit(); } });
    const buttons = this.el("div", "chat-room-buttons-div"); buttons.id = "chat-room-buttons-div";
    const inner = this.el("div", "chat-room-buttons"); inner.id = "chat-room-buttons";
    const send = this.button("傳送", "primary", "submit"); inner.append(length, send); buttons.append(inner); bot.append(input, buttons);
    bot.addEventListener("submit", (event) => {
      event.preventDefault();
      try { bcClient.sendChat(this.chatDraft); this.chatDraft = ""; input.value = ""; length.textContent = "0/1000"; }
      catch (error) { this.localNotice(error instanceof Error ? error.message : "訊息無法傳送"); }
    });
    chat.append(topMenu, struggle, log, reply, bot);
    requestAnimationFrame(() => { const current = document.getElementById("TextAreaChatLog"); if (current) current.scrollTop = current.scrollHeight; });
    layout.append(sidebar, chat);
    return layout;
  }

  private messageNode(message: DisplayMessage): HTMLElement {
    const row = this.el("div", `chat-message type-${message.type.toLowerCase()}`);
    row.dataset.messageId = message.id;
    const time = this.el("time", "message-time", message.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    if (message.type === "Local" || message.type === "ServerMessage" || message.type === "Status") {
      row.append(time, this.el("span", "message-system", message.text));
    } else if (message.type === "Emote") {
      row.append(time, this.el("span", "message-emote", `* ${message.senderName} ${message.text}`));
    } else if (message.type === "Whisper") {
      row.append(time, this.el("strong", "message-author", message.senderName), this.el("span", "message-target", ` → ${message.targetName}`), this.el("span", "message-text", message.text));
    } else {
      row.append(time, this.el("strong", "message-author", message.senderName), this.el("span", "message-text", message.text));
    }
    return row;
  }

  private buildFooter(): HTMLElement {
    const footer = this.el("footer", "app-footer");
    footer.append(this.el("span", "", "BC Lite · 靜態前端"), this.el("span", "", "非 Bondage Club 官方客戶端"));
    return footer;
  }

  private feature(title: string, text: string): HTMLElement {
    const row = this.el("div", "feature-row"); row.append(this.el("span", "feature-check", "✓"), this.el("div", "", title), this.el("small", "", text)); return row;
  }
  private field(label: string, control: HTMLElement): HTMLElement { const field = this.el("label", "field"); field.append(this.el("span", "field-label", label), control); return field; }
  private input(id: string, placeholder: string, type: string, value: string): HTMLInputElement { const input = document.createElement("input"); input.id = id; input.name = id; input.type = type; input.placeholder = placeholder; input.value = value; input.required = type !== "search"; return input; }
  private select(label: string, options: string[][], value: string): HTMLSelectElement { const select = document.createElement("select"); select.setAttribute("aria-label", label); for (const [key, text] of options) { const option = document.createElement("option"); option.value = key; option.textContent = text; option.selected = key === value; select.append(option); } return select; }
  private checkbox(label: string, checked: boolean, change: (value: boolean) => void): HTMLElement { const wrap = this.el("label", "checkbox"); const input = document.createElement("input"); input.type = "checkbox"; input.checked = checked; input.addEventListener("change", () => change(input.checked)); wrap.append(input, this.el("span", "", label)); return wrap; }
  private button(text: string, className: string, type: "button" | "submit"): HTMLButtonElement { const button = this.el("button", `button ${className}`, text) as HTMLButtonElement; button.type = type; return button; }
  private localNotice(message: string): void { this.notice = message; window.alert(message); }
  private el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = escapeText(text); return node; }
}

new LiteApp();
