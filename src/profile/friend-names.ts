import LZString from 'lz-string';
import type { ClientSnapshot } from '../shared/types';

/** BC stores FriendNames as a UTF16-compressed array of [member number, name]. */
export function decodeFriendNames(value: unknown): Record<number, string> {
  const names: Record<number, string> = {};
  if (typeof value !== 'string' || value.length > 200000) return names;
  try {
    const entries: unknown = JSON.parse(LZString.decompressFromUTF16(value) || 'null');
    if (!Array.isArray(entries)) return names;
    for (const entry of entries.slice(0, 10000)) {
      if (Array.isArray(entry) && Number.isSafeInteger(entry[0]) && entry[0] > 0 && typeof entry[1] === 'string') names[entry[0]] = entry[1].slice(0, 100);
    }
  } catch { /* A damaged optional name cache must not prevent login. */ }
  return names;
}

export function contactName(state: Readonly<ClientSnapshot>, id: number, fallback = ''): string {
  const character = state.characters.find(c => c.MemberNumber === id);
  return character?.Nickname?.trim() || character?.Name || state.player?.FriendNames?.[id]
    || state.friends.find(friend => friend.MemberNumber === id)?.MemberName || fallback || `#${id}`;
}
