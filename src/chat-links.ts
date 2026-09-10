/** Linkify text and render direct HTTPS media without parsing HTML or embedding webpages. */
export function appendChatLinks(node: HTMLElement, text: string): void {
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
      if (image || video) {
        const media = document.createElement(image ? "img" : "video");
        media.className = "chat-media";
        media.setAttribute("aria-label", url.href);
        if (media instanceof document.defaultView!.HTMLImageElement) {
          media.alt = "";
          media.loading = "lazy";
          media.decoding = "async";
          media.referrerPolicy = "no-referrer";
        } else {
          const player = media as HTMLVideoElement;
          player.controls = true;
          player.playsInline = true;
          player.preload = "metadata";
        }
        // Broken/blocked media fall back to the original link, without retry loops.
        media.addEventListener("error", () => media.remove(), { once: true });
        media.src = url.href;
        node.append(media);
      }
    }
    cursor = match.index + value.length;
  }
  node.append(document.createTextNode(text.slice(cursor)));
}
