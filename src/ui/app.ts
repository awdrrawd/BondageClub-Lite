import { t, getLocale, setLocale, type Locale } from "../i18n";
import "./style.css";
import { bcClient } from "../network/client";
import { decodeBiography } from "../profile/biography";
import { contactName } from "../profile/friend-names";
import { HistoryStore, historyOwner } from "../storage/history";
import { buildHistorySettings } from "./history-settings";
import { el, select, field, button, checkbox, input } from "./dom";
import { PrivateMessages } from "./private-messages";
import { contactCard } from "./contact-card";
import { HistorySession } from "../storage/history-session";
import { appendChatLinks, MediaConsent } from "../media/chat-links";
import { afcLovers } from "../profile/afc";
import { StabilityControls } from "../platform/stability";
import { loadTextCatalog } from "../action/catalog";
import { openActivityDialog } from "./activity-dialog";
import { icon, type IconName } from "./icons";
import { iconSelect } from "./icon-select";
import { nameColor } from "./name-color";
import { isMobileLayout, bindPageSwipe } from "../platform/mobile";
import { canJoinRoom, sortRooms, type RoomSort } from "./room-list";
import type { CharacterSummary, ClientSnapshot, DisplayMessage, RoomCreateOptions, RoomSearchRequest, RoomSearchResult } from "../shared/types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error(t("m001"));

const roomLanguageIcons: Record<string, IconName> = { CN:'zh', EN:'en', DE:'de', FR:'fr', ES:'es', RU:'ru', UA:'ua' };
export type UiClient = Pick<typeof bcClient, "restoreMessages" | "recordLifecycle" | "resumeConnection" | "setMessageLimit" | "subscribe" | "setTextCatalog" | "relocalize" | "disconnect" | "refreshFriends" | "setFriend" | "sendChat" | "sendBeep" | "requestLoverRoom" | "connectionDiagnostics" | "acceptSummon" | "dismissSummon" | "configureSummons" | "search" | "leave" | "join" | "login" | "createRoom" | "clearMessages" | "respondCuddle" | "cuddleInfo" | "activateSafeword" | "activityOptions" | "sendActivity">;
export class LiteApp {
  private client: UiClient;
  private history: HistorySession;
  private historyError = false;
  private restoringHistory = false;
  private mediaConsent = new MediaConsent(document);
  private privateFilter = "room";
  private replyTarget: DisplayMessage | null = null;
  private privateListOpen = true;
  private privateVisible = 60;
  private privateEndId: string | null = null;
  private privateMessagesView = new PrivateMessages();
  private privatePaging = false;
  private privateRendered = new WeakMap<Element, DisplayMessage>();
  private summonConfig = { enabled: false, members: "", text: "Come to my room immediately" };
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
  private friendFilter = "online";
  private createFields = { Background: "MainHall", Admin: "", Whitelist: "", Ban: "", ImageURL: "", MusicURL: "", Game: "", Visibility: "", Access: "All", MapType: "Never", Fog: false, MapJSON: "", BlockCategory: [] as string[] };
  private roomPage = 0;
  private roomSort: RoomSort = "friends";
  private roomSearchInitialized = false;
  private unlisted = true;
  private showFull = false;
  private showLocked = true;
  private searchDescriptions = false;
  private notice = "";
  private tab: "rooms" | "chat" | "friends" | "private" | "settings" = "rooms";
  private friendQuery = "";
  private contact = 0;
  private beepDraft = "";
  private contactDrafts = new Map<number, string>();
  private privateMode = "beep";
  private catalogLoading = false;
  private catalogRequest = 0;
  private membersOpen = false;
  private visibleMessages = 100;
  private historyEndId: string | null = null;
  private performance = { history: 3000, visible: 100 };
  private unread = 0;
  private roomUnread = 0;
  private composing = false;
  private renderPending = false;
  private settings = { background: false, largeText: false, timestamps: true, locale: "zh" as Locale, theme: "default" };

