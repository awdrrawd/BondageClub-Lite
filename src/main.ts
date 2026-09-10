import { t, getLocale, setLocale, type Locale } from "./i18n";
import "./style.css";
import { bcClient } from "./protocol";
import { decodeBiography } from "./biography";
import { appendChatLinks } from "./chat-links";
import { StabilityControls } from "./stability";
import { loadTextCatalog } from "./text-catalog";
import type { CharacterSummary, ClientSnapshot, DisplayMessage, RoomCreateOptions, RoomSearchRequest, RoomSearchResult } from "./types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error(t("m001"));

const escapeText = (value: unknown): string => String(value ?? "");
class LiteApp {
  private stability = new StabilityControls();
  private snapshot: Readonly<ClientSnapshot> | null = null;
  private accountName = "";
  private rememberAccount = false;
  private password = "";
  private query = "";
  private chatDraft = "";
  private language: RoomSearchRequest["Language"] = "";
  private space: RoomSearchRequest["Space"] = "X";
  private newRoomName = "";
  private newRoomDescription = "";
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
  private catalogRequest = 0;
  private membersOpen = false;
  private visibleMessages = 100;
  private unread = 0;
  private roomUnread = 0;
  private composing = false;
  private renderPending = false;
  private settings = { background: false, largeText: false, timestamps: true, locale: "zh" as Locale };

