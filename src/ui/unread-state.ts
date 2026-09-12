import type { DisplayMessage } from '../shared/types';

/** Message identity and unread accounting are independent of DOM rendering. */
export class UnreadState {
  private seen = new Set<string>();
  private peers = new Map<number, { count: number; first: DisplayMessage }>();
  room = 0;
  get total(): number { return [...this.peers.values()].reduce((sum, peer) => sum + peer.count, 0); }
  get(peer: number) { return this.peers.get(peer); }
  markRead(peer: number): void { this.peers.delete(peer); }
  reset(): void { this.seen.clear(); this.peers.clear(); this.room = 0; }
  observe(messages: DisplayMessage[], self: number, baseline: boolean, reading: (sender: number) => boolean): DisplayMessage[] {
    const incoming: DisplayMessage[] = [];
    for (const message of messages) {
      const key = `${message.type}:${message.id}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      if (baseline || !message.sender || message.sender === self) continue;
      const prior = this.peers.get(message.sender);
      if (prior || !reading(message.sender)) this.peers.set(message.sender, { count: (prior?.count || 0) + 1, first: prior?.first || message });
      incoming.push(message);
    }
    if (this.seen.size > 3000) this.seen = new Set(messages.map(message => `${message.type}:${message.id}`));
    return incoming;
  }
}
