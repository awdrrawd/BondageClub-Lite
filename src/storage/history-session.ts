import { HistoryStore, historyBatch, historyOwner, historyPolicy, retained, localDay, type HistoryBatch, type HistoryMessage, type HistoryPolicy, type RecentContact } from './history';
import type { ClientSnapshot } from '../shared/types';

/** Keeps disk I/O out of the socket and renderer, and rejects stale account loads. */
export class HistorySession {
  policy: HistoryPolicy = historyPolicy();
  messages: HistoryMessage[] = [];
  contacts: RecentContact[] = [];
  private ephemeral: HistoryMessage[] = [];
  private owner = '';
  private generation = 0;
  private seen = new Map<string, string>();
  private suppressed = new Set<string>();
  private retries = 0;
  private revision = 0;
  private unsaved = new Map<string, number>();
  private exhaustedPeers = new Set<number>();
  private observed: Readonly<ClientSnapshot> | null = null;
  private pending: HistoryBatch = {messages:[], contacts:[]};
  private timer: ReturnType<typeof window.setTimeout> | undefined;
  private maintenance = 0;
  private queue: Promise<void> = Promise.resolve();
  private store: HistoryStore | null;
  private changed: () => void;
  private failed: () => void;
  private loaded: (owner: string, messages: HistoryMessage['message'][]) => void;
  private roomGeneration = 0;
  private archiveGeneration = 0;
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
    const previous=this.observed; this.observed={...state};
    if (owner !== this.owner) {
      this.flush(); this.owner = owner; const generation = ++this.generation;
      this.messages = []; this.contacts = []; this.ephemeral = []; this.seen.clear(); this.suppressed.clear(); this.exhaustedPeers.clear(); this.maintenance = Date.now();
      const roomGeneration = this.roomGeneration;
      const archiveGeneration = this.archiveGeneration;
      if (owner && this.store) this.enqueue(async () => {
        await this.store!.prune(owner, this.policy);
        const data = await this.store!.initial(owner);
        if (generation !== this.generation) return;
        if (archiveGeneration !== this.archiveGeneration) return;
        for (const row of data.messages) if (!this.seen.has(row.key)) this.seen.set(row.key, this.signature(row));
        const current=new Set(this.messages.map(row=>row.key));
        this.merge({...data,messages:data.messages.filter(row=>!current.has(row.key) && !this.suppressed.has(row.key))});
        if (roomGeneration === this.roomGeneration) this.loaded(owner, data.messages.filter(row => row.kind === 'room').sort((a,b) => a.timestamp - b.timestamp).slice(-3000).map(row => ({...row.message, roomName: row.room})));
        this.changed();
      });
    }
    if (!owner) return;
    const unchanged=previous && historyOwner(previous)===owner && previous.messages===state.messages && previous.whispers===state.whispers && previous.beeps===state.beeps && previous.room?.Name===state.room?.Name && previous.player?.Name===state.player?.Name && previous.player?.Nickname===state.player?.Nickname;
    const batch = unchanged ? {messages:[],contacts:[]} : historyBatch(state, this.suppressed);
    batch.messages = batch.messages.filter(row => this.seen.get(row.key) !== this.signature(row));
    const changedPrivate = new Set(batch.messages.filter(row=>row.kind==='private').map(row=>row.timestamp));
    batch.contacts = batch.contacts.filter(row=>changedPrivate.has(row.timestamp));
    for (const row of batch.messages) this.seen.set(row.key, this.signature(row));
    // Bound the dedup set to the client's live ring + in-flight records, not days of traffic.
    if (this.seen.size > 15000) {
      const live = new Set(historyBatch(state).messages.map(row=>row.key));
      this.seen = new Map([...this.seen].filter(([key])=>live.has(key)));
      this.suppressed = new Set([...this.suppressed].filter(key=>live.has(key)));
    }
    const maintenanceDue = Date.now() - this.maintenance > 3600000;
    if (batch.contacts.length || batch.messages.some(row => row.kind === 'private') || maintenanceDue || !this.store) this.merge(batch);
    if (this.store && (batch.messages.length || batch.contacts.length)) {
      for (const row of batch.messages) this.unsaved.set(row.key,++this.revision);
      this.pending.messages.push(...batch.messages); this.pending.contacts.push(...batch.contacts);
      if (this.timer === undefined) this.timer = window.setTimeout(() => this.flush(), 350);
    }
    if (maintenanceDue) {
      this.maintenance = Date.now();
      if (this.store) this.enqueue(() => this.store!.prune('', this.policy));
    }
  }
  private signature(row: HistoryMessage): string { return JSON.stringify([row.room,row.message]); }
  private merge(batch: HistoryBatch): void {
    if (!this.store) {
      const rows = new Map([...this.ephemeral, ...batch.messages].map(row => [row.key, row]));
      this.ephemeral = [...rows.values()].filter(row => retained(row.timestamp, row.kind === 'room' ? this.policy.roomDays : this.policy.privateDays)).slice(-3000);
    }
    // Public history is restored to the client's bounded ring; private pages stay here.
    const messages = new Map(this.messages.map(row => [row.key, row]));
    for (const row of batch.messages) if (row.kind === 'private') messages.set(row.key, row);
    this.messages = [...messages.values()].filter(r => retained(r.timestamp, this.policy.privateDays)).sort((a,b) => a.timestamp - b.timestamp || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const contacts = new Map(this.contacts.map(row => [row.peer, row]));
    for (const row of batch.contacts) if (row.timestamp > (contacts.get(row.peer)?.timestamp || 0)) contacts.set(row.peer, row);
    this.contacts = [...contacts.values()].filter(r => retained(r.timestamp, this.policy.recentDays)).sort((a,b) => b.timestamp - a.timestamp);
  }
  flush(): Promise<void> {
    window.clearTimeout(this.timer); this.timer = undefined;
    const batch = {messages:[...new Map(this.pending.messages.map(row=>[row.key,row])).values()],contacts:[...new Map(this.pending.contacts.map(row=>[row.key,row])).values()]};
    this.pending = {messages:[],contacts:[]};
    const revisions=new Map(batch.messages.map(row=>[row.key,this.unsaved.get(row.key)]));
    const policy = {...this.policy};
    if (this.store && (batch.messages.length || batch.contacts.length)) return this.enqueue(async () => {
      try {
        await this.store!.write(batch, policy); this.retries = 0;
        for (const row of batch.messages) if (this.unsaved.get(row.key)===revisions.get(row.key)) this.unsaved.delete(row.key);
      }
      catch (error) {
        // Requeue before reporting failure. Newer edits win over an in-flight version.
        this.pending = {
          messages:[...new Map([...batch.messages.filter(row=>this.unsaved.get(row.key)===revisions.get(row.key)),...this.pending.messages].map(row=>[row.key,row])).values()],
          contacts:[...new Map([...batch.contacts,...this.pending.contacts].map(row=>[row.key,row])).values()],
        };
        if (++this.retries <= 3 && this.timer === undefined) this.timer = window.setTimeout(()=>{ void this.flush(); }, 1000 * 2 ** (this.retries - 1));
        throw error;
      }
    });
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
    await this.store.prune('', this.policy);
    const data = await this.store.read(owner);
    return generation === this.generation ? data : {messages:[],contacts:[]};
  }
  async days(includePrivate: boolean): Promise<Array<{day:string;count:number}>> {
    const owner=this.owner, generation=this.generation;
    await this.flush();
    if (!owner || generation!==this.generation) return [];
    if (this.store) {
      await this.store.prune('',this.policy);
      const data=await this.store.days(owner,includePrivate);
      return generation===this.generation ? data : [];
    }
    const counts=new Map<string,number>();
    for (const row of this.ephemeral) if (includePrivate || row.kind==='room') { const day=localDay(row.timestamp); counts.set(day,(counts.get(day)||0)+1); }
    return [...counts].map(([day,count])=>({day,count})).sort((a,b)=>b.day.localeCompare(a.day));
  }
  async day(day: string, includePrivate: boolean): Promise<HistoryMessage[]> {
    const owner=this.owner, generation=this.generation;
    await this.flush();
    if (!owner || generation!==this.generation) return [];
    if (!this.store) return this.ephemeral.filter(row=>localDay(row.timestamp)===day && (includePrivate || row.kind==='room'));
    await this.store.prune('',this.policy);
    const data=await this.store.day(owner,day,includePrivate);
    return generation===this.generation ? data : [];
  }
  hasOlderPrivate(peer: number): boolean { return !!this.store && !this.exhaustedPeers.has(peer); }
  async loadPrivate(peer: number, older = false): Promise<void> {
    if (!this.store || !this.owner) return;
    const owner=this.owner, generation=this.generation, roomGeneration=this.roomGeneration;
    const self=Number(owner.slice(owner.lastIndexOf(':')+1));
    const rows=this.messages.filter(row=>(row.message.sender===self ? row.message.target : row.message.sender)===peer);
    const before=older ? rows[0] : undefined;
    await this.flush();
    const page=await this.store.page(owner,'private',60,before,peer);
    if (generation!==this.generation || roomGeneration!==this.roomGeneration) return;
    if (page.length<60) this.exhaustedPeers.add(peer);
    for (const row of page) if (!this.seen.has(row.key)) this.seen.set(row.key,this.signature(row));
    // Loaded rows must not overwrite newer, locally corrected text.
    const current=new Set(this.messages.map(row=>row.key));
    this.merge({messages:page.filter(row=>!current.has(row.key) && !this.suppressed.has(row.key)),contacts:[]});
    this.changed();
  }
  async clear(): Promise<void> {
    this.roomGeneration++;
    this.archiveGeneration++;
    const owner = this.owner, generation = this.generation;
    const keys=new Set([...this.seen.keys(),...this.messages.map(row=>row.key),...this.ephemeral.map(row=>row.key)]), previousContacts=new Map(this.contacts.map(row=>[row.key,row]));
    for (const key of keys) this.suppressed.add(key);
    await this.clearStored(owner, keys);
    if (generation !== this.generation) return;
    this.messages = this.messages.filter(row=>!keys.has(row.key));
    this.contacts = this.contacts.filter(row=>previousContacts.get(row.key)!==row);
    this.ephemeral = this.ephemeral.filter(row=>!keys.has(row.key)); this.changed();
    // Keep seen IDs: clearing saved history must not re-save the existing live message ring.
  }
  async clearRoom(): Promise<void> {
    const owner = this.owner; this.roomGeneration++;
    const keys=new Set([...this.seen.keys()].filter(key=>key.startsWith(`${owner}:room:`)));
    for (const key of keys) this.suppressed.add(key);
    await this.clearStored(owner, keys, true);
    if (this.owner === owner) this.ephemeral = this.ephemeral.filter(row => !keys.has(row.key));
  }
  private clearStored(owner: string, keys: Set<string>, roomOnly = false): Promise<void> {
    // Serialize deletion with writes, including failed batches, without resurrecting them later.
    const task = this.queue.then(async () => {
      this.pending.messages = this.pending.messages.filter(row=>!keys.has(row.key));
      for (const key of keys) this.unsaved.delete(key);
      if (!roomOnly) {
        const peers=new Set(this.pending.messages.filter(row=>row.owner===owner && row.kind==='private').map(row=>row.message.sender===Number(owner.slice(owner.lastIndexOf(':')+1)) ? row.message.target : row.message.sender));
        this.pending.contacts=this.pending.contacts.filter(row=>row.owner!==owner || peers.has(row.peer));
      }
      if (this.store && owner) {
        if (roomOnly) await this.store.clearRoom(owner);
        else await this.store.prune(owner,this.policy,Date.now(),true);
      }
    });
    this.queue=task.catch(()=>this.failed());
    return task;
  }
}
