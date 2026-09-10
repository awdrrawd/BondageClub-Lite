export type MediaTarget = { kind: "image" | "video" | "audio" | "frame"; src: string; label: string };
/** ACV-style classification, but exact hosts/IDs only: never execute remote scripts or scan the chat DOM. */
export function resolveMedia(url: URL): MediaTarget | null {
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname, path = url.pathname;
  if (/\.(png|jpe?g|gif|webp|avif|apng|bmp|jfif)$/i.test(path)) return { kind:"image", src:url.href, label:"Image" };
  if (/\.(mp4|webm|ogv|mov|m4v)$/i.test(path)) return { kind:"video", src:url.href, label:"Video" };
  if (/\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(path)) return { kind:"audio", src:url.href, label:"Audio" };
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
    const id = host === "youtu.be" ? path.slice(1) : path === "/watch" ? url.searchParams.get("v") : path.match(/^\/(?:shorts|live|embed)\/([^/]+)$/)?.[1];
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return { kind:"frame", src:`https://www.youtube-nocookie.com/embed/${id}?autoplay=0&rel=0`, label:"YouTube" };
  }
  if (["vimeo.com", "www.vimeo.com"].includes(host) && /^\/\d+$/.test(path)) return { kind:"frame", src:`https://player.vimeo.com/video${path}?autoplay=0`, label:"Vimeo" };
  if (host === "open.spotify.com") {
    const match = path.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode)\/([A-Za-z0-9]{22})$/);
    if (match) return { kind:"frame", src:`https://open.spotify.com/embed/${match[1]}/${match[2]}`, label:"Spotify" };
  }
  return null;
}