  constructor() {
    const resume = (event: "visible" | "online" | "pageshow") => {
      bcClient.recordLifecycle(event);
      if (document.visibilityState === "visible" && window.navigator.onLine !== false) bcClient.resumeConnection();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resume("visible");
      else bcClient.recordLifecycle("hidden");
    });
    window.addEventListener("pageshow", () => resume("pageshow"));
    window.addEventListener("online", () => resume("online"));
    window.addEventListener("offline", () => bcClient.recordLifecycle("offline"));
    app!.addEventListener("compositionstart", () => { this.composing = true; });
    app!.addEventListener("compositionend", () => {
      this.composing = false;
      // The final input event follows compositionend. Read its draft before replacing controls.
      window.setTimeout(() => { if (this.renderPending) { this.renderPending = false; this.render(); } }, 0);
    });
    try {
      const saved = JSON.parse(localStorage.getItem("bc-lite-display-v1") || "{}");
      this.settings = { background: saved.background === true, largeText: saved.largeText === true, timestamps: saved.timestamps !== false, locale: saved.locale === "en" ? "en" : "zh" };
    } catch { /* Storage can be unavailable in private browsing. */ }
    try {
      const savedAccount = localStorage.getItem("bc-lite-account-v1");
      if (savedAccount && savedAccount.length <= 100) { this.accountName = savedAccount; this.rememberAccount = true; }
    } catch { /* Remembering an account is optional. */ }
    setLocale(this.settings.locale);
    this.applySettings();
    bcClient.subscribe((snapshot) => {
      const previous = this.snapshot;
      this.snapshot = snapshot;
      if (!snapshot.player || snapshot.phase === "error") this.stability.stop();
      if (snapshot.player && !this.catalogLoading) {
        this.refreshCatalog();
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
    document.documentElement.lang = getLocale() === "zh" ? "zh-Hant" : "en";
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("site.description"));
    document.body.classList.toggle("scenic", this.settings.background);
    document.body.classList.toggle("large-text", this.settings.largeText);
    document.body.classList.toggle("hide-times", !this.settings.timestamps);
  }

  private refreshCatalog(): void {
    this.catalogLoading = true;
    const request = ++this.catalogRequest;
    void loadTextCatalog(getLocale()).then(catalog => { if (request === this.catalogRequest) bcClient.setTextCatalog(catalog); }).catch(() => { if (request === this.catalogRequest) this.localNotice(t("m002")); });
  }

  private languageControl(): HTMLElement {
    const select = this.select(t("locale.label"), [["zh", t("locale.zh")], ["en", t("locale.en")]], getLocale());
    select.id = "InterfaceLocale";
    select.addEventListener("change", () => {
      this.settings.locale = select.value === "en" ? "en" : "zh";
      setLocale(this.settings.locale); this.applySettings();
      try { localStorage.setItem("bc-lite-display-v1", JSON.stringify(this.settings)); } catch { this.localNotice(t("m060")); }
      bcClient.relocalize(); this.render();
      if (this.snapshot?.player) this.refreshCatalog();
    });
    return this.field(t("locale.label"), select);
  }

  private saveAccountPreference(): void {
    try {
      if (this.rememberAccount && this.accountName.trim()) localStorage.setItem("bc-lite-account-v1", this.accountName.trim());
      else localStorage.removeItem("bc-lite-account-v1");
    } catch {
      this.localNotice(t("m003"));
    }
  }

  private accountPrivacyNote(): HTMLElement {
    return this.el("p", "security-note", t("m004"));
  }

  private updateHeader(): void {
    const connection = document.querySelector(".connection span:last-child");
    if (connection) connection.textContent = this.snapshot!.status;
    const friends = document.getElementById("nav-friends");
    if (friends) friends.textContent = t("m005", [this.unread ? ` · ${this.unread}` : ""]);
    const chat = document.getElementById("nav-chat");
    if (chat) chat.textContent = t("m006", [this.roomUnread ? ` · ${this.roomUnread}` : ""]);
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
    document.body.classList.toggle("chat-active", this.tab === "chat" && state.phase === "in-room" && !!state.room);
    const shell = this.el("main", "app-shell");
    const header = this.el("header", "app-header");
    const brand = this.el("div", "brand");
    brand.append(this.el("span", "brand-mark", "BC"), this.el("div", "", "Lite"));
    const connection = this.el("div", `connection phase-${state.phase}`);
    connection.append(this.el("span", "status-dot"), this.el("span", "", state.status));
    const statusControls = this.el("div", "header-status-controls");
    const localeControl = this.languageControl();
    localeControl.classList.add("header-locale");
    statusControls.append(connection, localeControl);
    header.append(brand);
    if (state.player) {
      const account = this.el("div", "header-account");
      const name = this.button(`${state.player.Nickname || state.player.Name} (#${state.player.MemberNumber})`, "ghost", "button");
      name.addEventListener("click", () => this.showMember(state.characters.find(character => character.MemberNumber === state.player!.MemberNumber) || state.player!));
      const logout = this.button(t("m007"), "ghost", "button");
      logout.addEventListener("click", () => { if (window.confirm(t("m008"))) bcClient.disconnect(); });
      account.append(name, logout); header.append(account);
    }
    header.append(statusControls);

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
    nav.setAttribute("aria-label", t("m009"));
    for (const [key, label] of [["rooms", t("m010")], ["chat", t("m011")], ["friends", t("m012")], ["settings", t("m013")]] as const) {
      const button = this.button(label, this.tab === key ? "active" : "ghost", "button");
      button.id = `nav-${key}`;
      button.setAttribute("aria-current", this.tab === key ? "page" : "false");
      button.disabled = key === "chat" && !this.snapshot!.room;
      button.addEventListener("click", () => {
        this.tab = key;
        if (key === "friends") this.unread = 0;
        if (key === "chat") this.roomUnread = 0;
        this.render();
        if (key === "friends" && this.snapshot!.friendsQueryState === "idle") this.run(() => bcClient.refreshFriends());
      });
      nav.append(button);
    }
    return nav;
  }

  private buildFriends(): HTMLElement {
    const section = this.el("section", "friends-view");
    section.append(this.el("p", "eyebrow", t("m015")), this.el("h1", "", t("m016")));
    section.append(this.el("p", "muted", t("m017")));
    const toolbar = this.el("div", "toolbar");
    const refresh = this.button(t("m018"), "secondary", "button");
    refresh.addEventListener("click", () => this.run(() => bcClient.refreshFriends()));
    const query = this.input("FriendQuery", t("m019"), "search", this.friendQuery);
    query.addEventListener("input", () => { this.friendQuery = query.value; this.updateFriendContent(); });
    toolbar.append(query, refresh);
    const filters = this.el("div", "toolbar friend-filters");
    for (const [value, label] of [["all", t("m020")], ["online", t("m021")], ["offline", t("m022")], ["unknown", t("m023")]]) {
      const button = this.button(label, this.friendFilter === value ? "secondary" : "ghost", "button");
      button.setAttribute("aria-pressed", String(this.friendFilter === value));
      button.addEventListener("click", () => { this.friendFilter = value; this.render(); });
      filters.append(button);
    }
    const status = this.el("p", "muted"); status.id = "friends-status";
    const list = this.el("div", "contact-list"); list.id = "contact-list";
    const form = this.el("form", "beep-compose") as HTMLFormElement;
    const target = this.input("BeepTarget", t("m024"), "number", this.contact ? String(this.contact) : "");
    target.min = "1"; target.step = "1";
    target.addEventListener("change", () => this.openConversation(Number(target.value)));
    const text = document.createElement("textarea"); text.id = "BeepText"; text.placeholder = t("m025"); text.maxLength = 1000; text.required = true; text.value = this.beepDraft;
    text.addEventListener("input", () => { this.beepDraft = text.value; });
    const add = this.button(t("m026"), "ghost", "button");
    add.addEventListener("click", () => this.run(() => bcClient.setFriend(this.contact, true)));
    const channel = this.select(t("m027"), [["beep", t("m028")], ["whisper", t("m029")]], this.privateMode);
    channel.addEventListener("change", () => { this.privateMode = channel.value; this.updateBeepLog(); });
    const send = this.button(t("m030"), "primary", "submit");
    form.append(this.field(t("m031"), target), this.field(t("m027"), channel), text, add, send);
    form.addEventListener("submit", event => {
      event.preventDefault();
      this.run(() => {
        if (this.privateMode === "whisper") {
          if (!this.beepDraft.trim()) return;
          if (!this.snapshot!.characters.some(character => character.MemberNumber === this.contact)) throw new Error(t("m032"));
          bcClient.sendChat(`/w ${this.contact} ${this.beepDraft}`);
        } else bcClient.sendBeep(this.contact, this.beepDraft);
        this.beepDraft = ""; this.contactDrafts.delete(this.contact); text.value = "";
      });
    });
    const inbox = this.el("div", "beep-log"); inbox.id = "beep-log"; inbox.setAttribute("role", "log");
    const clear = this.button(t("m033"), "ghost", "button");
    clear.addEventListener("click", () => { if (window.confirm(t("m034"))) bcClient.clearBeeps(); });
    section.append(toolbar, filters, status, list, this.el("h2", "", t("m035")), form, inbox, clear);
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
      const fresh = state.friendsQueryState === "ready";
      const presence = inRoom || (friend && fresh) ? "online" : fresh && state.player?.FriendList?.includes(id) ? "offline" : "unknown";
      if (this.friendFilter !== "all" && this.friendFilter !== presence) continue;
      const name = friend?.MemberName || state.characters.find(character => character.MemberNumber === id)?.Name || [...state.beeps].reverse().find(message => message.memberNumber === id)?.name || t("m037");
      if (!`${name} ${id}`.toLowerCase().includes(this.friendQuery.trim().toLowerCase())) continue;
      total++;
      if (total > 80) continue;
      const row = this.el("article", "contact-card");
      const info = this.el("div");
      const relation = friend ? ({ Friend: t("relation.friend"), Lover: t("relation.lover"), Owner: t("relation.owner"), Submissive: t("relation.submissive") }[friend.Type] || friend.Type) : "";
      info.append(this.el("strong", "", `${name} #${id}`), this.el("p", "muted", friend && fresh ? t("m038", [friend.ChatRoomName || t("m039"), friend.Private ? t("m040") : "", relation]) : inRoom ? t("m041") : presence === "offline" ? t("m042") : t("m043")));
      const chat = this.button("BEEP", "secondary", "button");
      chat.addEventListener("click", () => this.openConversation(id));
      row.append(info);
      if (friend?.ChatRoomName) {
        const join = this.button(t("m044"), "ghost", "button");
        join.disabled = !["ready", "in-room"].includes(state.phase);
        join.title = t("m045");
        join.addEventListener("click", () => this.joinRoom(friend.ChatRoomName!));
        row.append(join);
      }
      row.append(chat);
      if (inRoom) {
        const whisper = this.button(t("m046"), "secondary", "button");
        whisper.addEventListener("click", () => this.openConversation(id, "whisper")); row.append(whisper);
      }
      if (state.player?.FriendList?.includes(id)) {
        const remove = this.button(t("m047"), "ghost danger", "button");
        remove.addEventListener("click", () => { if (window.confirm(t("m048", [id]))) this.run(() => bcClient.setFriend(id, false)); });
        row.append(remove);
      }
      list.append(row);
    }
    if (!total) list.append(this.el("p", "empty-state", t("m049")));
    if (total > 80) list.append(this.el("p", "muted", t("m050", [total])));
  }