  constructor(client: UiClient = bcClient) {
    window.matchMedia("(max-width: 760px)").addEventListener("change", () => {
      this.roomPage = 0;
      if (this.snapshot && this.tab === "rooms") this.render();
    });
    this.client = client;
    const persist = !document.documentElement.hasAttribute("data-ui-preview") && typeof window.indexedDB !== "undefined";
    this.historyError = !persist && !document.documentElement.hasAttribute("data-ui-preview");
    this.history = new HistorySession(persist ? new HistoryStore(window.indexedDB) : null, () => {
      if (this.snapshot?.player) this.updateFriendContent();
    }, () => { if (!this.historyError) { this.historyError = true; this.localNotice(t("history.error")); } }, (owner, messages) => {
      this.restoringHistory=true;
      try { this.client.restoreMessages(owner,messages); } finally { this.restoringHistory=false; }
    });
    window.addEventListener("pagehide", () => { void this.history.flush(); });
    window.setInterval(() => { if (this.snapshot) this.history.observe(this.snapshot); }, 60000);
    // Delegate selection before controls run; reply jumps may then select their destination.
    document.addEventListener("click", event => {
      const target = event.target as HTMLElement | null;
      this.selectMessage(target?.closest<HTMLElement>(".chat-message") ?? null);
    }, true);
    document.addEventListener("click", event => {
      const target = event.target as HTMLElement;
      for (const picker of document.querySelectorAll<HTMLDetailsElement>(".mobile-picker[open]")) if (!picker.contains(target)) picker.open = false;
      if (!target.closest(".room-query, .room-search")) document.querySelector(".room-controls.search-expanded")?.classList.remove("search-expanded");
      if (this.membersOpen && !target.closest(".member-panel, .mobile-members, .profile-dialog")) {
        this.membersOpen = false;
        document.querySelector(".room-view")?.classList.remove("members-open");
        const toggle = document.querySelector<HTMLButtonElement>(".chat-room-top-menu .mobile-members");
        if (toggle) toggle.textContent = t("m161");
      }
    });
    const resume = (event: "visible" | "online" | "pageshow") => {
      this.client.recordLifecycle(event);
      if (document.visibilityState === "visible" && window.navigator.onLine !== false) this.client.resumeConnection();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resume("visible");
      else this.client.recordLifecycle("hidden");
    });
    window.addEventListener("pageshow", () => resume("pageshow"));
    window.addEventListener("online", () => resume("online"));
    window.addEventListener("offline", () => this.client.recordLifecycle("offline"));
    app!.addEventListener("compositionstart", () => { this.composing = true; });
    app!.addEventListener("compositionend", () => {
      this.composing = false;
      // The final input event follows compositionend. Read its draft before replacing controls.
      window.setTimeout(() => { if (this.renderPending) { this.renderPending = false; this.render(); } }, 0);
    });
    try {
      const saved = JSON.parse(localStorage.getItem("bc-lite-display-v1") || "{}");
      this.settings = { background: saved.background === true, largeText: saved.largeText === true, timestamps: saved.timestamps !== false, locale: saved.locale === "en" ? "en" : "zh", theme: ["default", "midnight", "forest"].includes(saved.theme) ? saved.theme : "default" };
    } catch { /* Storage can be unavailable in private browsing. */ }
    try {
      const savedAccount = localStorage.getItem("bc-lite-account-v1");
      if (savedAccount && savedAccount.length <= 100) { this.accountName = savedAccount; this.rememberAccount = true; }
    } catch { /* Remembering an account is optional. */ }
    setLocale(this.settings.locale);
    try {
      const saved = JSON.parse(localStorage.getItem("bc-lite-performance-v1") || "{}");
      this.performance = { history: [600, 1500, 3000].includes(saved.history) ? saved.history : 3000, visible: [50, 100, 200].includes(saved.visible) ? saved.visible : 100 };
    } catch { /* Use bounded defaults for unavailable or malformed storage. */ }
    this.visibleMessages = this.performance.visible;
    this.client.setMessageLimit(this.performance.history);
    this.applySettings();
    this.client.subscribe((snapshot) => {
      const previous = this.snapshot;
      this.snapshot = snapshot;
      const ownerChanged = (previous ? historyOwner(previous) : '') !== historyOwner(snapshot);
      if (ownerChanged) this.resetAccountView();
      this.history.observe(snapshot);
      if (this.privateMode === "whisper" && !snapshot.characters.some(c => c.MemberNumber === this.contact)) { this.privateMode = "beep"; this.replyTarget = null; }
      if (previous && (snapshot.characters !== previous.characters || snapshot.player !== previous.player || snapshot.room !== previous.room)) {
        document.querySelector('.activity-dialog')?.dispatchEvent(new window.Event('activity-refresh'));
      }
      if (snapshot.phase === "ready" && !this.roomSearchInitialized) {
        this.roomSearchInitialized = true;
        const owner = historyOwner(snapshot);
        window.setTimeout(() => {
          if (owner && this.snapshot && historyOwner(this.snapshot) === owner && ["ready", "joining", "in-room"].includes(this.snapshot.phase)) this.searchRooms(true);
        }, 0);
      }
      if (snapshot.cuddleRequest !== previous?.cuddleRequest || (snapshot.cuddleRequest && snapshot.characters !== previous?.characters)) this.showCuddleRequest();
      if (!snapshot.player || snapshot.phase === "error") this.stability.stop();
      if (snapshot.player && !this.catalogLoading) {
        this.refreshCatalog();
      }
      if (snapshot.summon !== previous?.summon) this.updateSummon();
      if (previous && snapshot.messages !== previous.messages && snapshot.messages.some((message, index) => message.id === previous.messages[index]?.id && message.text !== previous.messages[index]?.text)) { this.render(); return; }
      if (!["ready", "joining", "in-room"].includes(snapshot.phase)) document.querySelectorAll(".profile-dialog").forEach(dialog => dialog.remove());
      if (snapshot.room && snapshot.room.Name !== previous?.room?.Name) { this.tab = "chat"; this.visibleMessages = this.performance.visible; this.historyEndId = null; }
      if (!snapshot.room && previous?.room && this.tab === "chat") this.tab = "rooms";
      if (previous && !ownerChanged && snapshot.beeps !== previous.beeps && snapshot.beeps.at(-1)?.incoming && this.tab !== "private" && snapshot.beeps.at(-1)?.id !== previous.beeps.at(-1)?.id) this.unread++;
      if (previous && !ownerChanged && snapshot.whispers !== previous.whispers && snapshot.whispers?.at(-1)?.sender !== snapshot.player?.MemberNumber && snapshot.whispers?.length && this.tab !== "private" && snapshot.whispers.at(-1)?.id !== previous.whispers?.at(-1)?.id) this.unread++;
      if (previous && !ownerChanged && !this.restoringHistory && snapshot.messages !== previous.messages && snapshot.messages.length && this.tab !== "chat" && snapshot.messages.at(-1)?.id !== previous.messages.at(-1)?.id) this.roomUnread++;
      // Chat packets and server population updates never replace an active composer (including IME input).
      if (previous && snapshot.phase === previous.phase && snapshot.player === previous.player && snapshot.room === previous.room && snapshot.characters === previous.characters && snapshot.rooms === previous.rooms) {
        this.updateHeader();
        this.updateChatLog();
        if (snapshot.friends !== previous.friends || snapshot.loverRooms !== previous.loverRooms || snapshot.friendsStatus !== previous.friendsStatus || snapshot.beeps !== previous.beeps) this.updateFriendContent();
        else if (snapshot.whispers !== previous.whispers) this.updateFriendContent();
        return;
      }
      this.render();
    });
  }

  private resetAccountView(): void {
    this.contactDrafts.clear(); this.mediaConsent.resetSession(); this.replyTarget=null;
    this.summonConfig={enabled:false,members:'',text:'Come to my room immediately'};
    this.unread=0; this.roomUnread=0; this.contact=0; this.beepDraft=''; this.chatDraft=''; this.password=''; this.notice='';
    this.tab='rooms'; this.friendFilter='online'; this.friendQuery=''; this.privateFilter='room'; this.privateMode='beep';
    this.privateListOpen=true; this.privateVisible=60; this.privateEndId=null; this.privatePaging=false; this.privateMessagesView.reset();
    this.membersOpen=false; this.historyEndId=null; this.visibleMessages=this.performance.visible; this.roomPage=0; this.roomSearchInitialized=false; this.query='';
    this.composing=false; this.renderPending=false;
    document.querySelectorAll('.profile-dialog, .activity-dialog').forEach(dialog=>dialog.remove());
  }

  private applySettings(): void {
    document.documentElement.dataset.theme = this.settings.theme;
    document.documentElement.lang = getLocale() === "zh" ? "zh-Hant" : "en";
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("site.description"));
    document.body.classList.toggle("scenic", this.settings.background);
    document.body.classList.toggle("large-text", this.settings.largeText);
    document.body.classList.toggle("hide-times", !this.settings.timestamps);
  }

  private refreshCatalog(): void {
    this.catalogLoading = true;
    const request = ++this.catalogRequest;
    void loadTextCatalog(getLocale()).then(catalog => { if (request === this.catalogRequest) this.client.setTextCatalog(catalog); }).catch(() => { if (request === this.catalogRequest) this.localNotice(t("m002")); });
  }

  private languageControl(): HTMLElement {
    const select = this.select(t("locale.label"), [["zh", t("locale.zh")], ["en", t("locale.en")]], getLocale());
    select.id = "InterfaceLocale";
    select.addEventListener("change", () => {
      this.settings.locale = select.value === "en" ? "en" : "zh";
      setLocale(this.settings.locale); this.applySettings();
      try { localStorage.setItem("bc-lite-display-v1", JSON.stringify(this.settings)); } catch { this.localNotice(t("m060")); }
      this.client.relocalize(); this.render();
      if (this.snapshot?.player) this.refreshCatalog();
    });
    const control = iconSelect(select, {zh: "zh", en: "en"}, "translate", true);
    control.classList.add("locale-picker"); return control;
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
    const brand = document.querySelector<HTMLElement>(".brand"); if (brand) brand.title = this.snapshot!.status;
    const privateTab = document.querySelector("#nav-private .nav-label");
    if (privateTab) privateTab.textContent = `${t("private.title")}${this.unread ? ` · ${this.unread}` : ""}`;
    const chat = document.querySelector("#nav-chat .nav-label");
    if (chat) chat.textContent = `${t("nav.room")}${this.roomUnread ? ` · ${this.roomUnread}` : ""}`;
  }

  private updateChatLog(force = false): void {
    const log = document.getElementById("TextAreaChatLog");
    if (!log) return;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 70;
    const latest = this.snapshot!.messages.at(-1)?.id || "";
    if (!force && log.dataset.latest === latest) return;
    const jump = document.getElementById("new-messages");
    if (!force && this.historyEndId && this.snapshot!.messages.length) { if (jump) jump.hidden = false; return; }
    // Freeze the visible slice while reading older messages; no scroll jump or unbounded hidden DOM.
    if (!force && this.snapshot!.messages.length && !atBottom && log.childElementCount) { if (jump) jump.hidden = false; return; }
    const messages = this.visibleHistory();
    const ids = new Set(messages.map(message => message.id));
    for (const node of Array.from(log.children)) if (!ids.has((node as HTMLElement).dataset.messageId || "")) { this.mediaConsent.dispose(node as HTMLElement); node.remove(); }
    const existing = new Set(Array.from(log.children).map(node => (node as HTMLElement).dataset.messageId));
    const fragment = document.createDocumentFragment();
    for (const message of messages) if (!existing.has(message.id)) fragment.append(this.messageNode(message));
    log.append(fragment);
    log.dataset.latest = latest;
    if (atBottom || force) log.scrollTop = log.scrollHeight;
    if (jump) jump.hidden = !this.historyEndId;
  }

  private visibleHistory(): DisplayMessage[] {
    const all = this.snapshot!.messages;
    const index = this.historyEndId ? all.findIndex(message => message.id === this.historyEndId) : -1;
    const end = this.historyEndId ? (index < 0 ? Math.min(all.length, this.visibleMessages) : index + 1) : all.length;
    return all.slice(Math.max(0, end - this.visibleMessages), end);
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

    this.mediaConsent.dispose(app!);
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
    document.body.classList.toggle("private-active", this.tab === "private" && !!state.player);
    const shell = this.el("main", "app-shell");
    const header = this.el("header", "app-header");
    const brand = this.el("div", "brand");
    brand.append(this.el("span", "brand-mark", "BC"), this.el("div", "", "Lite"));
    const connection = this.el("div", `connection phase-${state.phase}`);
    connection.append(this.el("span", "status-dot"), this.el("span", "", state.status));
    const statusControls = this.el("div", "header-status-controls");
    const localeControl = this.languageControl();
    localeControl.classList.add("header-locale");
    brand.title = state.status;
    statusControls.append(localeControl);
    header.append(brand);
    if (state.player) {
      const account = this.el("div", "header-account");
      const name = this.button(`${state.player.Nickname || state.player.Name} (#${state.player.MemberNumber})`, "ghost", "button");
      name.addEventListener("click", () => this.showMember(state.characters.find(character => character.MemberNumber === state.player!.MemberNumber) || state.player!));
      const logout = this.button(t("m007"), "ghost", "button");
      logout.addEventListener("click", () => { if (window.confirm(t("m008"))) this.client.disconnect(); });
      account.append(name); header.append(account);
      const safety = this.button(t("safety.title"), "ghost danger header-safety", "button"); safety.id = "room-safeword";
      safety.disabled = !state.room || state.phase !== "in-room";
      safety.addEventListener("click", () => this.showSafeword()); header.append(safety);
      statusControls.append(logout);
    }
    header.append(statusControls);
    const summon = this.el("div", "summon-notice"); summon.id = "summon-notice";

    const content = this.el("div", "app-content");
    if (state.phase === "idle" || state.phase === "connecting" || state.phase === "authenticating" || state.phase === "waiting-server" || state.phase === "reconnecting" || state.phase === "error") {
      content.append(this.buildLogin());
    } else if (this.tab === "friends") {
      content.append(this.buildFriends());
    } else if (this.tab === "private") {
      content.append(this.buildFriends(true));
    } else if (this.tab === "settings") {
      content.append(this.buildSettings());
    } else if (state.room && this.tab === "chat") {
      content.append(this.buildRoom());
    } else {
      content.append(this.buildSearch());
    }
    header.append(summon);
    this.fillSummon(summon);
    shell.append(header, content);
    if (state.player && ["ready", "joining", "in-room"].includes(state.phase)) shell.append(this.buildNavigation());
    shell.append(this.buildFooter());
    return shell;
  }

  private buildNavigation(): HTMLElement {
    const nav = this.el("nav", "app-nav");
    nav.setAttribute("aria-label", t("m009"));
    for (const [key, label] of [["rooms", t("nav.search")], ["chat", t("nav.room")], ["private", t("private.title")], ["friends", t("m012")], ["settings", t("m013")]] as const) {
      const button = this.button(label, this.tab === key ? "active" : "ghost", "button");
      const icons: Record<string, IconName> = { rooms: "search", chat: "room", private: "chats", friends: "users", settings: "gear" };
      button.replaceChildren(icon(icons[key]), this.el("span", "nav-label", label));
      button.id = `nav-${key}`;
      button.setAttribute("aria-current", this.tab === key ? "page" : "false");
      button.disabled = key === "chat" && !this.snapshot!.room;
      button.addEventListener("click", () => {
        if (this.tab !== key) this.replyTarget = null;
        this.tab = key;
        if (key === "private") this.unread = 0;
        if (key === "chat") this.roomUnread = 0;
        this.render();
        if ((key === "friends" || key === "private") && this.snapshot!.friendsQueryState === "idle") this.run(() => this.client.refreshFriends());
      });
      nav.append(button);
    }
    return nav;
  }

  private buildFriends(privatePage = false): HTMLElement {
    const section = this.el("section", privatePage ? "friends-view private-page" : "friends-view");
    if (!privatePage) section.append(this.el("p", "eyebrow", t("friends.list")));
    section.append(this.el("h1", "", privatePage ? t("private.title") : t("m016")));
    if (!privatePage) section.append(this.el("p", "muted", t("m017")));
    const toolbar = this.el("form", "toolbar contact-toolbar");
    const refresh = this.button("", "ghost friend-refresh", "button");
    refresh.append(icon("refresh")); refresh.title = t("m018"); refresh.setAttribute("aria-label", t("m018"));
    refresh.disabled = this.snapshot!.friendsQueryState === "loading";
    refresh.addEventListener("click", () => this.run(() => this.client.refreshFriends()));
    const query = this.input("FriendQuery", t("m019"), "search", this.friendQuery);
    query.addEventListener("input", () => { this.friendQuery = query.value; this.updateFriendContent(); });
    const search = this.button("", "ghost", "submit"); search.append(icon("search")); search.title = t("m098"); search.setAttribute("aria-label", t("m098"));
    toolbar.addEventListener("submit", event => { event.preventDefault(); this.friendQuery = query.value; this.updateFriendContent(); });
    toolbar.append(query, search, refresh);
    const filters = this.el("div", "toolbar friend-filters");
    for (const [value, label] of (privatePage ? [["room", t("m010")], ["friends", t("m012")], ["recent", t("private.recent")]] : [["all", t("m020")], ["online", t("m021")], ["offline", t("m022")], ["unknown", t("m023")]])) {
      const button = this.button(label, (privatePage ? this.privateFilter : this.friendFilter) === value ? "secondary" : "ghost", "button");
      button.setAttribute("aria-pressed", String((privatePage ? this.privateFilter : this.friendFilter) === value));
      button.addEventListener("click", () => { if (privatePage) this.privateFilter = value; else this.friendFilter = value; this.render(); });
      filters.append(button);
    }
    const status = this.el("p", "muted"); status.id = "friends-status";
    const list = this.el("div", "contact-list"); list.id = "contact-list";
    if (!privatePage) {
      section.append(toolbar, filters, status, list);
      this.fillFriendList(list); status.textContent = this.snapshot!.friendsStatus;
      return section;
    }
    const form = this.el("form", "beep-compose") as HTMLFormElement;
    const text = document.createElement("textarea"); text.id = "BeepText"; text.placeholder = t("m025"); text.maxLength = 1000; text.required = true; text.value = this.beepDraft;
    text.addEventListener("input", () => { this.beepDraft = text.value; });
    const add = this.button(t("m026"), "ghost", "button");
    add.addEventListener("click", () => this.run(() => this.client.setFriend(this.contact, true)));
    const channel = this.el("div", "private-channel");
    channel.setAttribute("role", "group"); channel.setAttribute("aria-label", t("m027"));
    for (const [mode, label] of [["whisper", t("m029")], ["beep", t("m028")]]) {
      const button = this.button(label, "secondary", "button");
      button.dataset.channel = mode;
      button.disabled = mode === "whisper" && !this.snapshot!.characters.some(c => c.MemberNumber === this.contact);
      button.setAttribute("aria-pressed", String(this.privateMode === mode));
      button.addEventListener("click", () => {
        if (this.privateMode === mode) return;
        this.privateMode = mode; this.replyTarget = null; form.querySelector(".reply-preview")?.remove();
        for (const control of channel.querySelectorAll("button")) control.setAttribute("aria-pressed", String(control === button));
      });
      channel.append(button);
    }
    const send = this.button(t("m030"), "primary", "submit");
    send.disabled = !this.contact;
    form.append(channel, text, send);
    if (this.replyTarget) form.prepend(this.replyIndicator());
    form.addEventListener("submit", event => {
      event.preventDefault();
      this.run(() => {
        if (this.privateMode === "whisper") {
          if (!this.beepDraft.trim()) return;
          if (!this.snapshot!.characters.some(character => character.MemberNumber === this.contact)) throw new Error(t("m032"));
          this.client.sendChat(`/w ${this.contact} ${this.replyContent(this.beepDraft)}`, this.replyTarget?.nativeId);
        } else this.client.sendBeep(this.contact, this.replyContent(this.beepDraft));
        this.beepDraft = ""; this.replyTarget = null; form.querySelector(".reply-preview")?.remove(); this.contactDrafts.delete(this.contact); text.value = "";
      });
    });
    const inbox = this.el("div", "beep-log"); inbox.id = "beep-log"; inbox.setAttribute("role", "log");
    const contacts = this.el("aside", "private-contacts");
    contacts.append(this.el("h2", "private-heading", t("private.contacts")), toolbar, filters, list);
    const conversation = this.el("section", "private-conversation");
    const back = this.button(t("private.back"), "ghost private-back", "button");
    back.addEventListener("click", () => { this.privateListOpen = true; this.render(); });
    const peerName = this.contactName(this.contact);
    const heading = this.el("div", "private-heading");
    add.disabled = !this.contact;
    heading.append(back, this.el("h2", "", this.contact ? `${peerName || t("private.title")} · #${this.contact}` : t("m035")), add);
    const paging = this.el("nav", "toolbar private-history-controls"); paging.setAttribute("aria-label", t("history.title"));
    const older = this.button(t("history.older"), "ghost", "button"); older.dataset.history = "older";
    const newer = this.button(t("history.newer"), "ghost", "button"); newer.dataset.history = "newer";
    older.addEventListener("click", () => this.pagePrivate(-1)); newer.addEventListener("click", () => this.pagePrivate(1));
    paging.append(older, newer);
    conversation.append(heading, paging, inbox, form);
    const split = this.el("div", `private-split ${this.privateListOpen ? "show-contacts" : "show-conversation"}`);
    split.append(contacts, conversation); section.append(split);
    // Populate detached containers; later updates only touch list and log, never the composer.
    this.fillFriendList(list);
    status.textContent = this.snapshot!.friendsStatus;
    this.fillBeepLog(inbox);
    this.updatePrivatePaging(paging);
    return section;
  }

  private updateFriendContent(): void {
    document.querySelectorAll<HTMLElement>(".room-card[data-room-name]").forEach(card => {
      const room = this.snapshot!.rooms.find(value => value.Name === card.dataset.roomName && value.Space === card.dataset.roomSpace);
      const tags = card.querySelector(".room-tags"); if (!room || !tags) return;
      tags.querySelector(".afc-tag")?.remove();
      const lovers = this.roomLovers(room);
      if (lovers.length) { const badge = this.el("span", "tag afc-tag", t("afc.inRoom", [lovers.length])); badge.title = lovers.map(lover => `${lover.name} #${lover.memberNumber}`).join("、"); tags.append(badge); }
    });
    const list = document.getElementById("contact-list");
    if (list) this.fillFriendList(list);
    const status = document.getElementById("friends-status");
    if (status) status.textContent = this.snapshot!.friendsStatus;
    const refresh = document.querySelector<HTMLButtonElement>(".friend-refresh");
    if (refresh) { refresh.disabled = this.snapshot!.friendsQueryState === "loading"; refresh.setAttribute("aria-busy", String(refresh.disabled)); refresh.title = `${t("m018")} · ${this.snapshot!.friendsStatus}`; }
    this.updateBeepLog();
  }

  private openConversation(memberNumber: number, mode = "beep"): void {
    if (!Number.isSafeInteger(memberNumber) || memberNumber <= 0) return;
    this.replyTarget = null;
    this.contactDrafts.set(this.contact, this.beepDraft);
    this.contact = memberNumber;
    this.privateListOpen = false; this.privateVisible = 60; this.privateEndId = null;
    this.beepDraft = this.contactDrafts.get(memberNumber) || "";
    this.privateMode = mode === "whisper" && this.snapshot!.characters.some(c => c.MemberNumber === memberNumber) ? "whisper" : "beep"; this.tab = "private"; this.unread = 0;
    this.render(); document.getElementById("BeepText")?.focus();
    void this.history.loadPrivate(memberNumber).catch(()=>this.localNotice(t('history.error')));
  }

  private fillFriendList(list: HTMLElement): void {
    list.replaceChildren();
    const state = this.snapshot!;
    const online = new Map(state.friends.map(friend => [friend.MemberNumber, friend]));
    let ids = [...new Set([...online.keys(), ...(state.player?.FriendList || []), ...afcLovers(state.player).map(lover => lover.memberNumber)])];
    if (this.tab === "private" && this.privateFilter === "room") ids = state.characters.map(character => character.MemberNumber);
    if (this.tab === "private" && this.privateFilter === "recent") ids = [...new Set([...this.history.contacts.map(contact => contact.peer), ...state.beeps.map(message => message.memberNumber), ...(state.whispers || state.messages).filter(message => message.type === "Whisper").map(message => message.sender === state.player?.MemberNumber ? message.target! : message.sender!)])];
    ids = ids.filter(id => id > 0 && id !== state.player?.MemberNumber);
    if (this.tab === "private" && this.privateFilter === "recent") {
      const recent = new Map<number, number>(this.history.contacts.map(contact => [contact.peer, contact.timestamp]));
      state.beeps.forEach(message => recent.set(message.memberNumber, Math.max(recent.get(message.memberNumber) || 0, +message.time)));
      (state.whispers || state.messages).filter(message => message.type === "Whisper").forEach(message => {
        const id = message.sender === state.player?.MemberNumber ? message.target! : message.sender!;
        recent.set(id, Math.max(recent.get(id) || 0, +message.time));
      }); ids.sort((a, b) => (recent.get(b) || 0) - (recent.get(a) || 0));
    } else ids.sort((a, b) => Number(online.has(b)) - Number(online.has(a)) || a - b);
    let total = 0;
    for (const id of ids) {
      const friend = online.get(id);
      const inRoom = state.characters.some(character => character.MemberNumber === id);
      const fresh = state.friendsQueryState === "ready";
      const presence = inRoom || (friend && fresh) ? "online" : fresh && state.player?.FriendList?.includes(id) ? "offline" : "unknown";
      if (this.tab !== "private" && this.friendFilter !== "all" && this.friendFilter !== presence) continue;
      if (this.tab === "private" && this.privateFilter === "friends" && presence !== "online") continue;
      const name = this.contactName(id);
      if (!`${name} ${id}`.toLowerCase().includes(this.friendQuery.trim().toLowerCase())) continue;
      total++;
      if (total > 80) continue;
      const relationship = friend?.Type || (state.player?.Ownership?.MemberNumber === id ? "Owner" : state.player?.Lovership?.some(lover => lover.MemberNumber === id) ? "Lover" : state.player?.FriendList?.includes(id) ? "Friend" : "");
      const relation = ({ Friend: t("relation.friend"), Lover: t("relation.lover"), Owner: t("relation.owner"), Submissive: t("relation.submissive") }[relationship] || relationship);
      const sharedRoom = inRoom ? state.room?.Name : fresh ? friend?.ChatRoomName || state.loverRooms?.[id]?.name : undefined;
      const roomLabel = inRoom ? t("contact.sameRoom") : fresh && friend?.Private ? t("contact.privateRoom") : sharedRoom;
      const {row,info}=contactCard({id,name,online:presence==='online',selected:this.tab==='private' && this.contact===id,relation,room:roomLabel,activate:()=>this.openConversation(id)});
      if (afcLovers(state.player).some(lover => lover.memberNumber === id)) {
        info.append(this.el("span", "tag afc-tag", t("afc.title")));
        const queryRoom = this.button(t("afc.query"), "ghost afc-query", "button");
        queryRoom.disabled = !state.player?.FriendList?.includes(id) || !["ready", "in-room"].includes(state.phase);
        queryRoom.addEventListener("click", () => this.run(() => this.client.requestLoverRoom(id))); row.append(queryRoom);
      }
      if (sharedRoom) {
        const join = this.button(t("m044"), "ghost", "button");
        join.disabled = !["ready", "in-room"].includes(state.phase);
        join.title = sharedRoom;
        join.addEventListener("click", () => this.joinRoom(sharedRoom));
        row.append(join);
      }
      if (this.tab !== "private" && state.player?.FriendList?.includes(id)) {
        const remove = this.button(t("m047"), "ghost danger", "button");
        remove.addEventListener("click", () => { if (window.confirm(t("m048", [id]))) this.run(() => this.client.setFriend(id, false)); });
        row.append(remove);
      }
      list.append(row);
    }
    if (!total) list.append(this.el("p", "empty-state", t("m049")));
    if (total > 80) list.append(this.el("p", "muted", t("m050", [total])));
  }

  private contactName(id: number): string {
    return contactName(this.snapshot!, id, [...this.snapshot!.beeps].reverse().find(message => message.memberNumber === id)?.name || this.history.contacts.find(contact => contact.peer === id)?.name || afcLovers(this.snapshot!.player).find(lover => lover.memberNumber === id)?.name);
  }

  private updateBeepLog(): void { const log = document.getElementById("beep-log"); if (log) this.fillBeepLog(log); this.updatePrivatePaging(document.querySelector(".private-history-controls")); }

  private privatePageEnd(rows: DisplayMessage[]): number {
    const index = this.privateEndId ? rows.findIndex(row => row.id === this.privateEndId) : -1;
    return index >= 0 ? index + 1 : rows.length;
  }
  private pagePrivate(direction: number): void {
    if (this.privatePaging) return;
    const current=this.allPrivateMessages();
    if (direction<0 && this.privatePageEnd(current)<=this.privateVisible && this.contact && this.history.hasOlderPrivate(this.contact)) {
      const owner=historyOwner(this.snapshot!), peer=this.contact;
      this.privatePaging=true;
      if (!this.privateEndId) this.privateEndId=current.at(-1)?.id || null;
      void this.history.loadPrivate(peer,true).then(()=> {
        if (this.snapshot && owner===historyOwner(this.snapshot) && peer===this.contact) { this.privatePaging=false; this.movePrivatePage(direction); }
      }).catch(()=>this.localNotice(t('history.error'))).finally(()=>{ if (this.snapshot && owner===historyOwner(this.snapshot) && peer===this.contact) this.privatePaging=false; });
      return;
    }
    this.movePrivatePage(direction);
  }
  private movePrivatePage(direction: number): void {
    const rows = this.allPrivateMessages();
    const end = Math.min(rows.length, Math.max(Math.min(this.privateVisible, rows.length), this.privatePageEnd(rows) + direction * this.privateVisible));
    this.privateEndId = end === rows.length ? null : rows[end - 1]?.id || null;
    this.updateBeepLog();
  }
  private updatePrivatePaging(paging: Element | null): void {
    if (!paging) return;
    const rows = this.allPrivateMessages(), end = this.privatePageEnd(rows);
    const more=!!this.contact && this.history.hasOlderPrivate(this.contact);
    (paging as HTMLElement).hidden = rows.length <= this.privateVisible && !more;
    const older = paging.querySelector<HTMLButtonElement>('[data-history="older"]'), newer = paging.querySelector<HTMLButtonElement>('[data-history="newer"]');
    if (older) older.disabled = end <= this.privateVisible && !more;
    if (newer) newer.disabled = end >= rows.length;
  }

  private fillBeepLog(log: HTMLElement): void {
    const scrollTop = log.scrollTop;
    const follow = log.scrollHeight - log.clientHeight - scrollTop < 60;
    this.syncPrivateRows(log, this.privateMessages(), t("m052"));
    log.scrollTop = follow ? log.scrollHeight : scrollTop;
  }

  private privateMessages(): DisplayMessage[] {
    const rows = this.allPrivateMessages(), end = this.privatePageEnd(rows);
    return rows.slice(Math.max(0, end - this.privateVisible), end);
  }
  private allPrivateMessages(): DisplayMessage[] {
    return this.privateMessagesView.get(this.snapshot!,this.history.messages,this.contact);
  }

  private syncPrivateRows(log: HTMLElement, messages: DisplayMessage[], empty: string): void {
    const ids = new Set(messages.map(message => message.id));
    for (const node of Array.from(log.children)) if (!ids.has((node as HTMLElement).dataset.messageId || "")) { this.mediaConsent.dispose(node as HTMLElement); node.remove(); }
    const existing = new Map(Array.from(log.children).map(node => [(node as HTMLElement).dataset.messageId, node]));
    let cursor: ChildNode | null = log.firstChild;
    for (const message of messages) {
      let node = existing.get(message.id);
      const prior=node ? this.privateRendered.get(node) : undefined;
      if (node && prior && (prior.text!==message.text || prior.senderName!==message.senderName || prior.labelColor!==message.labelColor)) {
        const replacement=this.messageNode(message);
        this.mediaConsent.dispose(node as HTMLElement);
        if (node===cursor) cursor=replacement;
        node.replaceWith(replacement); node=replacement;
      }
      node ??= this.messageNode(message);
      this.privateRendered.set(node,message);
      const element = node as HTMLElement;
      element.classList.toggle("private-outgoing", message.sender === this.snapshot!.player?.MemberNumber);
      element.classList.toggle("private-incoming", message.sender !== this.snapshot!.player?.MemberNumber);
      if (!element.querySelector(".private-channel-label")) element.querySelector(".message-meta")?.prepend(this.el("span", "private-channel-label", message.type === "Whisper" ? t("m029") : t("m028")));
      if (node !== cursor) log.insertBefore(node, cursor);
      cursor = node.nextSibling;
    }
    if (!messages.length) log.append(this.el("p", "empty-state", empty));
  }

  private buildSettings(): HTMLElement {
    const section = this.el("section", "settings-view");
    section.append(this.el("p", "eyebrow", t("m055")), this.el("h1", "", t("m056")));
    const panel = this.el("div", "settings-card");
    panel.append(this.el("h2", "", t("settings.appearance")));
    const theme = this.select(t("settings.theme"), (["default", "midnight", "forest"] as const).map(value => [value, t(`theme.${value}`)]), this.settings.theme);
    theme.id = "ThemeSelect";
    theme.addEventListener("change", () => { this.settings.theme = theme.value; this.applySettings(); try { localStorage.setItem("bc-lite-display-v1", JSON.stringify(this.settings)); } catch { this.localNotice(t("m060")); } });
    panel.append(this.field(t("settings.theme"), theme));
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
    privacy.append(forget, this.el("p", "muted", t("m064")), this.el("p", "muted", t("privacy.lastRoom")));
    const compatibility = this.el("div", "settings-card");
    compatibility.append(this.el("h2", "", t("m065")), this.el("p", "", t("m066", [this.snapshot!.player?.Appearance?.length ?? t("m067")])), this.el("p", "muted", t("m068")));
    compatibility.append(this.el("p", "muted", t("m069")));
    const disconnect = this.button(t("m070"), "ghost danger", "button");
    disconnect.addEventListener("click", () => { if (window.confirm(t("m071"))) this.client.disconnect(); });
    const jumps = this.el("nav", "settings-jumps"); jumps.setAttribute("aria-label", t("settings.jump"));
    const groups: Array<[string, string, HTMLElement[]]> = [
      ["appearance", t("settings.appearance"), [panel]],
      ["function", t("settings.function"), [this.buildSummonSettings(), compatibility]],
      ["performance", t("settings.performance"), [this.buildPerformanceSettings(), this.stability.build(() => this.client.connectionDiagnostics(), () => this.client.resumeConnection())]],
      ["storage", t("settings.storage"), [this.buildHistorySettings()]],
      ["privacy", t("settings.privacy"), [privacy, this.mediaConsent.buildSettings()]],
    ];
    section.append(jumps);
    for (const [id, label, panels] of groups) {
      const anchor = this.el("a", "button ghost", label) as HTMLAnchorElement; anchor.href = `#settings-${id}`; jumps.append(anchor);
      const group = this.el("section", "settings-group"); group.id = `settings-${id}`; group.append(this.el("h2", "", label), ...panels); section.append(group);
    }
    section.append(disconnect);
    return section;
  }

  private buildHistorySettings(): HTMLElement {
    return buildHistorySettings({history:this.history, owner:()=>this.snapshot ? historyOwner(this.snapshot) : '', hasError:()=>this.historyError, notice:message=>this.localNotice(message)});
  }
  private run(action: () => void): void { try { action(); } catch (error) { this.localNotice(error instanceof Error ? error.message : t("m072")); } }

  private buildPerformanceSettings(): HTMLElement {
    const panel = this.el("section", "settings-card performance-settings");
    panel.append(this.el("h2", "", t("performance.title")), this.el("p", "muted", t("performance.help")));
    const history = this.select(t("performance.history"), [600, 1500, 3000].map(n => [String(n), String(n)]), String(this.performance.history)); history.id = "HistoryLimit";
    const visible = this.select(t("performance.visible"), [50, 100, 200].map(n => [String(n), String(n)]), String(this.performance.visible)); visible.id = "VisibleLimit";
    const save = () => { try { localStorage.setItem("bc-lite-performance-v1", JSON.stringify(this.performance)); } catch { this.localNotice(t("m060")); } };
    history.addEventListener("change", () => {
      const value = Number(history.value);
      if (![600, 1500, 3000].includes(value)) return;
      if (value < this.snapshot!.messages.length && !window.confirm(t("performance.trim"))) { history.value = String(this.performance.history); return; }
      this.performance.history = value; this.historyEndId = null;
      this.client.setMessageLimit(value); save();
    });
    visible.addEventListener("change", () => {
      const value = Number(visible.value); if (![50, 100, 200].includes(value)) return;
      this.performance.visible = value; this.visibleMessages = value; this.historyEndId = null; save();
    });
    panel.append(this.field(t("performance.history"), history), this.field(t("performance.visible"), visible)); return panel;
  }

  private updateSummon(): void { const node = document.getElementById("summon-notice"); if (node) this.fillSummon(node); }
  private fillSummon(node: HTMLElement): void {
    node.replaceChildren(); const summon = this.snapshot?.summon; node.hidden = !summon;
    if (!summon) return;
    node.append(this.el("span", "", t("summon.received", [summon.sender, `${summon.room} (${summon.space || "Mixed"})`])));
    const accept = this.button(t("summon.accept"), "secondary", "button"); accept.addEventListener("click", () => this.run(() => this.client.acceptSummon()));
    const cancel = this.button(t("summon.cancel"), "ghost", "button"); cancel.addEventListener("click", () => this.client.dismissSummon()); node.append(accept, cancel);
  }
  private buildSummonSettings(): HTMLElement {
    const panel = this.el("section", "settings-card");
    panel.append(this.el("h2", "", t("summon.title")), this.el("p", "", t("summon.help")), this.checkbox(t("summon.enabled"), this.summonConfig.enabled, value => { this.summonConfig.enabled = value; if (!value) this.client.configureSummons(false, [], this.summonConfig.text || "summon"); }));
    const members = this.input("SummonMembers", t("summon.members"), "text", this.summonConfig.members);
    const text = this.input("SummonText", t("summon.text"), "text", this.summonConfig.text);
    members.addEventListener("input", () => { this.summonConfig.members = members.value; }); text.addEventListener("input", () => { this.summonConfig.text = text.value; });
    const save = this.button(t("summon.save"), "secondary", "button");
    save.addEventListener("click", () => this.run(() => {
      const ids = members.value.trim() ? members.value.trim().split(/[\s,，]+/).map(value => /^\d+$/.test(value) ? Number(value) : NaN) : [];
      this.client.configureSummons(this.summonConfig.enabled, ids, text.value);
    }));
    panel.append(this.field(t("summon.members"), members), this.field(t("summon.text"), text), save); return panel;
  }

  private searchRooms(all = false): void {
    if (all) {
      this.query = "";
      const input = document.getElementById("RoomQuery") as HTMLInputElement | null;
      if (input) input.value = "";
    }
    this.notice = ""; this.roomPage = 0;
    try { this.client.search({ Query: this.query, Language: this.language, Space: this.space, Game: "", FullRooms: this.showFull, ShowLocked: this.showLocked, SearchDescs: this.searchDescriptions }); }
    catch (error) { this.localNotice(error instanceof Error ? error.message : t("m099")); }
  }

  private joinRoom(name: string): void {
    if (name === this.snapshot!.room?.Name) { this.tab = "chat"; this.render(); return; }
    if (this.snapshot!.room) {
      if (!window.confirm(t("m073", [this.snapshot!.room.Name, name]))) return;
      this.client.leave();
    }
    this.run(() => this.client.join(name));
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
      cancel.addEventListener("click", () => this.client.disconnect());
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
      try { await this.client.login(this.accountName, secret); } catch (error) { this.notice = error instanceof Error ? error.message : t("m084"); this.render(); }
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
    query.setAttribute("aria-label", t("m094"));
    query.addEventListener("focus", () => { form.classList.add("search-expanded"); if (isMobileLayout()) { filters.open = false; for (const picker of form.querySelectorAll<HTMLDetailsElement>(".mobile-picker")) picker.open = false; } });
    form.addEventListener("focusout", event => { const next = event.relatedTarget as HTMLElement | null; if (!next?.closest?.(".room-query, .room-search")) form.classList.remove("search-expanded"); });
    query.addEventListener("input", () => { this.query = query.value; });
    const language = this.select(t("m089"), [["", t("m020")], ["EN", "EN"], ["CN", "CN"], ["DE", "DE"], ["FR", "FR"], ["ES", "ES"], ["RU", "RU"], ["UA", "UA"]], this.language);
    language.addEventListener("change", () => { this.language = language.value as RoomSearchRequest["Language"]; this.searchRooms(); });
    const space = this.select(t("m090"), [["X", t("m091")], ["", t("m092")], ["M", t("m093")]], this.space);
    space.addEventListener("change", () => { this.space = space.value as RoomSearchRequest["Space"]; this.searchRooms(true); });
    const queryField = this.field(t("m094"), query); queryField.classList.add("room-query");
    const languageField = this.el("div", "field room-language"); languageField.append(this.el("span", "field-label", t("m089")), iconSelect(language, roomLanguageIcons, "translate", true));
    const spaceField = this.el("div", "field room-space"); spaceField.append(this.el("span", "field-label", t("m090")), iconSelect(space, {X:"mixed", M:"male", "":"female"}, "mixed", true));
    const options = this.el("div", "search-options");
    options.append(
      this.checkbox(t("m095"), this.showFull, (value) => { this.showFull = value; }),
      this.checkbox(t("m096"), this.showLocked, (value) => { this.showLocked = value; }),
      this.checkbox(t("m097"), this.searchDescriptions, (value) => { this.searchDescriptions = value; }),
    );
    const search = this.button(t("m098"), "primary", "submit");
    search.classList.add("room-search"); search.setAttribute("aria-label", t("m098"));
    search.replaceChildren(icon("search"), this.el("span", "control-text", t("m098")));
    const filters = this.el("details", "room-filters") as HTMLDetailsElement;
    filters.open = !isMobileLayout();
    const filterToggle = this.el("summary"); filterToggle.setAttribute("aria-label", t("rooms.filters"));
    filterToggle.append(icon("faders"), this.el("span", "control-text", t("rooms.filters")));
    filters.append(filterToggle, options);
    form.append(queryField, search, spaceField, languageField, filters);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.searchRooms();
    });

    const resultHeader = this.el("div", "result-header");
    resultHeader.append(this.el("span", "result-count", t("m101", [state.rooms.length])));
    const sort = this.select(t("rooms.sort"), [["friends", t("rooms.sortFriends")], ["name", t("rooms.sortName")], ["count", t("rooms.sortCount")]], this.roomSort);
    sort.addEventListener("change", () => { this.roomSort = sort.value as RoomSort; this.roomPage = 0; this.render(); });
    const rooms = this.el("div", "room-list");
    const pageSize = isMobileLayout() ? 8 : 24;
    const ordered = sortRooms(state.rooms, this.roomSort, getLocale());
    const pages = Math.max(1, Math.ceil(ordered.length / pageSize));
    this.roomPage = Math.min(this.roomPage, pages - 1);
    const pager = this.el("nav", "room-pagination"); pager.setAttribute("aria-label", t("rooms.pagination"));
    const turn = (delta: number) => {
      const next = Math.max(0, Math.min(pages - 1, this.roomPage + delta));
      if (next !== this.roomPage) { this.roomPage = next; drawPage(); }
    };
    const drawPage = () => {
      rooms.replaceChildren(); pager.replaceChildren();
      if (!ordered.length) rooms.append(this.el("div", "empty-state", t("m102")));
      else ordered.slice(this.roomPage * pageSize, (this.roomPage + 1) * pageSize).forEach(room => rooms.append(this.roomCard(room)));
      const previous = this.button("‹", "ghost", "button"); previous.setAttribute("aria-label", t("rooms.previous")); previous.disabled = this.roomPage === 0;
      const next = this.button("›", "ghost", "button"); next.setAttribute("aria-label", t("rooms.next")); next.disabled = this.roomPage === pages - 1;
      previous.addEventListener("click", () => turn(-1)); next.addEventListener("click", () => turn(1));
      const status = this.el("span", "", `${this.roomPage + 1} / ${pages}`); status.setAttribute("aria-live", "polite");
      pager.append(previous, status, next);
    };
    drawPage(); bindPageSwipe(rooms, turn); resultHeader.append(pager, sort);
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
    create.append(this.field(t("m113"), roomName), this.field(t("m114"), description), this.field(t("m106"), limit));
    const createLanguage = this.select(t("m115"), [["EN", "EN"], ["CN", "CN"], ["DE", "DE"], ["FR", "FR"], ["ES", "ES"], ["RU", "RU"], ["UA", "UA"]], this.language || "EN");
    createLanguage.addEventListener("change", () => { this.language = createLanguage.value as RoomSearchRequest["Language"]; });
    const createSpace = this.select(t("m116"), [["X", t("m117")], ["", t("m118")], ["M", t("m119")]], this.space);
    createSpace.addEventListener("change", () => { this.space = createSpace.value as RoomSearchRequest["Space"]; });
    create.append(this.field(t("m089"), iconSelect(createLanguage, roomLanguageIcons, "translate", true)), this.field(t("m090"), iconSelect(createSpace, {X:"mixed", M:"male", "":"female"}, "mixed", true)), this.buildRoomOptions());
    if (state.room) create.append(this.el("p", "muted", t("m120")));
    create.append(createButton);
    create.addEventListener("submit", event => {
      event.preventDefault();
      this.notice = "";
      try { this.client.createRoom(this.newRoomName, this.space, this.language, this.unlisted, this.newRoomDescription, this.newRoomLimit, this.roomOptions()); }
      catch (error) { this.localNotice(error instanceof Error ? error.message : t("m121")); }
    });
    section.append(heading);
    if (this.roomMode === "search") section.append(form, resultHeader, rooms);
    else section.append(create);
    return section;
  }

  private roomLovers(room: RoomSearchResult) {
    return afcLovers(this.snapshot!.player).filter(lover => room.Friends?.some(friend => friend.MemberNumber === lover.memberNumber) || (this.snapshot!.loverRooms?.[lover.memberNumber]?.name === room.Name && this.snapshot!.loverRooms?.[lover.memberNumber]?.space === room.Space));
  }

  private roomCard(room: RoomSearchResult): HTMLElement {
    const card = this.el("article", "room-card");
    card.dataset.roomName = room.Name; card.dataset.roomSpace = room.Space;
    const top = this.el("div", "room-card-top");
    const meta = this.el("div", "room-tags");
    const languageTag = this.el("span", "tag room-language-tag", room.Language || "—");
    languageTag.prepend(icon(roomLanguageIcons[room.Language?.toUpperCase()] || "translate"));
    meta.append(languageTag, this.el("span", "tag", `${room.MemberCount}/${room.MemberLimit}`));
    const restricted = room.Access && !room.Access.includes("All");
    if (!room.CanJoin || restricted) {
      const access = this.el("span", "tag locked", room.CanJoin ? "🗝️" : "🔒");
      access.title = t(room.CanJoin ? "rooms.allowed" : "m130"); access.setAttribute("aria-label", access.title); meta.append(access);
    }
    if (room.Friends?.length) { const friends = this.el("span", "tag friend-tag", t("m123", [room.Friends.length])); friends.title = room.Friends.map(friend => `#${friend.MemberNumber}`).join("、"); meta.append(friends); }
    const lovers = this.roomLovers(room);
    if (lovers.length) { const badge = this.el("span", "tag afc-tag", t("afc.inRoom", [lovers.length])); badge.title = lovers.map(lover => `${lover.name} #${lover.memberNumber}`).join("、"); meta.append(badge); }
    if (room.Visibility && !room.Visibility.includes("All")) meta.append(this.el("span", "tag", t("m124")));
    if (room.MemberCount >= room.MemberLimit) meta.append(this.el("span", "tag", t("m125")));
    if (room.Game) meta.append(this.el("span", "tag", room.Game));
    if (room.MapType && room.MapType !== "Never") { const map = this.el("span", "tag", "🗺️"); map.title = t("m126", [room.MapType]); map.setAttribute("aria-label", map.title); meta.append(map); }
    top.append(this.el("h3", "", room.Name), meta);
    card.append(top, this.el("p", "room-description", room.Description || t("m127")), this.el("p", "room-creator", t("m128", [room.Creator || `#${room.CreatorMemberNumber}`])));
    const available = canJoinRoom(room);
    card.classList.toggle("unavailable", !available);
    const join = this.button(available ? t("m129") : t("m130"), available ? "secondary" : "ghost", "button");
    join.disabled = !available || this.snapshot!.phase === "joining";
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
    roomInfo.querySelector('.eyebrow')?.prepend(icon(roomLanguageIcons[state.room!.Language?.toUpperCase()] || 'translate'));
    const leave = this.button(t("m157"), "ghost danger", "button");
    leave.addEventListener("click", () => this.client.leave());
    roomInfo.append(leave);
    sidebar.append(roomInfo, this.el("h2", "member-title", t("m158", [state.characters.length])));
    const members = this.el("div", "member-list");
    [...state.characters].sort((a, b) => Number(b.MemberNumber === state.player?.MemberNumber) - Number(a.MemberNumber === state.player?.MemberNumber)).forEach((character) => {
      const member = this.el("button", "member-row") as HTMLButtonElement;
      member.type = "button";
      member.append(this.el("span", "member-avatar", (character.Nickname || character.Name || "?").slice(0, 1).toUpperCase()), this.el("span", "member-name", character.Nickname || character.Name), this.el("span", "member-number", `#${character.MemberNumber}`));
      member.title = t("m159");
      if (character.MemberNumber === state.cuddlePartner) member.append(this.el("span", "member-cuddle", t("cuddle.badge")));
      (member.querySelector(".member-name") as HTMLElement).style.color = nameColor(character.LabelColor, character.MemberNumber);
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
      const all = this.snapshot!.messages;
      const first = this.visibleHistory()[0];
      const end = Math.max(Math.min(this.visibleMessages, all.length), all.findIndex(message => message.id === first?.id));
      this.historyEndId = all[end - 1]?.id || null; this.render();
      document.getElementById("TextAreaChatLog")!.scrollTop = 0;
    });
    const jump = this.button(t("m163"), "secondary", "button"); jump.id = "new-messages"; jump.hidden = !this.historyEndId;
    jump.addEventListener("click", () => { this.historyEndId = null; this.updateChatLog(true); });
    topMenu.append(toggle, history, jump);
    const clear = this.button(t("chat.clear"), "ghost clear-messages", "button");
    clear.addEventListener("click", () => { if (window.confirm(t("chat.clearConfirm"))) { this.replyTarget = null; this.historyEndId = null; void this.history.clearRoom().catch(() => this.localNotice(t("history.error"))); this.client.clearMessages(); document.getElementById("chat-room-reply-indicator")?.replaceChildren(); this.updateChatLog(true); } });
    topMenu.append(clear);
    const mobileLeave = this.button(t("m164"), "ghost", "button");
    mobileLeave.addEventListener("click", () => this.client.leave());
    topMenu.append(mobileLeave);
    const struggle = this.el("div", "chat-room-struggle-bar"); struggle.id = "chat-room-struggle-bar";
    const log = this.el("div", "text-area-chat-log"); log.id = "TextAreaChatLog"; log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite");
    log.dataset.room = state.room!.Name;
    log.dataset.latest = state.messages.at(-1)?.id || "";
    this.visibleHistory().forEach((message) => log.append(this.messageNode(message)));
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
      if (!this.chatDraft.trim()) return;
      try { this.client.sendChat(this.replyContent(this.chatDraft), this.replyTarget?.nativeId); this.replyTarget = null; reply.replaceChildren(); this.chatDraft = ""; input.value = ""; length.textContent = "0/1000"; }
      catch (error) { this.localNotice(error instanceof Error ? error.message : t("m167")); }
    });
    if (this.replyTarget) reply.append(this.replyIndicator());
    bot.prepend(reply);
    chat.append(topMenu, struggle, log, bot);
    layout.append(sidebar, chat);
    return layout;
  }

  private selectMessage(row: HTMLElement | null): void {
    document.querySelectorAll(".chat-message.message-selected").forEach(selected => {
      if (selected !== row) selected.classList.remove("message-selected");
    });
    row?.classList.add("message-selected");
  }

  private messageNode(message: DisplayMessage): HTMLElement {
    const row = this.el("div", `chat-message type-${message.type.toLowerCase()}`);
    row.dataset.messageId = message.id;
    row.tabIndex = 0;
    if (message.presence) row.classList.add("message-presence");
    if (message.replyId) {
      const original = [...this.snapshot!.messages, ...(this.snapshot!.whispers || []), ...(message.type === "Whisper" ? this.history.messages.map(row => row.message) : [])].find(item => item.nativeId === message.replyId && (item.type !== "Whisper" || (message.type === "Whisper" && new Set([item.sender, item.target]).size === 2 && [message.sender, message.target].every(id => id === item.sender || id === item.target))));
      const preview = this.button(original ? t("reply.preview", [original.senderName, original.text.slice(0, 160)]) : t("reply.unavailable"), "ghost reply-preview reply-jump", "button");
      preview.disabled = !original;
      if (original) preview.addEventListener("click", () => this.jumpToMessage(original));
      row.append(preview);
    }
    const content = this.el("span", "message-content");
    const meta = this.el("span", "message-meta");
    const name = ((message.type === "Beep" || message.type === "Whisper") && message.sender && message.sender !== this.snapshot!.player?.MemberNumber ? contactName(this.snapshot!, message.sender, message.senderName) : message.senderName).replace(/\s+#\d+$/, "");
    if (message.sender && !message.presence) {
      const author = this.button(name, "message-author", "button");
      const character = this.snapshot!.characters.find(c => c.MemberNumber === message.sender) || (this.snapshot!.player?.MemberNumber === message.sender ? this.snapshot!.player : undefined);
      author.style.color = nameColor(message.labelColor || character?.LabelColor, message.sender);
      author.addEventListener("click", () => this.composeWhisper(message.sender!)); content.append(author);
    }
    if (message.type === "Whisper" || message.type === "Beep") content.append(this.el("span", "message-target", ` → ${message.targetName?.replace(/\s+#\d+$/, "") || "#" + message.target} `));
    if (message.type === "Chat" || message.type === "Whisper" || message.type === "Beep") content.append(document.createTextNode(": "));
    else content.append(document.createTextNode(" "));
    content.append(this.chatText("span", "message-text", message.text));
    if (message.text.startsWith("(") && ["Chat", "Whisper", "Beep"].includes(message.type)) row.classList.add("is-ooc");
    meta.append(this.el("time", "message-time", message.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
    if (message.sender) meta.append(this.el("span", "message-id", "#" + message.sender));
    row.append(content, meta);
    if (this.canReply(message)) {
      const reply = this.button(t("reply.button"), "ghost message-reply", "button");
      reply.addEventListener("click", () => this.selectReply(message)); meta.append(reply);
    }
    return row;
  }

  private canReply(message: DisplayMessage): boolean {
    return !message.presence && ["Chat", "Emote", "Whisper", "Beep"].includes(message.type);
  }

  private selectReply(message: DisplayMessage): void {
    if (!this.canReply(message)) return;
    const privateMessage = message.type === "Whisper" || message.type === "Beep";
    if (privateMessage) {
      const peer = message.sender === this.snapshot!.player?.MemberNumber ? message.target! : message.sender!;
      this.openConversation(peer, message.type === "Whisper" ? "whisper" : "beep");
    } else this.tab = "chat";
    this.replyTarget = message;
    this.render(); document.getElementById(privateMessage ? "BeepText" : "InputChat")?.focus();
  }

  private composeWhisper(id: number): void {
    if (id === this.snapshot!.player?.MemberNumber || !this.snapshot!.characters.some(character => character.MemberNumber === id)) { this.localNotice(t("m032")); return; }
    this.replyTarget = null;
    this.chatDraft = `/W ${id} ${this.chatDraft.replace(/^\/w(?:hisper)?\s+\d+\s*/i, "")}`;
    this.tab = "chat"; this.render();
    const input = document.getElementById("InputChat") as HTMLTextAreaElement | null;
    input?.focus(); input?.setSelectionRange(input.value.length, input.value.length);
  }

  private replyIndicator(): HTMLElement {
    const panel = this.el("div", "reply-preview", t("reply.preview", [this.replyTarget?.senderName, this.replyTarget?.text.slice(0, 120)]));
    const cancel = this.button(t("safety.cancel"), "ghost", "button"); cancel.addEventListener("click", () => { this.replyTarget = null; this.render(); }); panel.append(cancel); return panel;
  }

  private replyContent(text: string): string {
    if (!this.replyTarget || (this.replyTarget.nativeId && this.replyTarget.type !== "Beep" && !(this.tab === "private" && this.privateMode === "beep"))) return text;
    const quote = `> ${this.replyTarget.senderName}: ${this.replyTarget.text.slice(0, 160)}\n`;
    // Keep explicitly selected channels outside the quote, especially /W.
    const prefix = this.tab === "chat" ? text.match(/^(\/w(?:hisper)?\s+\d+\s+|\/me\s+|\.a\s+|\*)/i)?.[0] || "" : "";
    return prefix + quote + text.slice(prefix.length);
  }

  private jumpToMessage(message: DisplayMessage): void {
    if (message.type === "Whisper") {
      const peer = message.sender === this.snapshot!.player?.MemberNumber ? message.target! : message.sender!;
      if (this.tab !== "private" || this.contact !== peer || this.privateMode !== "whisper") this.openConversation(peer, "whisper");
      const rows = this.allPrivateMessages(), index = rows.findIndex(row => row.id === message.id);
      if (index < 0) { this.localNotice(t("reply.unavailable")); return; }
      const end = Math.min(rows.length, index + this.privateVisible);
      this.privateEndId = end === rows.length ? null : rows[end - 1].id; this.updateBeepLog();
    } else {
      const index = this.snapshot!.messages.findIndex(value => value.id === message.id);
      if (index < 0) { this.localNotice(t("reply.unavailable")); return; }
      this.tab = "chat";
      const end = Math.min(this.snapshot!.messages.length, index + this.visibleMessages);
      this.historyEndId = end === this.snapshot!.messages.length ? null : this.snapshot!.messages[end - 1].id;
      this.render();
    }
    const log = document.getElementById(message.type === "Whisper" ? "beep-log" : "TextAreaChatLog");
    const node = Array.from(log?.querySelectorAll<HTMLElement>("[data-message-id]") || []).find(node => node.dataset.messageId === message.id);
    if (!node) { this.localNotice(t("reply.unavailable")); return; }
    node.scrollIntoView?.({ block: "center" }); node.focus({ preventScroll: true }); this.selectMessage(node);
  }

  private showCuddleRequest(): void {
    document.querySelector(".cuddle-request")?.remove();
    const request = this.snapshot?.cuddleRequest;
    if (!request) return;
    this.showCuddleConfirmation(request.sender, t("cuddle.request", [request.sender]), token => this.client.respondCuddle(true, token), () => this.client.respondCuddle(false), "cuddle-request");
  }

  private showCuddleConfirmation(member: number, title: string, confirm: (token: string) => void, cancel = () => {}, className = "cuddle-confirm"): void {
    const dialog = this.el("dialog", `profile-dialog ${className}`);
    dialog.setAttribute("aria-label", title);
    const details = this.el("p", "cuddle-details");
    const status = this.el("p", "notice"); status.setAttribute("role", "alert");
    const accept = this.button(t("cuddle.accept"), "primary", "button");
    const reject = this.button(t("safety.cancel"), "ghost", "button");
    const close = this.button("×", "ghost dialog-close", "button"); close.setAttribute("aria-label", t("m173"));
    let token: string | undefined;
    const refresh = () => {
      try { const info = this.client.cuddleInfo(member); details.textContent = info.text; token = info.token; accept.disabled = false; }
      catch (error) { token = undefined; accept.disabled = true; status.textContent = error instanceof Error ? error.message : String(error); }
    };
    const dismiss = () => { dialog.close(); dialog.remove(); cancel(); };
    accept.addEventListener("click", () => {
      if (!token) return;
      try { confirm(token); dialog.close(); dialog.remove(); }
      catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
        // A stale approval never applies automatically: show fresh slots and require another click.
        refresh();
      }
    });
    reject.addEventListener("click", dismiss); close.addEventListener("click", dismiss);
    dialog.addEventListener("cancel", event => { event.preventDefault(); dismiss(); });
    dialog.addEventListener("close", () => dialog.remove());
    const actions = this.el("div", "toolbar"); actions.append(accept, reject);
    dialog.append(close, this.el("h2", "", title), details, status, actions);
    refresh(); document.body.append(dialog); dialog.showModal();
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
        try { this.client.activateSafeword(mode); dialog.close(); dialog.remove(); }
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
    appendChatLinks(node, text, this.mediaConsent);
    return node;
  }

  private showMember(character: CharacterSummary): void {
    const dialog = this.el("dialog", "profile-dialog");
    dialog.append(this.el("h2", "", `${character.Nickname || character.Name} #${character.MemberNumber}`));
    const relationName = (value: { Name?: string; MemberNumber?: number }) => `${value.Name || t("relation.present")}${value.MemberNumber ? ` (#${value.MemberNumber})` : ""}`;
    const lovers = afcLovers(character);
    dialog.append(this.el("p", "", t("m169", [character.Ownership?.MemberNumber || character.Ownership?.Name ? relationName(character.Ownership!) : character.Owner || t("m170")])), this.el("p", "", t("m171", [character.Lovership?.length ? character.Lovership.map(relationName).join("、") : lovers.length ? t("relation.present") : t("m170")])));
    if (lovers.length) {
      dialog.append(this.el("h3", "", t("afc.title")));
      for (const lover of lovers) {
        const room = this.snapshot!.friends.find(friend => friend.MemberNumber === lover.memberNumber)?.ChatRoomName || this.snapshot!.loverRooms?.[lover.memberNumber]?.name;
        const row = this.el("p", "", `${lover.name || t("relation.present")} #${lover.memberNumber}${room ? ` · ${room}` : ""}`);
        dialog.append(row);
      }
    }
    const bio = this.el("details", "profile-bio");
    bio.append(this.el("summary", "", t("m172")));
    bio.addEventListener("toggle", () => { if (bio.open && bio.childElementCount === 1) bio.append(this.el("p", "profile-description", decodeBiography(character.Description))); });
    dialog.append(bio);
    const actions = this.el("div", "toolbar");
    const close = this.button("×", "ghost dialog-close", "button");
    close.setAttribute("aria-label", t("m173"));
    const dismiss = () => { dialog.close(); dialog.remove(); };
    close.addEventListener("click", dismiss);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.append(close);
    if (character.MemberNumber !== this.snapshot!.player?.MemberNumber) {
      const whisper = this.button(t("m174"), "secondary", "button");
      whisper.addEventListener("click", () => {
        dismiss(); this.membersOpen = false; this.openConversation(character.MemberNumber, "whisper");
      });
      const friend = this.button(t("m176"), "ghost", "button");
      friend.addEventListener("click", () => this.run(() => this.client.setFriend(character.MemberNumber, true)));
      const beep = this.button(t("m177"), "ghost", "button");
      beep.addEventListener("click", () => { dismiss(); this.openConversation(character.MemberNumber); });
      actions.append(whisper, friend, beep);
    }
    if (this.snapshot!.characters.some(item => item.MemberNumber === character.MemberNumber)) {
      const interact = this.button(t("interaction.title"), "secondary interaction-open", "button");
      interact.addEventListener("click", () => {
        dismiss();
        const activityDialog = openActivityDialog(character.Nickname || character.Name, compatibility => this.client.activityOptions(character.MemberNumber, compatibility), (group, name, compatibility) => {
          if (name.startsWith("cuddle:") && name !== "cuddle:stop") {
            this.showCuddleConfirmation(character.MemberNumber, `${t("cuddle.item")} · ${character.Nickname || character.Name}`, token => {
              this.client.sendActivity(character.MemberNumber, group, name, compatibility, token);
              const status = activityDialog.querySelector<HTMLElement>('[role="status"]');
              if (status) status.textContent = t("interaction.sent");
            });
            return false;
          }
          this.client.sendActivity(character.MemberNumber, group, name, compatibility);
        });
      });
      actions.append(interact);
    }
    dialog.append(actions); document.body.append(dialog); dialog.showModal();
  }

  private buildFooter(): HTMLElement {
    const footer = this.el("footer", "app-footer");
    footer.append(this.el("span", "", "BC Lite · Social preview · Relay v1"), this.el("span", "", t("m178")));
    return footer;
  }

  private field = field;
  private input = input;
  private select = select;
  private checkbox = checkbox;
  private button = button;
  private el = el;
  private localNotice(message: string): void { this.notice = message; window.alert(message); }
}

if (!document.documentElement.hasAttribute("data-ui-preview")) new LiteApp();
