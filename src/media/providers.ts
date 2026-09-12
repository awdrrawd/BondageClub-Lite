export type MediaTarget = { kind: "image" | "video" | "audio" | "frame"; src: string; label: string };
/** ACV-style display conversion. The original chat text and link never change. */
export function resolveMedia(url: URL, parentHost = ''): MediaTarget | null {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname, path = url.pathname;
  const frame = (src: string, label: string): MediaTarget => ({kind:'frame',src,label});
  // GitHub blob/raw pages are not media bytes; convert only the local player source.
  let raw = url.href;
  const github = host === 'github.com' ? path.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/) : null;
  if (github) raw = `https://raw.githubusercontent.com/${github[1]}/${github[2]}/${github[3]}${url.search}`;
  if (/\.(png|jpe?g|gif|webp|avif|apng|bmp|jfif)$/i.test(path)) return {kind:'image',src:raw,label:'Image'};
  if (/\.(mp4|webm|mov|m4v|mkv|avi|flv|wmv|3gp|3gpp|ts|m2ts|ogv)$/i.test(path)) return {kind:'video',src:raw,label:'Video'};
  if (/\.(mp3|wav|ogg|flac|m4a|aac|opus|wma|oga|weba)$/i.test(path)) return {kind:'audio',src:raw,label:'Audio'};
  if (['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host)) {
    const id = host === 'youtu.be' ? path.slice(1) : path === '/watch' ? url.searchParams.get('v') : path.match(/^\/(?:shorts|live|embed)\/([^/]+)\/?$/)?.[1];
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return frame(`https://www.youtube-nocookie.com/embed/${id}?autoplay=0&rel=0`,'YouTube');
  }
  if (['bilibili.com','www.bilibili.com','m.bilibili.com'].includes(host)) {
    const video = path.match(/^\/video\/(BV[A-Za-z0-9]+)\/?$/);
    if (video) return frame(`https://player.bilibili.com/player.html?bvid=${video[1]}&autoplay=0&isOutside=true`,'Bilibili');
    const episode = path.match(/^\/bangumi\/play\/(ep|ss)(\d+)\/?$/);
    if (episode) return frame(`https://player.bilibili.com/player.html?${episode[1]==='ep'?'ep_id':'season_id'}=${episode[2]}&autoplay=0&isOutside=true`,'Bilibili');
  }
  if (['douyin.com','www.douyin.com'].includes(host)) {
    const id = path.match(/^\/video\/(\d+)\/?$/)?.[1] || (path==='/jingxuan' ? url.searchParams.get('modal_id') : null);
    if (id && /^\d+$/.test(id)) return frame(`https://open.douyin.com/player/video?vid=${id}&autoplay=0`,'Douyin');
  }
  if (['vimeo.com','www.vimeo.com'].includes(host) && /^\/\d+$/.test(path)) return frame(`https://player.vimeo.com/video${path}?autoplay=0`,'Vimeo');
  if (['nicovideo.jp','www.nicovideo.jp'].includes(host) && /^\/watch\/sm\d+$/.test(path)) return frame(`https://embed.nicovideo.jp${path}`,'Niconico');
  if (['facebook.com','www.facebook.com','m.facebook.com'].includes(host) && (/^\/(?:reel\/\d+|[^/]+\/videos\/\d+)\/?$/.test(path) || /^\/watch\/?$/.test(path) && /^\d+$/.test(url.searchParams.get('v') || ''))) return frame(`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.href)}&show_text=false`,'Facebook');
  if (['twitch.tv','www.twitch.tv'].includes(host) && /^[a-z\d.-]+$/i.test(parentHost)) {
    const video = path.match(/^\/videos\/(\d+)\/?$/), channel = path.match(/^\/([a-z\d_]+)\/?$/i);
    if (video || channel) return frame(`https://player.twitch.tv/?${video ? `video=${video[1]}` : `channel=${channel![1]}`}&parent=${encodeURIComponent(parentHost)}&autoplay=false`,'Twitch');
  }
  if (['streamable.com','www.streamable.com'].includes(host) && /^\/[a-z\d]+$/i.test(path)) return frame(`https://streamable.com/e${path}`,'Streamable');
  if (['dailymotion.com','www.dailymotion.com'].includes(host)) {
    const id = path.match(/^\/video\/([a-z\d]+)\/?$/i)?.[1];
    if (id) return frame(`https://www.dailymotion.com/embed/video/${id}`,'Dailymotion');
  }
  if (['pornhub.com','www.pornhub.com'].includes(host) && path==='/view_video.php') {
    const id = url.searchParams.get('viewkey');
    if (id && /^[a-z\d]+$/i.test(id)) return frame(`https://www.pornhub.com/embed/${id}`,'Pornhub');
  }
  if (['instagram.com','www.instagram.com'].includes(host)) {
    const id = path.match(/^\/(?:p|reel)\/([a-z\d_-]+)\/?$/i)?.[1];
    if (id) return frame(`https://www.instagram.com/p/${id}/embed/`,'Instagram');
  }
  if (host==='open.spotify.com') {
    const match = path.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{22})$/);
    if (match) return frame(`https://open.spotify.com/embed/${match[1]}/${match[2]}`,'Spotify');
  }
  if (['soundcloud.com','www.soundcloud.com','snd.sc'].includes(host) && path.length>1) return frame(`https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}&auto_play=false&visual=false`,'SoundCloud');
  if (host==='music.apple.com' && /^\/[a-z]{2}\/(?:album|song|playlist|artist)\/.+/i.test(path)) return frame(`https://embed.music.apple.com${path}${url.search}`,'Apple Music');
  if (host==='music.163.com') {
    const value = new URL(url.hash.startsWith('#/') ? `https://music.163.com${url.hash.slice(1)}` : url.href);
    const id = value.pathname.match(/^\/song\/(\d+)$/)?.[1] || (value.pathname==='/song' ? value.searchParams.get('id') : null);
    if (id && /^\d+$/.test(id)) return frame(`https://music.163.com/outchain/player?type=2&id=${id}&auto=0&height=66`,'NetEase Music');
  }
  return null;
}
