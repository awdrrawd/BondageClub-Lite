import type { RoomSearchRequest } from '../shared/types';

/** Serializes BC queries; a timed-out request needs a new transport before retry. */
export class RoomSearch {
  private pending = false;
  private queued: RoomSearchRequest | null = null;
  private recovery: RoomSearchRequest | null = null;
  private timer: number | null = null;
  private port: { canSend(): boolean; status(code: 'blocked' | 'loading' | 'timeout' | 'queued'): void; send(request: RoomSearchRequest): void; reconnect(): void };
  constructor(port: RoomSearch['port']) { this.port = port; }
  reset(clearRecovery = false): void {
    this.pending = false; this.queued = null; this.clearTimer();
    if (clearRecovery) this.recovery = null;
  }
  takeRecovery(): RoomSearchRequest | null {
    const request = this.recovery; this.recovery = null; return request;
  }
  complete(): RoomSearchRequest | null | false {
    if (!this.pending) return false;
    const queued = this.queued; this.reset(); return queued;
  }
  search(request: RoomSearchRequest): void {
    if (!this.port.canSend()) { this.port.status('blocked'); return; }
    if (this.pending) {
      if (this.timer === null) { this.recover(request); return; }
      this.queued = { ...request }; this.port.status('queued'); return;
    }
    this.pending = true;
    this.port.status('loading');
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      this.clearTimer(); this.port.status('timeout');
      if (this.queued) this.recover(this.queued);
    }, 8000);
    this.port.send({ ...request, Query: request.Query.toUpperCase().trim() });
  }
  private recover(request: RoomSearchRequest): void { this.recovery = { ...request }; this.port.reconnect(); }
  clearTimer(): void { if (this.timer !== null) window.clearTimeout(this.timer); this.timer = null; }
}
