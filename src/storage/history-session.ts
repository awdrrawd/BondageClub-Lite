import { HistoryStore, historyBatch, historyOwner, historyPolicy, retained, type HistoryBatch, type HistoryMessage, type HistoryPolicy, type RecentContact } from './history';
import type { ClientSnapshot } from '../shared/types';

/** Keeps disk I/O out of the socket and renderer, and rejects stale account loads. */
export class HistorySession {
  policy: HistoryPolicy = historyPolicy();
  messages: HistoryMessage[] = [];
  contacts: RecentContact[] = [];
  private ephemeral: HistoryMessage[] = [];
  private owner = '';
  private generation = 0;
  private seen = new Set<string>();
  private pending: HistoryBatch = {messages:[], contacts:[]};
  private timer: ReturnType<typeof window.setTimeout> | undefined;
  private maintenance = 0;
  private queue: Promise<void> = Promise.resolve();
  private store: HistoryStore | null;
  private changed: () => void;
  private failed: () => void;
  private loaded: (owner: string, messages: HistoryMessage['message'][]) => void;
  private roomGeneration = 0;
  constructor(store: HistoryStore | null, changed: () => void, failed: () => void, loaded: (owner: string, messages: HistoryMessage['message'][]) => void = () => {}) {
    this.loaded = loaded;
    this.store = store; this.changed = changed; this.failed = failed;
    try { this.policy = historyPolicy(JSON.parse(localStorage.getItem('bc-lite-history-policy-v1') || '{}')); } catch { /* defaults */ }
    if (store) this.enqueue(() => store.prune('', this.policy));
  }
  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => { this.failed(); });
    return this.queue;
  }
  observe(state: Readonly<ClientSnapshot>): void {
    const owner = historyOwner(state);
    if (owner !== this.owner) {
      this.flush(); this.owner = owner; const generation = ++this.generation;
      this.messages = []; this.contacts = []; this.ephemeral = []; this.seen.clear(); this.maintenance = 0;
      const roomGeneration = this.roomGeneration;
      if (owner && this.store) this.enqueue(async () => {
        await this.store!.prune(owner, this.policy);
        const data = await this.store!.read(owner);
        if (generation !== this.generation) return;
        for (const row of data.messages) this.seen.add(row.key);
        this.merge(data);
        if (roomGeneration === this.roomGeneration) this.loaded(owner, data.messages.filter(row => row.kind === 'room').sort((a,b) => a.timestamp - b.timestamp).slice(-3000).map(row => ({...row.message, roomName: row.room})));
        this.changed();
      });
    }
    if (!owner) return;
    const batch = historyBatch(state, this.seen);
    for (const row of batch.messages) this.seen.add(row.key);
    // Bound the dedup set to the client's live ring + in-flight records, not days of traffic.
    if (this.seen.size > 15000) this.seen = new Set(historyBatch(state).messages.map(row => row.key));
    const maintenanceDue = Date.now() - this.maintenance > 3600000;
    if (batch.contacts.length || batch.messages.some(row => row.kind === 'private') || maintenanceDue || !this.store) this.merge(batch);
    if (this.store && (batch.messages.length || batch.contacts.length)) {
      this.pending.messages.push(...batch.messages); this.pending.contacts.push(...batch.contacts);
      if (this.timer === undefined) this.timer = window.setTimeout(() => this.flush(), 350);
    }
    if (maintenanceDue) {
      this.maintenance = Date.now();
      if (this.store) this.enqueue(() => this.store!.prune(owner, this.policy));
    }
  }
  private merge(batch: HistoryBatch): void {
    if (!this.store) {
      const rows = new Map([...this.ephemeral, ...batch.messages].map(row => [row.key, row]));
      this.ephemeral = [...rows.values()].filter(row => retained(row.timestamp, row.kind === 'room' ? this.policy.roomDays : this.policy.privateDays)).slice(-3000);
    }
    // Only private history is hydrated into UI memory. Public archives are read on demand for export.
    const messages = new Map(this.messages.map(row => [row.key, row]));
    for (const row of batch.messages) if (row.kind === 'private') messages.set(row.key, row);
    this.messages = [...messages.values()].filter(r => retained(r.timestamp, this.policy.privateDays)).sort((a,b) => a.timestamp - b.timestamp);
    const contacts = new Map(this.contacts.map(row => [row.peer, row]));
    for (const row of batch.contacts) if (row.timestamp > (contacts.get(row.peer)?.timestamp || 0)) contacts.set(row.peer, row);
    this.contacts = [...contacts.values()].filter(r => retained(r.timestamp, this.policy.recentDays)).sort((a,b) => b.timestamp - a.timestamp);
  }
  flush(): Promise<void> {
    window.clearTimeout(this.timer); this.timer = undefined;
    const batch = this.pending; this.pending = {messages:[],contacts:[]};
    const policy = {...this.policy};
    if (this.store && (batch.messages.length || batch.contacts.length)) return this.enqueue(() => this.store!.write(batch, policy));
    return this.queue;
  }
  async configure(policy: HistoryPolicy): Promise<void> {
    const owner = this.owner;
    await this.flush(); this.policy = historyPolicy(policy);
    try { localStorage.setItem('bc-lite-history-policy-v1', JSON.stringify(this.policy)); } catch { this.failed(); }
    this.merge({messages:[],contacts:[]});
    if (this.store) await this.store.prune(owner, this.policy);
    this.changed();
  }
  async read(): Promise<HistoryBatch> {
    const owner = this.owner, generation = this.generation;
    await this.flush();
    if (!owner || generation !== this.generation) return {messages:[],contacts:[]};
    if (!this.store) return {messages:this.ephemeral,contacts:this.contacts};
    await this.store.prune(owner, this.policy);
    const data = await this.store.read(owner);
    return generation === this.generation ? data : {messages:[],contacts:[]};
  }
  async clear(): Promise<void> {
    this.roomGeneration++;
    const owner = this.owner, generation = this.generation;
    await this.flush();
    if (this.store && owner) await this.store.prune(owner, this.policy, Date.now(), true);
    if (generation !== this.generation) return;
    this.messages = []; this.contacts = []; this.ephemeral = []; this.changed();
    // Keep seen IDs: clearing saved history must not re-save the existing live message ring.
  }
  async clearRoom(): Promise<void> {
    const owner = this.owner; this.roomGeneration++;
    await this.flush();
    if (this.store && owner) await this.store.clearRoom(owner);
    if (this.owner === owner) this.ephemeral = this.ephemeral.filter(row => row.kind !== 'room');
  }
}
