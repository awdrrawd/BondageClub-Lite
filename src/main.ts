import "./style.css";
import { bcClient } from "./protocol";
import { decodeBiography } from "./biography";
import { loadTextCatalog } from "./text-catalog";
import type { CharacterSummary, ClientSnapshot, DisplayMessage, RoomCreateOptions, RoomSearchRequest, RoomSearchResult } from "./types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("找不到應用程式根節點");

const escapeText = (value: unknown): string => String(value ?? "");
class LiteApp {
  private snapshot: Readonly<ClientSnapshot> | null = null;
  private accountName = "";
  private rememberAccount = false;
  private password = "";
  private query = "";
  private chatDraft = "";
  private language: RoomSearchRequest["Language"] = "";
  private space: RoomSearchRequest["Space"] = "X";
  private newRoomName = "";
  private newRoomDescription = "BC Lite chat room";
  private newRoomLimit = 10;
  private roomMode: "search" | "create" = "search";
  private friendFilter = "all";
  private createFields = { Background: "MainHall", Admin: "", Whitelist: "", Ban: "", ImageURL: "", MusicURL: "", Game: "", Visibility: "", Access: "All", MapType: "Never", Fog: false, MapJSON: "", BlockCategory: [] as string[] };
  private roomPageSize = 40;
  private unlisted = true;
  private showFull = false;
  private showLocked = true;
  private searchDescriptions = false;
  private notice = "";
  private tab: "rooms" | "chat" | "friends" | "settings" = "rooms";
  private friendQuery = "";
  private contact = 0;
  private beepDraft = "";
  private contactDrafts = new Map<number, string>();
  private privateMode = "beep";
  private catalogLoading = false;
  private membersOpen = false;
  private visibleMessages = 100;
  private unread = 0;
  private roomUnread = 0;
  private composing = false;
  private renderPending = false;
  private settings = { background: false, largeText: false, timestamps: true };

  constructor() {
    app!.addEventListener("compositionstart", () => { this.composing = true; });
    app!.addEventListener("compositionend", () => {
      this.composing = false;
      // The final input event follows compositionend. Read its draft before replacing controls.
      window.setTimeout(() => { if (this.renderPending) { this.renderPending = false; this.render(); } }, 0);
    });
    try {
      const saved = JSON.parse(localStorage.getItem("bc-lite-display-v1") || "{}");
      this.settings = { background: saved.background === true, largeText: saved.largeText === true, timestamps: saved.timestamps !== false };
    } catch { /* Storage can be unavailable in private browsing. */ }
    try {
      const savedAccount = localStorage.getItem("bc-lite-account-v1");
      if (savedAccount && savedAccount.length <= 100) { this.accountName = savedAccount; this.rememberAccount = true; }
    } catch { /* Remembering an account is optional. */ }
    this.applySettings();
    bcClient.subscribe((snapshot) => {
      const previous = this.snapshot;
      this.snapshot = snapshot;
      if (snapshot.player && !this.catalogLoading) {
        this.catalogLoading = true;
        void loadTextCatalog().then(catalog => bcClient.setTextCatalog(catalog)).catch(() => { this.localNotice("互動文字表載入失敗，暫時顯示原始鍵名；重新整理可重試。"); });
      }
      if (!snapshot.player) this.contactDrafts.clear();
      if (previous && snapshot.messages !== previous.messages && snapshot.messages.some((message, index) => message.id === previous.messages[index]?.id && message.text !== previous.messages[index]?.text)) { this.render(); return; }
      if (!["ready", "joining", "in-room"].includes(snapshot.phase)) document.querySelectorAll(".profile-dialog").forEach(dialog => dialog.remove());
      if (!snapshot.player) { this.unread = 0; this.contact = 0; this.beepDraft = ""; this.chatDraft = ""; this.tab = "rooms"; }
      if (snapshot.room && !previous?.room) { this.tab = "chat"; this.visibleMessages = 100; }
      if (!snapshot.room && previous?.room && this.tab === "chat") this.tab = "rooms";
      if (previous && snapshot.beeps !== previous.beeps && snapshot.beeps.at(-1)?.incoming && this.tab !== "friends") this.unread++;
      if (previous && snapshot.messages !== previous.messages && snapshot.messages.length && this.tab !== "chat") this.roomUnread++;
      // Chat packets and server population updates never replace an active composer (including IME input).
      if (previous && snapshot.phase === previous.phase && snapshot.player === previous.player && snapshot.room === previous.room && snapshot.characters === previous.characters && snapshot.rooms === previous.rooms) {
        this.updateHeader();
        this.updateChatLog();
        if (snapshot.friends !== previous.friends || snapshot.friendsStatus !== previous.friendsStatus || snapshot.beeps !== previous.beeps || snapshot.messages !== previous.messages) this.updateFriendContent();
        return;
      }
      this.render();
    });
  }

  private applySettings(): void {
    document.body.classList.toggle("scenic", this.settings.background);
    document.body.classList.toggle("large-text", this.settings.largeText);
    document.body.classList.toggle("hide-times", !this.settings.timestamps);
  }

  private saveAccountPreference(): void {
    try {
      if (this.rememberAccount && this.accountName.trim()) localStorage.setItem("bc-lite-account-v1", this.accountName.trim());
      else localStorage.removeItem("bc-lite-account-v1");
    } catch {
      this.localNotice("無法存取本機儲存空間；保存或刪除可能未完成，請到瀏覽器網站資料設定確認。登入功能仍可使用。");
    }
  }

