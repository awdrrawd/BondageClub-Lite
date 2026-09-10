import { t } from "../i18n";

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
  private refresh(): void {
    this.document.querySelectorAll<HTMLElement>(".chat-media-slot").forEach(slot => this.render(slot));
  }
  slot(url: URL): HTMLElement {
    const slot = this.document.createElement("span"); slot.className = "chat-media-slot"; slot.dataset.url = url.href;
    this.render(slot); return slot;
  }
  private render(slot: HTMLElement): void {
    const url = new URL(slot.dataset.url!);
    slot.replaceChildren();
    if (this.session.has(url.origin) || this.remembered.has(url.origin)) {
      const image = /\.(?:png|jpe?g|gif|webp|avif|apng|bmp|jfif)$/i.test(url.pathname);
      const media = this.document.createElement(image ? "img" : "video"); media.className = "chat-media";
      media.setAttribute("aria-label", url.href);
      if (image) { const img = media as HTMLImageElement; img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer"; }
      else { const video = media as HTMLVideoElement; video.controls = true; video.playsInline = true; video.preload = "metadata"; }
      media.addEventListener("error", () => media.remove(), { once: true });
      media.src = url.href; slot.append(media); return;
    }
    slot.append(this.document.createTextNode(t("media.prompt", [url.origin])));
    for (const permanent of [false, true]) {
      const button = this.document.createElement("button"); button.type = "button"; button.className = "button ghost";
      button.textContent = t(permanent ? "media.always" : "media.once");
      button.addEventListener("click", () => {
        if (permanent) {
          const next = new Set(this.remembered); next.add(url.origin);
          try { this.document.defaultView!.localStorage.setItem(this.key, JSON.stringify([...next])); this.remembered = next; }
          catch { this.document.defaultView!.alert(t("media.storageError")); return; }
        } else this.session.add(url.origin);
        this.render(slot); this.refresh();
      });
      slot.append(button);
    }
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
          catch { this.document.defaultView!.alert(t("media.storageError")); return; }
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
      const image = /\.(?:png|jpe?g|gif|webp|avif|apng|bmp|jfif)$/i.test(url.pathname);
      const video = /\.(?:mp4|webm|ogv|mov)$/i.test(url.pathname);
      if ((image || video) && consent) node.append(consent.slot(url));
    }
    cursor = match.index + value.length;
  }
  node.append(document.createTextNode(text.slice(cursor)));
}