  private updateBeepLog(): void { const log = document.getElementById("beep-log"); if (log) this.fillBeepLog(log); }

  private fillBeepLog(log: HTMLElement): void {
    log.replaceChildren();
    if (this.privateMode === "whisper") {
      const messages = this.snapshot!.messages.filter(message => message.type === "Whisper" && (message.sender === this.contact || (message.sender === this.snapshot!.player?.MemberNumber && message.target === this.contact))).slice(-60);
      for (const message of messages) log.append(this.messageNode(message));
      if (!messages.length) log.append(this.el("p", "muted", t("m051")));
      return;
    }
    const messages = this.snapshot!.beeps.filter(message => !this.contact || message.memberNumber === this.contact).slice(-60);
    if (!messages.length) log.append(this.el("p", "muted", t("m052")));
    for (const message of messages.reverse()) {
      const row = this.el("article", `beep-message ${message.incoming ? "incoming" : "outgoing"}`);
      const reply = this.button(`${message.incoming ? t("m053") : t("m054")} · ${message.name} #${message.memberNumber}`, "ghost", "button");
      reply.addEventListener("click", () => this.openConversation(message.memberNumber));
      row.append(reply, this.el("time", "message-time", message.time.toLocaleTimeString()), this.chatText("p", "message-text", message.text));
      log.append(row);
    }
  }