  private accountPrivacyNote(): HTMLElement {
    return this.el("p", "security-note", "記住帳號為自願選項，預設關閉；僅將帳號明文存入此瀏覽器、此網站的 localStorage（bc-lite-account-v1），不存密碼、不另送往帳號保存服務。登出仍會保留，取消勾選或清除本站資料可刪除。同源網頁程式、有權限的擴充套件或使用此裝置的人可能讀取；網站遭入侵亦可能外洩。共用裝置請勿使用，啟用前請自行評估並承擔本機保存風險。這不是加密保管庫，也與瀏覽器密碼管理器分開。");
  }

  private updateHeader(): void {
    const connection = document.querySelector(".connection span:last-child");
    if (connection) connection.textContent = this.snapshot!.status;
    const friends = document.getElementById("nav-friends");
    if (friends) friends.textContent = `好友${this.unread ? ` · ${this.unread}` : ""}`;
    const chat = document.getElementById("nav-chat");
    if (chat) chat.textContent = `聊天${this.roomUnread ? ` · ${this.roomUnread}` : ""}`;
  }

  private updateChatLog(force = false): void {
    const log = document.getElementById("TextAreaChatLog");
    if (!log) return;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 70;
    const latest = this.snapshot!.messages.at(-1)?.id || "";
    if (!force && log.dataset.latest === latest) return;
    const jump = document.getElementById("new-messages");
    // Freeze the visible slice while reading older messages; no scroll jump or unbounded hidden DOM.
    if (!force && !atBottom && log.childElementCount) { if (jump) jump.hidden = false; return; }
    const messages = this.snapshot!.messages.slice(-this.visibleMessages);
    const ids = new Set(messages.map(message => message.id));
    for (const node of Array.from(log.children)) if (!ids.has((node as HTMLElement).dataset.messageId || "")) node.remove();
    const existing = new Set(Array.from(log.children).map(node => (node as HTMLElement).dataset.messageId));
    const fragment = document.createDocumentFragment();
    for (const message of messages) if (!existing.has(message.id)) fragment.append(this.messageNode(message));
    log.append(fragment);
    log.dataset.latest = latest;
    if (atBottom || force) log.scrollTop = log.scrollHeight;
    if (jump) jump.hidden = true;
  }

