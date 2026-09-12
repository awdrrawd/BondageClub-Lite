import { t } from "../i18n";
import { showNotice } from "../platform/dialogs";
import { resolveMedia, type MediaTarget } from "./providers";

export class MediaConsent {
  private acv = true;
  private session = new Set<string>();
  private remembered = new Set<string>();
  private readonly key = "bc-lite-media-origins-v1";
  private document: Document;
  constructor(document: Document) {
    this.document = document;
    try { this.acv = document.defaultView!.localStorage.getItem('bc-lite-acv-v1') !== 'false'; } catch { /* Optional display preference. */ }
    try {
      const values = JSON.parse(document.defaultView!.localStorage.getItem(this.key) || "[]");
      if (Array.isArray(values)) for (const value of values.slice(0, 200)) {
        try { const url = new URL(value); if (url.protocol === "https:" && value === url.origin) this.remembered.add(value); } catch { /* Ignore invalid stored origins. */ }
      }
    } catch { /* Optional local preferences. */ }
  }
  resetSession(): void { this.session.clear(); }
  dispose(root: HTMLElement): void { this.release(root); }
  private refresh(): void {
    this.document.querySelectorAll<HTMLElement>(".chat-media-slot").forEach(slot => this.render(slot));
  }
  slot(url: URL): HTMLElement {
    const slot = this.document.createElement("span"); slot.className = "chat-media-slot"; slot.dataset.url = url.href;
    this.render(slot); return slot;
  }
  private render(slot: HTMLElement): void {
    const url = new URL(slot.dataset.url!);
    const target = resolveMedia(url, this.document.location.hostname);
    this.release(slot);
    if (!target || (!this.acv && target.kind !== "image")) { slot.removeAttribute("data-playing"); slot.replaceChildren(); return; }
    const origin = new URL(target.src).origin;
    slot.removeAttribute("data-playing");
    slot.replaceChildren();
    if (target.kind === "frame") { this.playerButton(slot, target); return; }
    if (this.session.has(origin) || this.remembered.has(origin)) {
      if (target.kind !== "image") { this.playerButton(slot, target); return; }
      const media = this.document.createElement("img"); media.className = "chat-media";
      media.setAttribute("aria-label", url.href);
      media.alt = ""; media.loading = "lazy"; media.decoding = "async"; media.referrerPolicy = "no-referrer";
      media.addEventListener("error", () => media.remove(), { once: true });
      media.src = target.src; slot.append(media); return;
    }
    slot.append(this.document.createTextNode(t("media.prompt", [origin])));
    for (const permanent of [false, true]) {
      const button = this.document.createElement("button"); button.type = "button"; button.className = "button ghost";
      button.textContent = t(permanent ? "media.always" : "media.once");
      button.addEventListener("click", () => {
        if (permanent) {
          const next = new Set(this.remembered); next.add(origin);
          try { this.document.defaultView!.localStorage.setItem(this.key, JSON.stringify([...next])); this.remembered = next; }
          catch { showNotice(t("media.storageError"),this.document); return; }
        } else this.session.add(origin);
        this.refresh(); if (!slot.isConnected) this.render(slot);
      });
      slot.append(button);
    }
  }
  private release(slot: HTMLElement): void {
    for (const media of slot.querySelectorAll<HTMLMediaElement>("video,audio")) { media.pause(); media.removeAttribute("src"); media.load(); }
    for (const frame of slot.querySelectorAll("iframe")) frame.removeAttribute("src");
  }
  private playerButton(slot: HTMLElement, target: MediaTarget): void {
    const button = this.document.createElement("button"); button.className = "button media-play-button"; button.type = "button"; button.textContent = `▶ ${t("media.open", [target.label])}`;
    button.addEventListener("click", () => {
      if (!slot.isConnected || !this.acv || (target.kind !== "frame" && ![this.session,this.remembered].some(origins => origins.has(new URL(target.src).origin)))) return;
      // One active inline player, independent of provider. Close the old one before allocating another.
      for (const previous of this.document.querySelectorAll<HTMLElement>(".chat-media-slot[data-playing]")) { previous.removeAttribute("data-playing"); this.render(previous); }
      slot.replaceChildren(); slot.dataset.playing = "true";
      const media = this.document.createElement(target.kind === "frame" ? "iframe" : target.kind === "audio" ? "audio" : "video");
      media.className = "chat-media";
      if (media.tagName === "IFRAME") {
        const frame = media as HTMLIFrameElement;
        frame.title = target.label; frame.sandbox.add("allow-scripts", "allow-same-origin", "allow-presentation");
        frame.allow = "fullscreen; encrypted-media";
        frame.referrerPolicy = "strict-origin-when-cross-origin";
      } else {
        const player = media as HTMLMediaElement; player.controls = true; player.preload = "none";
        if (player.tagName === "VIDEO") (player as HTMLVideoElement).playsInline = true;
      }
      media.src = target.src;
      const close = this.document.createElement("button"); close.className = "button ghost"; close.type = "button"; close.textContent = t("media.close");
      close.addEventListener("click", () => { slot.removeAttribute("data-playing"); this.render(slot); });
      slot.append(media, close);
    });
    slot.append(button);
  }
  buildSettings(): HTMLElement {
    const panel = this.document.createElement("section"); panel.className = "settings-card";
    const toggle = this.document.createElement('label'); toggle.className = 'checkbox';
    const input = this.document.createElement('input'); input.type = 'checkbox'; input.id = 'ACVEnabled'; input.checked = this.acv;
    input.addEventListener('change', () => {
      try { this.document.defaultView!.localStorage.setItem('bc-lite-acv-v1',String(input.checked)); }
      catch { input.checked = this.acv; showNotice(t('media.storageError'),this.document); return; }
      this.acv = input.checked; this.refresh();
    });
    toggle.append(input, this.document.createTextNode(t('media.acv'))); panel.append(toggle);
    const acvNote = this.document.createElement('p'); acvNote.className = 'muted'; acvNote.textContent = t('media.acvHelp'); panel.append(acvNote);
    const supported = this.document.createElement('details'); supported.className = 'acv-supported';
    const summary = this.document.createElement('summary'); summary.textContent = t('media.supported'); supported.append(summary);
    const sites = this.document.createElement('p'); sites.textContent = 'YouTube · Bilibili · Douyin · Vimeo · Niconico · Facebook · Twitch · Streamable · Dailymotion · Pornhub · Instagram · Spotify · SoundCloud · Apple Music · NetEase Music';
    supported.append(sites); panel.append(supported);
    const title = this.document.createElement("h2"); title.textContent = t("media.manage"); panel.append(title);
    const note = this.document.createElement("p"); note.textContent = t("media.help"); panel.append(note);
    const list = this.document.createElement("div"); list.className="media-origin-groups"; panel.append(list);
    const render = () => {
      list.replaceChildren();
      const origins = [...new Set([...this.remembered, ...this.session])].sort();
      if (!origins.length) list.textContent = t("media.empty");
      const permanent=this.document.createElement('div'), temporary=this.document.createElement('div');
      permanent.className='media-origin-list';temporary.className='media-origin-list';
      for(const [box,label,show] of [[permanent,t('media.permanent'),origins.some(origin=>this.remembered.has(origin))],[temporary,t('media.once'),origins.some(origin=>!this.remembered.has(origin))]] as const){
        if(show){const heading=this.document.createElement('h3');heading.textContent=label;box.append(heading);list.append(box);}
      }
      for (const origin of origins) {
        const row = this.document.createElement("div"); row.className="media-origin-row";
        const address=this.document.createElement("span");address.className="media-origin-address";address.textContent=origin; row.append(address);

        const remove = this.document.createElement("button"); remove.type = "button"; remove.className = "button ghost media-origin-revoke"; remove.textContent = t("media.remove");
        remove.addEventListener("click", () => {
          const next = new Set(this.remembered); next.delete(origin);
          try { if (this.remembered.has(origin)) this.document.defaultView!.localStorage.setItem(this.key, JSON.stringify([...next])); }
          catch { showNotice(t("media.storageError"),this.document); return; }
          this.remembered = next; this.session.delete(origin); this.refresh(); render();
        }); row.append(remove); (this.remembered.has(origin)?permanent:temporary).append(row);
      }
    }; render(); return panel;
  }
}