  private buildSettings(): HTMLElement {
    const section = this.el("section", "settings-view");
    section.append(this.el("p", "eyebrow", t("m055")), this.el("h1", "", t("m056")));
    const panel = this.el("div", "settings-card");
    for (const [key, label] of [["background", t("m057")], ["largeText", t("m058")], ["timestamps", t("m059")]] as const) {
      panel.append(this.checkbox(label, this.settings[key], value => {
        this.settings[key] = value; this.applySettings();
        try { localStorage.setItem("bc-lite-display-v1", JSON.stringify(this.settings)); } catch { this.localNotice(t("m060")); }
      }));
    }
    panel.append(this.el("p", "muted", t("m061")));
    const privacy = this.el("div", "settings-card");
    privacy.append(this.el("h2", "", t("m062")), this.accountPrivacyNote());
    const forget = this.button(t("m063"), "ghost", "button");
    forget.addEventListener("click", () => { this.rememberAccount = false; this.saveAccountPreference(); });
    privacy.append(forget, this.el("p", "muted", t("m064")));
    const compatibility = this.el("div", "settings-card");
    compatibility.append(this.el("h2", "", t("m065")), this.el("p", "", t("m066", [this.snapshot!.player?.Appearance?.length ?? t("m067")])), this.el("p", "muted", t("m068")));
    compatibility.append(this.el("p", "muted", t("m069")));
    const disconnect = this.button(t("m070"), "ghost danger", "button");
    disconnect.addEventListener("click", () => { if (window.confirm(t("m071"))) bcClient.disconnect(); });
    section.append(panel, this.stability.build(() => bcClient.connectionDiagnostics(), () => bcClient.resumeConnection()), privacy, compatibility, disconnect);
    return section;
  }

  private run(action: () => void): void { try { action(); } catch (error) { this.localNotice(error instanceof Error ? error.message : t("m072")); } }

