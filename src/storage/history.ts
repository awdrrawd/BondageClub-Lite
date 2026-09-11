import type { ClientSnapshot, DisplayMessage } from '../shared/types';

export type HistoryPolicy = { recentDays: number; roomDays: number; privateDays: number };
export const defaultHistoryPolicy: HistoryPolicy = { recentDays: 30, roomDays: 7, privateDays: 7 };
export function historyPolicy(value: Partial<HistoryPolicy> = {}): HistoryPolicy {
  const choice = (n: unknown, allowed: number[], fallback: number) => typeof n === 'number' && allowed.includes(n) ? n : fallback;
  return { recentDays: choice(value.recentDays, [0, 7, 14, 30], 30), roomDays: choice(value.roomDays, [0, 1, 3, 7], 7), privateDays: choice(value.privateDays, [0, 1, 3, 7], 7) };
}
export interface HistoryMessage {
  expiresAt?: number;
  key: string; owner: string; timestamp: number; kind: 'room' | 'private'; room: string;
  message: DisplayMessage;
}
export interface RecentContact { key: string; owner: string; peer: number; name: string; timestamp: number; expiresAt?: number }
export interface HistoryBatch { messages: HistoryMessage[]; contacts: RecentContact[] }
const DAY = 86400000;

export function historyOwner(state: Readonly<ClientSnapshot>): string {
  return state.player ? `${state.player.Environment || 'unknown'}:${state.player.MemberNumber}` : '';
}
export function privateRows(state: Readonly<ClientSnapshot>): DisplayMessage[] {
  if (!state.player) return [];
  const self = state.player;
  return [...(state.whispers || state.messages).filter(m => m.type === 'Whisper'), ...state.beeps.map(m => ({
    id: m.id, sender: m.incoming ? m.memberNumber : self.MemberNumber, senderName: m.incoming ? m.name : self.Nickname || self.Name,
    target: m.incoming ? self.MemberNumber : m.memberNumber, targetName: m.incoming ? self.Name : m.name,
    text: m.text, type: 'Beep' as const, time: m.time,
  }))];
}

