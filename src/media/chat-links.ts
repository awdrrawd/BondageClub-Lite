import { t } from "../i18n";
import { showNotice } from "../platform/dialogs";
import { resolveMedia, type MediaTarget } from "./providers";

export class MediaConsent {
  private session = new Set<string>();
  private remembered = new Set<string>();
  private readonly key = "bc-lite-media-origins-v1";
  private document: Document;
  constructor(document: Document) {
    this.document = document;
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
    const target = resolveMedia(url);
    if (!target) { slot.replaceChildren(); return; }
    const origin = new URL(target.src).origin;
    this.release(slot);
    slot.removeAttribute("data-playing");
    slot.replaceChildren();
    if (this.session.has(origin) || this.remembered.has(origin)) {
      if (target.kind !== "image") { this.playerButton(slot, target); return; }
      const media = this.document.createElement("img"); media.className = "chat-media";
      media.setAttribute("aria-label", url.href);
      media.alt = ""; media.loading = "lazy"; media.decoding = "async"; media.referrerPolicy = "no-referrer";
      media.addEventListener("error", () => media.remove(), { once: true });
      media.src = url.href; slot.append(media); return;
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
    const button = this.document.createElement("button"); button.className = "button ghost"; button.type = "button"; button.textContent = t("media.open", [target.label]);
    button.addEventListener("click", () => {
      // One active inline player, independent of provider. Close the old one before allocating another.
      for (const previous of this.document.querySelectorAll<HTMLElement>(".chat-media-slot[data-playing]")) { previous.removeAttribute("data-playing"); this.render(previous); }
      slot.replaceChildren(); slot.dataset.playing = "true";
      const media = this.document.createElement(target.kind === "frame" ? "iframe" : target.kind === "audio" ? "audio" : "video");
      media.className = "chat-media";
      if (media.tagName === "IFRAME") {
        const frame = media as HTMLIFrameElement;
        frame.title = target.label; frame.sandbox.add("allow-scripts", "allow-same-origin", "allow-presentation");
        frame.allow = "fullscreen; encrypted-media"; frame.allowFullscreen = true;
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
    const title = this.document.createElement("h2"); title.textContent = t("media.manage"); panel.append(title);
    const note = this.document.createElement("p"); note.textContent = t("media.help"); panel.append(note);
    const list = this.document.createElement("div"); panel.append(list);
    const render = () => {
      list.replaceChildren();
      const origins = [...new Set([...this.remembered, ...this.session])].sort();
      if (!origins.length) list.textContent = t("media.empty");
      for (const origin of origins) {
        const row = this.document.createElement("div"); row.textContent = `${origin} · ${t(this.remembered.has(origin) ? "media.always" : "media.once")} `;
        const remove = this.document.createElement("button"); remove.type = "button"; remove.className = "button ghost"; remove.textContent = t("media.remove");
        remove.addEventListener("click", () => {
          const next = new Set(this.remembered); next.delete(origin);
          try { if (this.remembered.has(origin)) this.document.defaultView!.localStorage.setItem(this.key, JSON.stringify([...next])); }
          catch { showNotice(t("media.storageError"),this.document); return; }
          this.remembered = next; this.session.delete(origin); this.refresh(); render();
        }); row.append(remove); list.append(row);
      }
    }; render(); return panel;
  }
}

/** Linkify text; media cannot receive a src before the user grants its exact origin. */
export function appendChatLinks(node: HTMLElement, text: string, consent?: MediaConsent): void {
  const document = node.ownerDocument;
  let cursor = 0;
  // Explicit schemes only. Keep surrounding chat punctuation outside the anchor.
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`\u0000-\u001f\u007f]+/giu)) {
    let value = match[0].replace(/[.,!?:;，。！？；：、）】」』》*]+$/u, "");
    for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      while (value.endsWith(close) && value.split(close).length > value.split(open).length) value = value.slice(0, -1);
    }
    let url: URL;
    try { url = new URL(value); } catch { continue; }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) continue;
    node.append(document.createTextNode(text.slice(cursor, match.index)));
    const anchor = document.createElement("a");
    anchor.href = url.href;
    anchor.textContent = value;
    anchor.title = url.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer nofollow";
    anchor.referrerPolicy = "no-referrer";
    anchor.className = "chat-link";
    node.append(anchor);
    if (url.protocol === "https:") {
      if (resolveMedia(url) && consent) node.append(consent.slot(url));
    }
    cursor = match.index + value.length;
  }
  node.append(document.createTextNode(text.slice(cursor)));
}