  private joinRoom(name: string): void {
    if (name === this.snapshot!.room?.Name) { this.tab = "chat"; this.render(); return; }
    if (this.snapshot!.room) {
      if (!window.confirm(t("m073", [this.snapshot!.room.Name, name]))) return;
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
      this.el("p", "lede", t("m074")),
    );
    const card = this.el("form", "login-card") as HTMLFormElement;
    card.autocomplete = "off";
    card.append(this.el("h2", "", t("m075")));
    const account = this.input("AccountName", t("m076"), "text", this.accountName);
    account.maxLength = 100;
    account.autocomplete = "username";
    account.addEventListener("input", () => { this.accountName = account.value; });
    const password = this.input("Password", t("m077"), "password", this.password);
    password.autocomplete = "current-password";
    password.addEventListener("input", () => { this.password = password.value; });
    card.append(this.field(t("m076"), account), this.field(t("m077"), password));
    card.append(this.checkbox(t("m078"), this.rememberAccount, value => {
      this.rememberAccount = value;
      this.saveAccountPreference();
    }));
    const privacy = this.el("details", "login-privacy");
    privacy.append(this.el("summary", "", t("m079")), this.accountPrivacyNote(), this.el("p", "security-note", t("m080")));
    card.append(privacy);
    const busy = !["idle", "error"].includes(state.phase);
    const submit = this.button(busy ? t("m081") : t("m082"), "primary", "submit");
    submit.disabled = busy;
    card.append(submit);
    if (busy) {
      const cancel = this.button(t("m083"), "ghost", "button");
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
      try { await bcClient.login(this.accountName, secret); } catch (error) { this.notice = error instanceof Error ? error.message : t("m084"); this.render(); }
    });
    wrap.append(intro, card);
    return wrap;
  }

  private buildSearch(): HTMLElement {
    const state = this.snapshot!;
    const section = this.el("section", "search-view");
    const heading = this.el("div", "view-heading");
    const titleWrap = this.el("div");
    titleWrap.append(this.el("h1", "", t("m085")));
    const modes = this.el("div", "toolbar");
    for (const [mode, label] of [["search", t("m086")], ["create", t("m087")]] as const) {
      const button = this.button(label, this.roomMode === mode ? "secondary" : "ghost", "button");
      button.setAttribute("aria-pressed", String(this.roomMode === mode));
      button.addEventListener("click", () => { this.roomMode = mode; this.render(); });
      modes.append(button);
    }
    heading.append(titleWrap, modes);

    const form = this.el("form", "room-controls") as HTMLFormElement;
    const query = this.input("RoomQuery", t("m088"), "search", this.query);
    query.addEventListener("input", () => { this.query = query.value; });
    const language = this.select(t("m089"), [["", t("m020")], ["EN", "EN"], ["CN", "CN"], ["DE", "DE"], ["FR", "FR"], ["ES", "ES"], ["RU", "RU"], ["UA", "UA"]], this.language);
    language.addEventListener("change", () => { this.language = language.value as RoomSearchRequest["Language"]; });
    const space = this.select(t("m090"), [["X", t("m091")], ["", t("m092")], ["M", t("m093")]], this.space);
    space.addEventListener("change", () => { this.space = space.value as RoomSearchRequest["Space"]; });
    form.append(this.field(t("m094"), query), this.field(t("m089"), language), this.field(t("m090"), space));
    const options = this.el("div", "search-options");
    options.append(
      this.checkbox(t("m095"), this.showFull, (value) => { this.showFull = value; }),
      this.checkbox(t("m096"), this.showLocked, (value) => { this.showLocked = value; }),
      this.checkbox(t("m097"), this.searchDescriptions, (value) => { this.searchDescriptions = value; }),
    );
    const search = this.button(t("m098"), "primary", "submit");
    form.append(options, search);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.notice = "";
      try {
        this.roomPageSize = 40;
        bcClient.search({ Query: this.query, Language: this.language, Space: this.space, Game: "", FullRooms: this.showFull, ShowLocked: this.showLocked, SearchDescs: this.searchDescriptions });
      } catch (error) { this.localNotice(error instanceof Error ? error.message : t("m099")); }
    });

    const resultHeader = this.el("div", "result-header");
    resultHeader.append(this.el("h2", "", t("m100")), this.el("span", "result-count", t("m101", [state.rooms.length])));
    const rooms = this.el("div", "room-list");
    if (!state.rooms.length) rooms.append(this.el("div", "empty-state", t("m102")));
    else state.rooms.slice(0, this.roomPageSize).forEach((room) => rooms.append(this.roomCard(room)));
    if (state.rooms.length > this.roomPageSize) {
      const more = this.button(t("m103", [this.roomPageSize, state.rooms.length]), "secondary", "button");
      more.addEventListener("click", () => { this.roomPageSize += 40; this.render(); });
      rooms.append(more);
    }
    const create = this.el("form", "room-controls create-controls") as HTMLFormElement;
    const roomName = this.input("NewRoomName", t("m104"), "text", this.newRoomName);
    roomName.maxLength = 20;
    roomName.addEventListener("input", () => { this.newRoomName = roomName.value; });
    const description = this.input("NewRoomDescription", t("m105"), "text", this.newRoomDescription);
    description.maxLength = 100; description.required = false;
    description.addEventListener("input", () => { this.newRoomDescription = description.value; });
    const limit = this.select(t("m106"), [["2", t("m107")], ["5", t("m108")], ["10", t("m109")]], String(this.newRoomLimit));
    limit.addEventListener("change", () => { this.newRoomLimit = Number(limit.value); });
    const createButton = this.button(t("m110"), "primary", "submit");
    createButton.disabled = state.phase !== "ready";
    const directJoin = this.button(t("m111"), "secondary", "button");
    directJoin.disabled = !["ready", "in-room"].includes(state.phase);
    directJoin.addEventListener("click", () => { if (this.query.trim()) this.joinRoom(this.query.trim()); else this.localNotice(t("m112")); });
    form.append(directJoin);
    create.append(this.field(t("m113"), roomName), this.field(t("m114"), description), this.field(t("m106"), limit));
    const createLanguage = this.select(t("m115"), [["EN", "EN"], ["CN", "CN"], ["DE", "DE"], ["FR", "FR"], ["ES", "ES"], ["RU", "RU"], ["UA", "UA"]], this.language || "EN");
    createLanguage.addEventListener("change", () => { this.language = createLanguage.value as RoomSearchRequest["Language"]; });
    const createSpace = this.select(t("m116"), [["X", t("m117")], ["", t("m118")], ["M", t("m119")]], this.space);
    createSpace.addEventListener("change", () => { this.space = createSpace.value as RoomSearchRequest["Space"]; });
    create.append(this.field(t("m089"), createLanguage), this.field(t("m090"), createSpace), this.buildRoomOptions());
    if (state.room) create.append(this.el("p", "muted", t("m120")));
    create.append(createButton);
    create.addEventListener("submit", event => {
      event.preventDefault();
      this.notice = "";
      try { bcClient.createRoom(this.newRoomName, this.space, this.language, this.unlisted, this.newRoomDescription, this.newRoomLimit, this.roomOptions()); }
      catch (error) { this.localNotice(error instanceof Error ? error.message : t("m121")); }
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
    if (room.Access && !room.Access.includes("All")) meta.append(this.el("span", "tag locked", t("m122")));
    if (room.Friends?.length) { const friends = this.el("span", "tag friend-tag", t("m123", [room.Friends.length])); friends.title = room.Friends.map(friend => `#${friend.MemberNumber}`).join("、"); meta.append(friends); }
    if (room.Visibility && !room.Visibility.includes("All")) meta.append(this.el("span", "tag", t("m124")));
    if (room.MemberCount >= room.MemberLimit) meta.append(this.el("span", "tag", t("m125")));
    if (room.Game) meta.append(this.el("span", "tag", room.Game));
    if (room.MapType && room.MapType !== "Never") meta.append(this.el("span", "tag", t("m126", [room.MapType])));
    top.append(this.el("h3", "", room.Name), meta);
    card.append(top, this.el("p", "room-description", room.Description || t("m127")), this.el("p", "room-creator", t("m128", [room.Creator || `#${room.CreatorMemberNumber}`])));
    const join = this.button(room.CanJoin ? t("m129") : t("m130"), room.CanJoin ? "secondary" : "ghost", "button");
    join.disabled = !room.CanJoin || this.snapshot!.phase === "joining";
    join.addEventListener("click", () => this.joinRoom(room.Name));
    card.append(join);
    return card;
  }

  private buildRoomOptions(): HTMLElement {
    const panel = this.el("div", "room-options");
    const fields = this.createFields;
    for (const [key, label] of [["Background", t("m131")], ["Admin", t("m132")], ["Whitelist", t("m133")], ["Ban", t("m134")], ["ImageURL", t("m135")], ["MusicURL", t("m136")]] as const) {
      const input = this.input(`Create${key}`, label, key.endsWith("URL") ? "url" : "text", fields[key]);
      input.required = false; input.maxLength = key.endsWith("URL") ? 2000 : 1000;
      input.addEventListener("input", () => { fields[key] = input.value; });
      panel.append(this.field(label, input));
    }
    for (const [key, label, options] of [
      ["Game", t("m137"), [["", t("m138")], ["ClubCard", "ClubCard"], ["LARP", "LARP"], ["MagicBattle", "MagicBattle"], ["GGTS", "GGTS"]]],
      ["Visibility", t("m139"), [["All", t("m140")], ["Admin,Whitelist", t("m141")], ["Admin", t("m142")], ["", t("m143")]]],
      ["Access", t("m144"), [["All", t("m145")], ["Admin,Whitelist", t("m141")], ["Admin", t("m142")]]],
      ["MapType", t("m146"), [["Never", t("m147")], ["Hybrid", t("m148")], ["Always", t("m149")]]],
    ] as const) {
      const select = this.select(label, options.map(option => [...option]), fields[key]);
      select.addEventListener("change", () => { fields[key] = select.value; }); panel.append(this.field(label, select));
    }
    panel.append(this.checkbox(t("m150"), fields.Fog, value => { fields.Fog = value; }));
    const blocks = this.el("fieldset", "search-options"); blocks.append(this.el("legend", "", t("m151")));
    for (const category of ["ABDL", "SciFi", "Fantasy", "Leashing", "Photos", "Arousal", "Smoking"]) blocks.append(this.checkbox(category, fields.BlockCategory.includes(category), checked => { fields.BlockCategory = checked ? [...fields.BlockCategory, category] : fields.BlockCategory.filter(value => value !== category); }));
    panel.append(blocks);
    const advanced = this.el("details", "map-import"); advanced.append(this.el("summary", "", t("m152")));
    const json = document.createElement("textarea"); json.id = "CreateMapJSON"; json.value = fields.MapJSON; json.maxLength = 30000;
    json.placeholder = t("m153");
    json.addEventListener("input", () => { fields.MapJSON = json.value; }); advanced.append(json); panel.append(advanced);
    panel.append(this.el("p", "muted", t("m154")));
    return panel;
  }

  private roomOptions(): RoomCreateOptions {
    const fields = this.createFields;
    const ids = (text: string) => text.trim() ? text.trim().split(/[\s,，]+/).map(value => { if (!/^\d+$/.test(value)) throw new Error(t("m155")); return Number(value); }) : [];
    let map: RoomCreateOptions["MapData"] = { Type: fields.MapType as "Never" | "Hybrid" | "Always", Fog: fields.Fog };
    if (fields.MapJSON.trim() && fields.MapType !== "Never") {
      const parsed = JSON.parse(fields.MapJSON);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(t("m156"));
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
    const close = this.button(t("m160"), "ghost mobile-members", "button");
    close.addEventListener("click", () => { this.membersOpen = false; this.render(); });
    roomInfo.append(close, this.el("p", "eyebrow", state.room!.Language || t("m085")), this.el("h1", "", state.room!.Name), this.el("p", "", state.room!.Description || t("m127")));
    const leave = this.button(t("m157"), "ghost danger", "button");
    leave.addEventListener("click", () => bcClient.leave());
    roomInfo.append(leave);
    sidebar.append(roomInfo, this.el("h2", "member-title", t("m158", [state.characters.length])));
    const members = this.el("div", "member-list");
    state.characters.forEach((character) => {
      const member = this.el("button", "member-row") as HTMLButtonElement;
      member.type = "button";
      member.append(this.el("span", "member-avatar", (character.Nickname || character.Name || "?").slice(0, 1).toUpperCase()), this.el("span", "member-name", character.Nickname || character.Name), this.el("span", "member-number", `#${character.MemberNumber}`));
      member.title = t("m159");
      member.addEventListener("click", () => this.showMember(character));
      members.append(member);
    });
    sidebar.append(members);

    const chat = this.el("div", "chat-room-div");
    chat.id = "chat-room-div";
    const topMenu = this.el("div", "chat-room-top-menu");
    topMenu.id = "chat-room-top-menu";
    const roomTitle = this.el("strong", "room-title", state.room!.Name); roomTitle.title = state.room!.Name;
    topMenu.append(roomTitle, this.el("span", "room-population", `${state.characters.length}/${state.room!.Limit}`));
    const toggle = this.button(this.membersOpen ? t("m160") : t("m161"), "ghost mobile-members", "button");
    toggle.addEventListener("click", () => { this.membersOpen = !this.membersOpen; this.render(); });
    const history = this.button(t("m162"), "ghost", "button");
    history.addEventListener("click", () => {
      const old = document.getElementById("TextAreaChatLog")!;
      const height = old.scrollHeight; const top = old.scrollTop;
      this.visibleMessages = Math.min(600, this.visibleMessages + 100); this.render();
      const next = document.getElementById("TextAreaChatLog")!;
      next.scrollTop = top + next.scrollHeight - height;
    });
    const jump = this.button(t("m163"), "secondary", "button"); jump.id = "new-messages"; jump.hidden = true;
    jump.addEventListener("click", () => { this.visibleMessages = 100; this.updateChatLog(true); });
    topMenu.append(toggle, history, jump);
    const mobileLeave = this.button(t("m164"), "ghost", "button");
    mobileLeave.addEventListener("click", () => bcClient.leave());
    topMenu.append(mobileLeave);
    const safeword = this.button(t("safety.title"), "ghost danger safeword-button", "button");
    safeword.id = "room-safeword";
    safeword.addEventListener("click", () => this.showSafeword());
    topMenu.append(safeword);
    const struggle = this.el("div", "chat-room-struggle-bar"); struggle.id = "chat-room-struggle-bar";
    const log = this.el("div", "text-area-chat-log"); log.id = "TextAreaChatLog"; log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite");
    log.dataset.room = state.room!.Name;
    log.dataset.latest = state.messages.at(-1)?.id || "";
    state.messages.slice(-this.visibleMessages).forEach((message) => log.append(this.messageNode(message)));
    const reply = this.el("div", "chat-room-reply-indicator"); reply.id = "chat-room-reply-indicator";
    const bot = this.el("form", "chat-room-bot") as HTMLFormElement; bot.id = "chat-room-bot";
    const input = document.createElement("textarea"); input.id = "InputChat"; input.placeholder = t("composer.placeholder"); input.title = t("composer.help"); input.setAttribute("aria-label", t("composer.placeholder")); input.maxLength = 1000; input.value = this.chatDraft;
    const length = this.el("span", "input-chat-length", `${this.chatDraft.length}/1000`); length.id = "InputChatLength";
    input.addEventListener("input", () => { this.chatDraft = input.value; length.textContent = `${input.value.length}/1000`; });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); bot.requestSubmit(); } });
    const buttons = this.el("div", "chat-room-buttons-div"); buttons.id = "chat-room-buttons-div";
    const inner = this.el("div", "chat-room-buttons"); inner.id = "chat-room-buttons";
    const send = this.button(t("m166"), "primary", "submit"); inner.append(length, send); buttons.append(inner); bot.append(input, buttons);
    bot.addEventListener("submit", (event) => {
      event.preventDefault();
      try { bcClient.sendChat(this.chatDraft); this.chatDraft = ""; input.value = ""; length.textContent = "0/1000"; }
      catch (error) { this.localNotice(error instanceof Error ? error.message : t("m167")); }
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
      const body = this.chatText("span", "message-emote", message.text);
      body.prepend(document.createTextNode(`* ${message.senderName} `));
      row.append(time, body);
    } else if (message.type === "Whisper") {
      row.append(time, this.el("strong", "message-author", message.senderName), this.el("span", "message-target", ` → ${message.targetName}`), this.chatText("span", "message-text", message.text));
    } else {
      row.append(time, this.el("strong", "message-author", message.senderName), this.chatText("span", "message-text", message.text));
    }
    return row;
  }

  private showSafeword(): void {
    const dialog = this.el("dialog", "profile-dialog safeword-dialog");
    dialog.setAttribute("aria-label", t("safety.title"));
    dialog.append(this.el("h2", "", t("safety.title")), this.el("p", "", t("safety.help")));
    for (const mode of ["revert", "release"] as const) {
      const label = t(mode === "revert" ? "safety.revert" : "safety.release");
      const action = this.button(label, "ghost danger", "button");
      action.dataset.safeword = mode;
      action.addEventListener("click", () => {
        if (!window.confirm(t("safety.confirm", [label]))) return;
        try { bcClient.activateSafeword(mode); dialog.close(); dialog.remove(); }
        catch (error) { this.localNotice(error instanceof Error ? error.message : String(error)); }
      });
      dialog.append(action);
    }
    const cancel = this.button(t("safety.cancel"), "ghost", "button");
    cancel.addEventListener("click", () => { dialog.close(); dialog.remove(); });
    dialog.addEventListener("close", () => dialog.remove());
    dialog.append(cancel); document.body.append(dialog); dialog.showModal();
  }

  private chatText(tag: "span" | "p", className: string, text: string): HTMLElement {
    const node = this.el(tag, className);
    appendChatLinks(node, text);
    return node;
  }

  private showMember(character: CharacterSummary): void {
    const dialog = this.el("dialog", "profile-dialog");
    dialog.append(this.el("h2", "", `${character.Nickname || character.Name} #${character.MemberNumber}`));
    const relationName = (value: { Name?: string; MemberNumber?: number }) => `${value.Name || t("m168")}${value.MemberNumber ? ` (#${value.MemberNumber})` : ""}`;
    dialog.append(this.el("p", "", t("m169", [character.Ownership ? relationName(character.Ownership) : character.Owner || t("m170")])), this.el("p", "", t("m171", [character.Lovership?.length ? character.Lovership.map(relationName).join("、") : t("m170")])));
    const bio = this.el("details", "profile-bio");
    bio.append(this.el("summary", "", t("m172")));
    bio.addEventListener("toggle", () => { if (bio.open && bio.childElementCount === 1) bio.append(this.el("p", "profile-description", decodeBiography(character.Description))); });
    dialog.append(bio);
    const actions = this.el("div", "toolbar");
    const close = this.button(t("m173"), "ghost", "button");
    const dismiss = () => { dialog.close(); dialog.remove(); };
    close.addEventListener("click", dismiss);
    dialog.addEventListener("close", () => dialog.remove());
    if (character.MemberNumber !== this.snapshot!.player?.MemberNumber) {
      const whisper = this.button(t("m174"), "secondary", "button");
      whisper.addEventListener("click", () => {
        if (this.chatDraft.trim() && !window.confirm(t("m175"))) return;
        dismiss(); this.chatDraft = `/w ${character.MemberNumber} `; this.membersOpen = false; this.render(); document.getElementById("InputChat")?.focus();
      });
      const friend = this.button(t("m176"), "ghost", "button");
      friend.addEventListener("click", () => this.run(() => bcClient.setFriend(character.MemberNumber, true)));
      const beep = this.button(t("m177"), "ghost", "button");
      beep.addEventListener("click", () => { dismiss(); this.openConversation(character.MemberNumber); });
      actions.append(whisper, friend, beep);
    }
    actions.append(close); dialog.append(actions); document.body.append(dialog); dialog.showModal();
  }

  private buildFooter(): HTMLElement {
    const footer = this.el("footer", "app-footer");
    footer.append(this.el("span", "", "BC Lite · Social preview · Relay v1"), this.el("span", "", t("m178")));
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