/** Explicit allowlist: never persist raw protocol dictionaries, profiles, appearances or credentials. */
export function historyBatch(state: Readonly<ClientSnapshot>, seen?: Set<string>): HistoryBatch {
  const owner = historyOwner(state), messages: HistoryMessage[] = [], contacts = new Map<number, RecentContact>();
  if (!owner) return { messages, contacts: [] };
  const collect = (input: DisplayMessage, kind: 'room' | 'private') => {
    const key = `${owner}:${kind}:${input.id}`;
    if (seen?.has(key)) return;
    const timestamp = +input.time;
    if (!Number.isFinite(timestamp)) return;
    const message: DisplayMessage = { id: input.id, sender: input.sender, senderName: input.senderName, target: input.target, targetName: input.targetName,
      text: input.text, type: input.type, time: new Date(timestamp), replyId: input.replyId, nativeId: input.nativeId, presence: input.presence, labelColor: input.labelColor, roomName: input.roomName };
    messages.push({ key, owner, timestamp, kind, room: kind === 'room' ? input.roomName ?? state.room?.Name ?? '' : '', message });
    if (kind === 'private') {
      const incoming = message.sender !== state.player!.MemberNumber;
      const peer = incoming ? message.sender : message.target;
      if (peer && peer > 0 && peer !== state.player!.MemberNumber && timestamp >= (contacts.get(peer)?.timestamp || 0)) {
        contacts.set(peer, {key: `${owner}:${peer}`, owner, peer, name: (incoming ? message.senderName : message.targetName) || '', timestamp});
      }
    }
  };
  if (state.room) state.messages.filter(m => m.type !== 'Whisper' && m.type !== 'Beep').forEach(m => collect(m, 'room'));
  privateRows(state).forEach(m => collect(m, 'private'));
  return {messages, contacts: [...contacts.values()]};
}
export function retained(timestamp: number, days: number, now = Date.now()): boolean {
  return days > 0 && timestamp > now - days * DAY && timestamp <= now + 60000;
}
export function localDay(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Plain text export cannot execute player HTML or silently load images/trackers. */
export function exportHistory(records: HistoryMessage[], day: string, includePrivate: boolean, typeLabel: (type: string) => string): string {
  const rows = records.filter(r => localDay(r.timestamp) === day && (includePrivate || r.kind === 'room')).sort((a,b) => a.timestamp - b.timestamp);
  const sections = new Map<string, string[]>();
  const oneLine = (value: string) => value.replace(/[\r\n\t]/g, ' ');
  for (const row of rows) {
    const m = row.message, section = row.kind === 'room' ? row.room : `${typeLabel('Beep')} / ${typeLabel('Whisper')}`;
    const lines = sections.get(section) || [];
    const target = m.target ? ` → ${oneLine(m.targetName || '')} #${m.target}` : '';
    lines.push(`[${new Date(row.timestamp).toLocaleTimeString('en-GB', {hour12:false})}] [${typeLabel(m.type)}] ${oneLine(m.senderName)}${m.sender ? ` #${m.sender}` : ''}${target}: ${m.text}`);
    sections.set(section, lines);
  }
  return `BC Lite — ${day}\n\n` + [...sections].map(([section,lines]) => `=== ${oneLine(section)} ===\n${lines.join('\n')}`).join('\n\n');
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error || new Error('History transaction aborted')); tx.onerror = () => reject(tx.error); });
}
/** Account/environment-scoped IndexedDB. Expiration deletes cursor records, never the database. */
export class HistoryStore {
  private db: Promise<IDBDatabase> | null = null;
  private factory: IDBFactory;
  constructor(factory: IDBFactory = indexedDB) { this.factory = factory; }
  private open(): Promise<IDBDatabase> {
    if (!this.db) this.db = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open('bc-lite-history', 1);
      request.onupgradeneeded = () => {
        for (const name of ['messages', 'contacts']) {
          const store = request.result.createObjectStore(name, {keyPath: 'key'});
          store.createIndex('owner', 'owner'); store.createIndex('timestamp', 'timestamp');
          if (name === 'messages') store.createIndex('ownerKind', ['owner', 'kind']);
        }
      };
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); this.db = null; }; resolve(db); };
      request.onerror = () => { this.db = null; reject(request.error); };
      request.onblocked = () => { this.db = null; reject(new Error('History database upgrade blocked')); };
    });
    return this.db;
  }
  async write(batch: HistoryBatch, policy: HistoryPolicy, now = Date.now()): Promise<void> {
    const db = await this.open(), tx = db.transaction(['messages','contacts'], 'readwrite'), done = complete(tx);
    for (const row of batch.messages) {
      const days = row.kind === 'room' ? policy.roomDays : policy.privateDays;
      if (retained(row.timestamp, days, now)) tx.objectStore('messages').put({...row, expiresAt: row.timestamp + days * DAY});
    }
    for (const row of batch.contacts) if (retained(row.timestamp, policy.recentDays, now)) {
      const store = tx.objectStore('contacts'), request = store.get(row.key);
      request.onsuccess = () => { if (!request.result || request.result.timestamp < row.timestamp) store.put({...row, expiresAt: row.timestamp + policy.recentDays * DAY}); };
    }
    await done;
  }
  async read(owner: string, privateOnly = false): Promise<HistoryBatch> {
    const db = await this.open(), tx = db.transaction(['messages','contacts'], 'readonly'), done = complete(tx);
    const messages = privateOnly ? tx.objectStore('messages').index('ownerKind').getAll([owner, 'private']) : tx.objectStore('messages').index('owner').getAll(owner);
    const contacts = tx.objectStore('contacts').index('owner').getAll(owner);
    await done; return { messages: messages.result, contacts: contacts.result };
  }
  async clearRoom(owner: string): Promise<void> {
    const db = await this.open(), tx = db.transaction('messages', 'readwrite'), done = complete(tx);
    const request = tx.objectStore('messages').index('ownerKind').openCursor([owner, 'room']);
    request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    await done;
  }
  async prune(owner: string, policy: HistoryPolicy, now = Date.now(), clear = false): Promise<void> {
    const db = await this.open(), tx = db.transaction(['messages','contacts'], 'readwrite'), done = complete(tx);
    for (const name of ['messages','contacts']) {
      // Scan all records for the hard maximum, including accounts not currently logged in.
      const request = tx.objectStore(name).openCursor();
      request.onsuccess = () => {
        const cursor = request.result; if (!cursor) return;
        const row = cursor.value;
        const days = row.owner !== owner ? (name === 'contacts' ? 30 : 7) : clear ? 0 : name === 'contacts' ? policy.recentDays : row.kind === 'room' ? policy.roomDays : policy.privateDays;
        if (!retained(row.timestamp, days, now) || row.expiresAt <= now) cursor.delete();
        else if (row.owner === owner) cursor.update({...row, expiresAt: row.timestamp + days * DAY});
        cursor.continue();
      };
    }
    await done;
  }
}