/** Linkify text; media cannot receive a src before the user grants its exact origin. */
export function appendChatLinks(node: HTMLElement, text: string, consent?: MediaConsent): void {
  const document = node.ownerDocument;
  let cursor = 0;
  // Bare media URLs are common in ACV messages. Keep their displayed text intact.
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`\u0000-\u001f\u007f]+|(?<![\w@./:-])(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}\/[^\s<>"'`\u0000-\u001f\u007f]*/giu)) {
    let value = match[0].replace(/[.,!?:;，。！？；：、）】」』》*]+$/u, "");
    for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      while (value.endsWith(close) && value.split(close).length > value.split(open).length) value = value.slice(0, -1);
    }
    let url: URL;
    const explicit = /^https?:\/\//i.test(value);
    try { url = new URL(explicit ? value : `https://${value}`); } catch { continue; }
    if (!explicit && !resolveMedia(url, document.location.hostname)) continue;
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) continue;
    node.append(document.createTextNode(text.slice(cursor, match.index)));
    const anchor = document.createElement("a");
    anchor.href = url.href;
    let label = value;
    if (['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(url.hostname) && /^\/(video|bangumi\/play)\//.test(url.pathname)) {
      const display = new URL(url.href);
      // Keep episode/time selection visible; tracking parameters stay only in the href.
      for (const key of [...display.searchParams.keys()]) if (!['p', 't', 'start_progress'].includes(key)) display.searchParams.delete(key);
      label = explicit ? display.href : display.href.slice('https://'.length);
    }
    anchor.textContent = label.length > 90 ? `${label.slice(0, 70)}…${label.slice(-12)}` : label;
    anchor.title = url.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer nofollow";
    anchor.referrerPolicy = "no-referrer";
    anchor.className = "chat-link";
    node.append(anchor);
    if (url.protocol === "https:") {
      if (resolveMedia(url, document.location.hostname) && consent) node.append(consent.slot(url));
    }
    cursor = match.index + value.length;
  }
  node.append(document.createTextNode(text.slice(cursor)));
}