  private render(): void {
    if (!this.snapshot) return;
    if (this.composing) { this.renderPending = true; return; }
    const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    const focusId = active?.id;
    const selectionStart = active?.selectionStart;
    const selectionEnd = active?.selectionEnd;
    const oldLog = document.getElementById("TextAreaChatLog");
    const oldScroll = oldLog?.scrollTop;
    const oldRoom = oldLog?.dataset.room;

    app!.replaceChildren(this.buildShell());
    this.updateHeader();
    const nextLog = document.getElementById("TextAreaChatLog");
    if (nextLog) nextLog.scrollTop = oldRoom === this.snapshot.room?.Name && oldScroll !== undefined ? oldScroll : nextLog.scrollHeight;
    if (focusId) {
      const next = document.getElementById(focusId) as HTMLInputElement | HTMLTextAreaElement | null;
      next?.focus({ preventScroll: true });
      if (next && selectionStart !== null && selectionStart !== undefined && ["text", "search", "password", "textarea"].includes(next.type)) next.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
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
    if (state.player) {
      const account = this.el("div", "header-account");
      const name = this.button(`${state.player.Nickname || state.player.Name} (#${state.player.MemberNumber})`, "ghost", "button");
      name.addEventListener("click", () => this.showMember(state.characters.find(character => character.MemberNumber === state.player!.MemberNumber) || state.player!));
      const logout = this.button("登出", "ghost", "button");
      logout.addEventListener("click", () => { if (window.confirm("確定登出？本次聊天與草稿將清除。")) bcClient.disconnect(); });
      account.append(name, logout); header.append(account);
    }

    const content = this.el("div", "app-content");
    if (state.phase === "idle" || state.phase === "connecting" || state.phase === "authenticating" || state.phase === "waiting-server" || state.phase === "reconnecting" || state.phase === "error") {
      content.append(this.buildLogin());
    } else if (this.tab === "friends") {
      content.append(this.buildFriends());
    } else if (this.tab === "settings") {
      content.append(this.buildSettings());
    } else if (state.room && this.tab === "chat") {
      content.append(this.buildRoom());
    } else {
      content.append(this.buildSearch());
    }
    shell.append(header, content);
    if (state.player && ["ready", "joining", "in-room"].includes(state.phase)) shell.append(this.buildNavigation());
    shell.append(this.buildFooter());
    return shell;
  }

  private buildNavigation(): HTMLElement {
    const nav = this.el("nav", "app-nav");
    nav.setAttribute("aria-label", "主要功能");
    for (const [key, label] of [["rooms", "房間"], ["chat", "聊天"], ["friends", "好友"], ["settings", "設定"]] as const) {
      const button = this.button(label, this.tab === key ? "active" : "ghost", "button");
      button.id = `nav-${key}`;
      button.setAttribute("aria-current", this.tab === key ? "page" : "false");
      button.disabled = key === "chat" && !this.snapshot!.room;
      button.addEventListener("click", () => {
        this.tab = key;
        if (key === "friends") this.unread = 0;
        if (key === "chat") this.roomUnread = 0;
        this.render();
        if (key === "friends" && this.snapshot!.friendsStatus === "尚未查詢") this.run(() => bcClient.refreshFriends());
      });
      nav.append(button);
    }
    return nav;
  }

  private buildFriends(): HTMLElement {
    const section = this.el("section", "friends-view");
    section.append(this.el("p", "eyebrow", "CONTACTS & BEEP"), this.el("h1", "", "好友與私訊"));
    section.append(this.el("p", "muted", "原生 BEEP 可跨房間，與 BC／FCM 文字互通。送出不代表已送達；離線訊息不會排隊補送。"));
    const toolbar = this.el("div", "toolbar");
    const refresh = this.button("重新查詢在線好友", "secondary", "button");
    refresh.addEventListener("click", () => this.run(() => bcClient.refreshFriends()));
    const query = this.input("FriendQuery", "搜尋名字或編號", "search", this.friendQuery);
    query.addEventListener("input", () => { this.friendQuery = query.value; this.updateFriendContent(); });
    toolbar.append(query, refresh);
    const filters = this.el("div", "toolbar friend-filters");
    for (const [value, label] of [["all", "全部"], ["online", "在線"], ["offline", "不在線"], ["unknown", "未確認"]]) {
      const button = this.button(label, this.friendFilter === value ? "secondary" : "ghost", "button");
      button.setAttribute("aria-pressed", String(this.friendFilter === value));
      button.addEventListener("click", () => { this.friendFilter = value; this.render(); });
      filters.append(button);
    }
    const status = this.el("p", "muted"); status.id = "friends-status";
    const list = this.el("div", "contact-list"); list.id = "contact-list";
    const form = this.el("form", "beep-compose") as HTMLFormElement;
    const target = this.input("BeepTarget", "玩家編號", "number", this.contact ? String(this.contact) : "");
    target.min = "1"; target.step = "1";
    target.addEventListener("change", () => this.openConversation(Number(target.value)));
    const text = document.createElement("textarea"); text.id = "BeepText"; text.placeholder = "BEEP 文字（不公開你的房間位置）"; text.maxLength = 1000; text.required = true; text.value = this.beepDraft;
    text.addEventListener("input", () => { this.beepDraft = text.value; });
    const add = this.button("加入好友", "ghost", "button");
    add.addEventListener("click", () => this.run(() => bcClient.setFriend(this.contact, true)));
    const channel = this.select("私訊方式", [["beep", "BEEP（跨房間）"], ["whisper", "密語（僅限同房）"]], this.privateMode);
    channel.addEventListener("change", () => { this.privateMode = channel.value; this.updateBeepLog(); });
    const send = this.button("送出私訊", "primary", "submit");
    form.append(this.field("對象編號", target), this.field("私訊方式", channel), text, add, send);
    form.addEventListener("submit", event => {
      event.preventDefault();
      this.run(() => {
        if (this.privateMode === "whisper") {
          if (!this.beepDraft.trim()) return;
          if (!this.snapshot!.characters.some(character => character.MemberNumber === this.contact)) throw new Error("對象不在同房，請改用 BEEP；不會自動改道發送");
          bcClient.sendChat(`/w ${this.contact} ${this.beepDraft}`);
        } else bcClient.sendBeep(this.contact, this.beepDraft);
        this.beepDraft = ""; this.contactDrafts.delete(this.contact); text.value = "";
      });
    });
    const inbox = this.el("div", "beep-log"); inbox.id = "beep-log"; inbox.setAttribute("role", "log");
    const clear = this.button("清除本次 BEEP 紀錄", "ghost", "button");
    clear.addEventListener("click", () => { if (window.confirm("只清除此頁記憶體中的 BEEP 紀錄？")) bcClient.clearBeeps(); });
    section.append(toolbar, filters, status, list, this.el("h2", "", "好友私訊"), form, inbox, clear);
    // Populate detached containers; later updates only touch list and log, never the composer.
    this.fillFriendList(list);
    status.textContent = this.snapshot!.friendsStatus;
    this.fillBeepLog(inbox);
    return section;
  }

  private updateFriendContent(): void {
    const list = document.getElementById("contact-list");
    if (list) this.fillFriendList(list);
    const status = document.getElementById("friends-status");
    if (status) status.textContent = this.snapshot!.friendsStatus;
    this.updateBeepLog();
  }

  private openConversation(memberNumber: number, mode = "beep"): void {
    this.contactDrafts.set(this.contact, this.beepDraft);
    this.contact = memberNumber;
    this.beepDraft = this.contactDrafts.get(memberNumber) || "";
    this.privateMode = mode; this.tab = "friends"; this.unread = 0;
    this.render(); document.getElementById("BeepText")?.focus();
  }

  private fillFriendList(list: HTMLElement): void {
    list.replaceChildren();
    const state = this.snapshot!;
    const online = new Map(state.friends.map(friend => [friend.MemberNumber, friend]));
    const ids = [...new Set([...online.keys(), ...(state.player?.FriendList || []), ...state.beeps.map(message => message.memberNumber)])];
    ids.sort((a, b) => Number(online.has(b)) - Number(online.has(a)) || a - b);
    let total = 0;
    for (const id of ids) {
      const friend = online.get(id);
      const inRoom = state.characters.some(character => character.MemberNumber === id);
      const fresh = state.friendsStatus.startsWith("查詢完成");
      const presence = inRoom || (friend && fresh) ? "online" : fresh && state.player?.FriendList?.includes(id) ? "offline" : "unknown";
      if (this.friendFilter !== "all" && this.friendFilter !== presence) continue;
      const name = friend?.MemberName || state.characters.find(character => character.MemberNumber === id)?.Name || [...state.beeps].reverse().find(message => message.memberNumber === id)?.name || "尚無名稱";
      if (!`${name} ${id}`.toLowerCase().includes(this.friendQuery.trim().toLowerCase())) continue;
      total++;
      if (total > 80) continue;
      const row = this.el("article", "contact-card");
      const info = this.el("div");
      info.append(this.el("strong", "", `${name} #${id}`), this.el("p", "muted", friend && fresh ? `在線 · ${friend.ChatRoomName || "未公開房間"}${friend.Private ? "（隱藏）" : ""} · ${friend.Type}` : inRoom ? "在線 · 同一房間" : presence === "offline" ? "不在線（依最後查詢；可能受隱私限制）" : "尚未確認在線狀態"));
      const chat = this.button("BEEP", "secondary", "button");
      chat.addEventListener("click", () => this.openConversation(id));
      row.append(info);
      if (friend?.ChatRoomName) {
        const join = this.button("前往房間", "ghost", "button");
        join.disabled = !["ready", "in-room"].includes(state.phase);
        join.title = "前往其他房間前會確認離開目前房間";
        join.addEventListener("click", () => this.joinRoom(friend.ChatRoomName!));
        row.append(join);
      }
      row.append(chat);
      if (inRoom) {
        const whisper = this.button("私訊（密語）", "secondary", "button");
        whisper.addEventListener("click", () => this.openConversation(id, "whisper")); row.append(whisper);
      }
      if (state.player?.FriendList?.includes(id)) {
        const remove = this.button("移除", "ghost danger", "button");
        remove.addEventListener("click", () => { if (window.confirm(`確定從 BC 好友清單移除 #${id}？`)) this.run(() => bcClient.setFriend(id, false)); });
        row.append(remove);
      }
      list.append(row);
    }
    if (!total) list.append(this.el("p", "empty-state", "沒有符合的聯絡人；可重新查詢，或直接輸入玩家編號。"));
    if (total > 80) list.append(this.el("p", "muted", `顯示前 80 / ${total} 位，請用搜尋縮小清單。`));
  }

  private updateBeepLog(): void { const log = document.getElementById("beep-log"); if (log) this.fillBeepLog(log); }

  private fillBeepLog(log: HTMLElement): void {
    log.replaceChildren();
    if (this.privateMode === "whisper") {
      const messages = this.snapshot!.messages.filter(message => message.type === "Whisper" && (message.sender === this.contact || (message.sender === this.snapshot!.player?.MemberNumber && message.target === this.contact))).slice(-60);
      for (const message of messages) log.append(this.messageNode(message));
      if (!messages.length) log.append(this.el("p", "muted", "尚無本房間的密語紀錄。密語僅限同房；跨房請選 BEEP。"));
      return;
    }
    const messages = this.snapshot!.beeps.filter(message => !this.contact || message.memberNumber === this.contact).slice(-60);
    if (!messages.length) log.append(this.el("p", "muted", "尚無本次對話紀錄。最多保留 300 則 BEEP，登出／重新整理即清除。"));
    for (const message of messages.reverse()) {
      const row = this.el("article", `beep-message ${message.incoming ? "incoming" : "outgoing"}`);
      const reply = this.button(`${message.incoming ? "收到" : "已送出，未確認送達"} · ${message.name} #${message.memberNumber}`, "ghost", "button");
      reply.addEventListener("click", () => this.openConversation(message.memberNumber));
      row.append(reply, this.el("time", "message-time", message.time.toLocaleTimeString()), this.el("p", "message-text", message.text));
      log.append(row);
    }
  }

  private buildSettings(): HTMLElement {
    const section = this.el("section", "settings-view");
    section.append(this.el("p", "eyebrow", "MAKE IT YOURS"), this.el("h1", "", "顯示與相容性"));
    const panel = this.el("div", "settings-card");
    for (const [key, label] of [["background", "LCE 靜態背景（只載入一張，無輪播／影片）"], ["largeText", "加大聊天文字"], ["timestamps", "顯示聊天時間"]] as const) {
      panel.append(this.checkbox(label, this.settings[key], value => {
        this.settings[key] = value; this.applySettings();
        try { localStorage.setItem("bc-lite-display-v1", JSON.stringify(this.settings)); } catch { this.localNotice("瀏覽器不允許儲存設定，本次仍有效。"); }
      }));
    }
    panel.append(this.el("p", "muted", "預設僅儲存顯示偏好；自願啟用記住帳號後另存帳號，不存密碼、好友資料或聊天紀錄。聊天預設顯示最近 100 則，記憶體保留最多 600 則。"));
    const privacy = this.el("div", "settings-card");
    privacy.append(this.el("h2", "", "本機帳號與資料流向"), this.accountPrivacyNote());
    const forget = this.button("刪除本機保存的帳號", "ghost", "button");
    forget.addEventListener("click", () => { this.rememberAccount = false; this.saveAccountPreference(); });
    privacy.append(forget, this.el("p", "muted", "目前路徑：瀏覽器 → Cloudflare 中繼 → BC 伺服器。帳密與遊戲流量會經過中繼，並非瀏覽器到 BC 的端對端加密。此版本未加入分析追蹤、帳號保存 API、資料庫或封包日誌；但無法保證部署者未修改程式、平台日誌設定或 BC 的資料處理方式。請只信任你核對過的部署。"));
    const compatibility = this.el("div", "settings-card");
    compatibility.append(this.el("h2", "", "ECHO／服裝保護"), this.el("p", "", `登入時收到 ${this.snapshot!.player?.Appearance?.length ?? "未知數量的"} 件服裝資料，保留原始內容，不用 Lite 的資產清單重建。`), this.el("p", "muted", "目前不是完整 ECHO：不載入服裝圖片、衣櫃或宣告假插件版本，也不送出 Appearance／OnlineSharedSettings 更新。已有 ECHO 服裝能否完整顯示，仍須用另一位已裝 ECHO 的玩家實測。Lite 暫不支援換裝、道具操作與保存他人對你的服裝修改。"));
    compatibility.append(this.el("p", "muted", "建議先在完整 BC + ECHO 儲存服裝，再登入 Lite。不要在 Lite 工作階段更換服裝；返回完整版後核對。未裝 ECHO 的觀看者本來就看不到擴充服裝。"));
    const disconnect = this.button("登出並清除本次記憶體資料", "ghost danger", "button");
    disconnect.addEventListener("click", () => { if (window.confirm("確定登出？未送出草稿與聊天紀錄將清除。")) bcClient.disconnect(); });
    section.append(panel, privacy, compatibility, disconnect);
    return section;
  }

  private run(action: () => void): void { try { action(); } catch (error) { this.localNotice(error instanceof Error ? error.message : "操作失敗"); } }

  private joinRoom(name: string): void {
    if (name === this.snapshot!.room?.Name) { this.tab = "chat"; this.render(); return; }
    if (this.snapshot!.room) {
      if (!window.confirm(`離開「${this.snapshot!.room.Name}」並加入「${name}」？若加入失敗不會自動返回。`)) return;
      bcClient.leave();
    }
    this.run(() => bcClient.join(name));
  }

  private buildLogin(): HTMLElement {
    const state = this.snapshot!;
    const wrap = this.el("section", "login-layout");
    const intro = this.el("div", "intro-panel");
    intro.append(
      this.el("h1", "", "Bondage Club"),
      this.el("p", "lede", "輕量登入，聊天與好友隨行。"),
    );
    const card = this.el("form", "login-card") as HTMLFormElement;
    card.autocomplete = "off";
    card.append(this.el("h2", "", "登入 Bondage Club"));
    const account = this.input("AccountName", "帳號", "text", this.accountName);
    account.maxLength = 100;
    account.autocomplete = "username";
    account.addEventListener("input", () => { this.accountName = account.value; });
    const password = this.input("Password", "密碼", "password", this.password);
    password.autocomplete = "current-password";
    password.addEventListener("input", () => { this.password = password.value; });
    card.append(this.field("帳號", account), this.field("密碼", password));
    card.append(this.checkbox("記住帳號（只存這個瀏覽器，不存密碼）", this.rememberAccount, value => {
      this.rememberAccount = value;
      this.saveAccountPreference();
    }));
    const privacy = this.el("details", "login-privacy");
    privacy.append(this.el("summary", "", "帳號保存與資料安全說明"), this.accountPrivacyNote(), this.el("p", "security-note", "登入流量經 Cloudflare 中繼到 BC。此版本不主動記錄封包，但不是沒有第三方經手。登入會使同帳號其他連線斷線。"));
    card.append(privacy);
    const busy = !["idle", "error"].includes(state.phase);
    const submit = this.button(busy ? "連線中…" : "登入", "primary", "submit");
    submit.disabled = busy;
    card.append(submit);
    if (busy) {
      const cancel = this.button("取消", "ghost", "button");
      cancel.addEventListener("click", () => bcClient.disconnect());
      card.append(cancel);
    }
    if (this.notice || state.phase === "error") card.append(this.el("p", "login-error", this.notice || state.status));
    card.addEventListener("submit", async (event) => {
      event.preventDefault();
      this.notice = "";
      this.saveAccountPreference();
      const secret = this.password;
      this.password = "";
      password.value = "";
      try { await bcClient.login(this.accountName, secret); } catch (error) { this.notice = error instanceof Error ? error.message : "無法登入"; this.render(); }
    });
    wrap.append(intro, card);
    return wrap;
  }

  private buildSearch(): HTMLElement {
    const state = this.snapshot!;
    const section = this.el("section", "search-view");
    const heading = this.el("div", "view-heading");
    const titleWrap = this.el("div");
    titleWrap.append(this.el("h1", "", "聊天室"));
    const modes = this.el("div", "toolbar");
    for (const [mode, label] of [["search", "搜尋房間"], ["create", "建立房間"]] as const) {
      const button = this.button(label, this.roomMode === mode ? "secondary" : "ghost", "button");
      button.setAttribute("aria-pressed", String(this.roomMode === mode));
      button.addEventListener("click", () => { this.roomMode = mode; this.render(); });
      modes.append(button);
    }
    heading.append(titleWrap, modes);

    const form = this.el("form", "room-controls") as HTMLFormElement;
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
        this.roomPageSize = 40;
        bcClient.search({ Query: this.query, Language: this.language, Space: this.space, Game: "", FullRooms: this.showFull, ShowLocked: this.showLocked, SearchDescs: this.searchDescriptions });
      } catch (error) { this.localNotice(error instanceof Error ? error.message : "搜尋失敗"); }
    });

    const resultHeader = this.el("div", "result-header");
    resultHeader.append(this.el("h2", "", "房間列表"), this.el("span", "result-count", `${state.rooms.length} 間`));
    const rooms = this.el("div", "room-list");
    if (!state.rooms.length) rooms.append(this.el("div", "empty-state", "輸入條件後搜尋；空白搜尋會列出公開房間。"));
    else state.rooms.slice(0, this.roomPageSize).forEach((room) => rooms.append(this.roomCard(room)));
    if (state.rooms.length > this.roomPageSize) {
      const more = this.button(`顯示更多（${this.roomPageSize}/${state.rooms.length}）`, "secondary", "button");
      more.addEventListener("click", () => { this.roomPageSize += 40; this.render(); });
      rooms.append(more);
    }
    const create = this.el("form", "room-controls create-controls") as HTMLFormElement;
    const roomName = this.input("NewRoomName", "輸入房名", "text", this.newRoomName);
    roomName.maxLength = 20;
    roomName.addEventListener("input", () => { this.newRoomName = roomName.value; });
    const description = this.input("NewRoomDescription", "房間描述", "text", this.newRoomDescription);
    description.maxLength = 100; description.required = false;
    description.addEventListener("input", () => { this.newRoomDescription = description.value; });
    const limit = this.select("人數上限", [["2", "2 人"], ["5", "5 人"], ["10", "10 人"]], String(this.newRoomLimit));
    limit.addEventListener("change", () => { this.newRoomLimit = Number(limit.value); });
    const createButton = this.button("建立並進入", "primary", "submit");
    createButton.disabled = state.phase !== "ready";
    const directJoin = this.button("按完整房名加入", "secondary", "button");
    directJoin.disabled = !["ready", "in-room"].includes(state.phase);
    directJoin.addEventListener("click", () => { if (this.query.trim()) this.joinRoom(this.query.trim()); else this.localNotice("請先輸入完整房名"); });
    form.append(directJoin);
    create.append(this.field("房間名稱", roomName), this.field("描述", description), this.field("人數上限", limit));
    const createLanguage = this.select("建房語言", [["EN", "EN"], ["CN", "CN"], ["DE", "DE"], ["FR", "FR"], ["ES", "ES"], ["RU", "RU"], ["UA", "UA"]], this.language || "EN");
    createLanguage.addEventListener("change", () => { this.language = createLanguage.value as RoomSearchRequest["Language"]; });
    const createSpace = this.select("建房區域", [["X", "混合"], ["", "女性"], ["M", "男性"]], this.space);
    createSpace.addEventListener("change", () => { this.space = createSpace.value as RoomSearchRequest["Space"]; });
    create.append(this.field("語言", createLanguage), this.field("區域", createSpace), this.buildRoomOptions());
    if (state.room) create.append(this.el("p", "muted", "可以在房內搜尋；建立新房前請先離開目前房間。"));
    create.append(createButton);
    create.addEventListener("submit", event => {
      event.preventDefault();
      this.notice = "";
      try { bcClient.createRoom(this.newRoomName, this.space, this.language, this.unlisted, this.newRoomDescription, this.newRoomLimit, this.roomOptions()); }
      catch (error) { this.localNotice(error instanceof Error ? error.message : "建立失敗"); }
    });
    section.append(heading);
    if (this.roomMode === "search") section.append(form, resultHeader, rooms);
    else section.append(create);
    return section;
  }

  private roomCard(room: RoomSearchResult): HTMLElement {
    const card = this.el("article", "room-card");
    const top = this.el("div", "room-card-top");
    const meta = this.el("div", "room-tags");
    meta.append(this.el("span", "tag", room.Language || "—"), this.el("span", "tag", `${room.MemberCount}/${room.MemberLimit}`));
    if (room.Access && !room.Access.includes("All")) meta.append(this.el("span", "tag locked", "受限"));
    if (room.Friends?.length) { const friends = this.el("span", "tag friend-tag", `好友 ${room.Friends.length}`); friends.title = room.Friends.map(friend => `#${friend.MemberNumber}`).join("、"); meta.append(friends); }
    if (room.Visibility && !room.Visibility.includes("All")) meta.append(this.el("span", "tag", "隱藏／限定可見"));
    if (room.MemberCount >= room.MemberLimit) meta.append(this.el("span", "tag", "已滿"));
    if (room.Game) meta.append(this.el("span", "tag", room.Game));
    if (room.MapType && room.MapType !== "Never") meta.append(this.el("span", "tag", `地圖 ${room.MapType}`));
    top.append(this.el("h3", "", room.Name), meta);
    card.append(top, this.el("p", "room-description", room.Description || "沒有房間描述"), this.el("p", "room-creator", `建立者：${room.Creator || `#${room.CreatorMemberNumber}`}`));
    const join = this.button(room.CanJoin ? "加入" : "無法加入", room.CanJoin ? "secondary" : "ghost", "button");
    join.disabled = !room.CanJoin || this.snapshot!.phase === "joining";
    join.addEventListener("click", () => this.joinRoom(room.Name));
    card.append(join);
    return card;
  }

  private buildRoomOptions(): HTMLElement {
    const panel = this.el("div", "room-options");
    const fields = this.createFields;
    for (const [key, label] of [["Background", "背景圖片名稱（BC 內建，例如 MainHall）"], ["Admin", "管理者編號（自己自動加入）"], ["Whitelist", "白名單編號"], ["Ban", "黑名單編號"], ["ImageURL", "自訂圖片 HTTPS 網址"], ["MusicURL", "音樂 HTTPS 網址"]] as const) {
      const input = this.input(`Create${key}`, label, key.endsWith("URL") ? "url" : "text", fields[key]);
      input.required = false; input.maxLength = key.endsWith("URL") ? 2000 : 1000;
      input.addEventListener("input", () => { fields[key] = input.value; });
      panel.append(this.field(label, input));
    }
    for (const [key, label, options] of [
      ["Game", "遊戲模式", [["", "無"], ["ClubCard", "ClubCard"], ["LARP", "LARP"], ["MagicBattle", "MagicBattle"], ["GGTS", "GGTS"]]],
      ["Visibility", "房間可見性", [["All", "公開"], ["Admin,Whitelist", "管理者與白名單"], ["Admin", "僅管理者"], ["", "隱藏"]]],
      ["Access", "加入權限", [["All", "任何人"], ["Admin,Whitelist", "管理者與白名單"], ["Admin", "僅管理者"]]],
      ["MapType", "地圖", [["Never", "停用"], ["Hybrid", "Hybrid 混合"], ["Always", "Always 強制地圖"]]],
    ] as const) {
      const select = this.select(label, options.map(option => [...option]), fields[key]);
      select.addEventListener("change", () => { fields[key] = select.value; }); panel.append(this.field(label, select));
    }
    panel.append(this.checkbox("地圖迷霧", fields.Fog, value => { fields.Fog = value; }));
    const blocks = this.el("fieldset", "search-options"); blocks.append(this.el("legend", "", "禁止類別"));
    for (const category of ["ABDL", "SciFi", "Fantasy", "Leashing", "Photos", "Arousal", "Smoking"]) blocks.append(this.checkbox(category, fields.BlockCategory.includes(category), checked => { fields.BlockCategory = checked ? [...fields.BlockCategory, category] : fields.BlockCategory.filter(value => value !== category); }));
    panel.append(blocks);
    const advanced = this.el("details", "map-import"); advanced.append(this.el("summary", "", "匯入 BC 地圖資料（選用）"));
    const json = document.createElement("textarea"); json.id = "CreateMapJSON"; json.value = fields.MapJSON; json.maxLength = 30000;
    json.placeholder = '貼上 MapData JSON；留空建立原版 40×40 空白地圖';
    json.addEventListener("input", () => { fields.MapJSON = json.value; }); advanced.append(json); panel.append(advanced);
    panel.append(this.el("p", "muted", "網址只送作房間設定，不在 Lite 自動載入。Lite 不提供遊戲操作、地圖移動或圖形編輯器；強制地圖可能影響聊天可見範圍。名單以逗號或空白分隔。"));
    return panel;
  }

  private roomOptions(): RoomCreateOptions {
    const fields = this.createFields;
    const ids = (text: string) => text.trim() ? text.trim().split(/[\s,，]+/).map(value => { if (!/^\d+$/.test(value)) throw new Error("名單只接受玩家編號"); return Number(value); }) : [];
    let map: RoomCreateOptions["MapData"] = { Type: fields.MapType as "Never" | "Hybrid" | "Always", Fog: fields.Fog };
    if (fields.MapJSON.trim() && fields.MapType !== "Never") {
      const parsed = JSON.parse(fields.MapJSON);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("地圖必須為 MapData 物件");
      map = { ...map, Tiles: parsed.Tiles, Objects: parsed.Objects, Effects: parsed.Effects };
    }
    return { Background: fields.Background.trim(), Admin: ids(fields.Admin), Whitelist: ids(fields.Whitelist), Ban: ids(fields.Ban), Game: fields.Game,
      Visibility: fields.Visibility ? fields.Visibility.split(",") : [], Access: fields.Access.split(","), BlockCategory: fields.BlockCategory,
      Custom: { ImageURL: fields.ImageURL.trim(), MusicURL: fields.MusicURL.trim() }, MapData: map };
  }

  private buildRoom(): HTMLElement {
    const state = this.snapshot!;
    const layout = this.el("section", `room-view${this.membersOpen ? " members-open" : ""}`);
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
      member.title = "玩家資料、密語、好友與 BEEP";
      member.addEventListener("click", () => this.showMember(character));
      members.append(member);
    });
    sidebar.append(members);

    const chat = this.el("div", "chat-room-div");
    chat.id = "chat-room-div";
    const topMenu = this.el("div", "chat-room-top-menu");
    topMenu.id = "chat-room-top-menu";
    topMenu.append(this.el("strong", "", state.room!.Name), this.el("span", "", `${state.characters.length}/${state.room!.Limit}`));
    const toggle = this.button(this.membersOpen ? "關閉成員" : "成員", "ghost mobile-members", "button");
    toggle.addEventListener("click", () => { this.membersOpen = !this.membersOpen; this.render(); });
    const history = this.button("更多紀錄", "ghost", "button");
    history.addEventListener("click", () => {
      const old = document.getElementById("TextAreaChatLog")!;
      const height = old.scrollHeight; const top = old.scrollTop;
      this.visibleMessages = Math.min(600, this.visibleMessages + 100); this.render();
      const next = document.getElementById("TextAreaChatLog")!;
      next.scrollTop = top + next.scrollHeight - height;
    });
    const jump = this.button("新訊息 ↓", "secondary", "button"); jump.id = "new-messages"; jump.hidden = true;
    jump.addEventListener("click", () => { this.visibleMessages = 100; this.updateChatLog(true); });
    topMenu.append(toggle, history, jump);
    const mobileLeave = this.button("離開", "ghost", "button");
    mobileLeave.addEventListener("click", () => bcClient.leave());
    topMenu.append(mobileLeave);
    const struggle = this.el("div", "chat-room-struggle-bar"); struggle.id = "chat-room-struggle-bar";
    const log = this.el("div", "text-area-chat-log"); log.id = "TextAreaChatLog"; log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite");
    log.dataset.room = state.room!.Name;
    log.dataset.latest = state.messages.at(-1)?.id || "";
    state.messages.slice(-this.visibleMessages).forEach((message) => log.append(this.messageNode(message)));
    const reply = this.el("div", "chat-room-reply-indicator"); reply.id = "chat-room-reply-indicator";
    const bot = this.el("form", "chat-room-bot") as HTMLFormElement; bot.id = "chat-room-bot";
    const input = document.createElement("textarea"); input.id = "InputChat"; input.placeholder = "輸入訊息…（/me 動作，/w 編號 密語）"; input.maxLength = 1000; input.value = this.chatDraft;
    const length = this.el("span", "input-chat-length", `${this.chatDraft.length}/1000`); length.id = "InputChatLength";
    input.addEventListener("input", () => { this.chatDraft = input.value; length.textContent = `${input.value.length}/1000`; });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); bot.requestSubmit(); } });
    const buttons = this.el("div", "chat-room-buttons-div"); buttons.id = "chat-room-buttons-div";
    const inner = this.el("div", "chat-room-buttons"); inner.id = "chat-room-buttons";
    const send = this.button("送出", "primary", "submit"); inner.append(length, send); buttons.append(inner); bot.append(input, buttons);
    bot.addEventListener("submit", (event) => {
      event.preventDefault();
      try { bcClient.sendChat(this.chatDraft); this.chatDraft = ""; input.value = ""; length.textContent = "0/1000"; }
      catch (error) { this.localNotice(error instanceof Error ? error.message : "訊息無法傳送"); }
    });
    chat.append(topMenu, struggle, log, reply, bot);
    layout.append(sidebar, chat);
    return layout;
  }

  private messageNode(message: DisplayMessage): HTMLElement {
    const row = this.el("div", `chat-message type-${message.type.toLowerCase()}`);
    row.dataset.messageId = message.id;
    const time = this.el("time", "message-time", message.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    if (message.type === "Local" || message.type === "ServerMessage") {
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

  private showMember(character: CharacterSummary): void {
    const dialog = this.el("dialog", "profile-dialog");
    dialog.append(this.el("h2", "", `${character.Nickname || character.Name} #${character.MemberNumber}`));
    const relationName = (value: { Name?: string; MemberNumber?: number }) => `${value.Name || "未提供姓名"}${value.MemberNumber ? ` (#${value.MemberNumber})` : ""}`;
    dialog.append(this.el("p", "", `主人：${character.Ownership ? relationName(character.Ownership) : character.Owner || "未提供"}`), this.el("p", "", `戀人：${character.Lovership?.length ? character.Lovership.map(relationName).join("、") : "未提供"}`));
    const bio = this.el("details", "profile-bio");
    bio.append(this.el("summary", "", "BIO · 點擊展開"));
    bio.addEventListener("toggle", () => { if (bio.open && bio.childElementCount === 1) bio.append(this.el("p", "profile-description", decodeBiography(character.Description))); });
    dialog.append(bio);
    const actions = this.el("div", "toolbar");
    const close = this.button("關閉", "ghost", "button");
    const dismiss = () => { dialog.close(); dialog.remove(); };
    close.addEventListener("click", dismiss);
    dialog.addEventListener("close", () => dialog.remove());
    if (character.MemberNumber !== this.snapshot!.player?.MemberNumber) {
      const whisper = this.button("房內密語", "secondary", "button");
      whisper.addEventListener("click", () => {
        if (this.chatDraft.trim() && !window.confirm("切換密語對象會取代目前草稿，確定？")) return;
        dismiss(); this.chatDraft = `/w ${character.MemberNumber} `; this.membersOpen = false; this.render(); document.getElementById("InputChat")?.focus();
      });
      const friend = this.button("加好友", "ghost", "button");
      friend.addEventListener("click", () => this.run(() => bcClient.setFriend(character.MemberNumber, true)));
      const beep = this.button("私訊（BEEP）", "ghost", "button");
      beep.addEventListener("click", () => { dismiss(); this.openConversation(character.MemberNumber); });
      actions.append(whisper, friend, beep);
    }
    actions.append(close); dialog.append(actions); document.body.append(dialog); dialog.showModal();
  }

  private buildFooter(): HTMLElement {
    const footer = this.el("footer", "app-footer");
    footer.append(this.el("span", "", "BC Lite · Social preview · Relay v1"), this.el("span", "", "非 Bondage Club 官方客戶端"));
    return footer;
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
