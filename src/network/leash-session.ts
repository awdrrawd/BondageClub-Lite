import type { CharacterSummary } from '../shared/types';

/** Only an in-room HoldLeash establishes authority for later cross-room beeps. */
export class LeashSession {
  private holder: CharacterSummary | null = null;
  private departedAt: number | null = null;
  private port: { eligible(holder: CharacterSummary): boolean; hidden(target: number, content: string): void; changed(holder: number | null): void };
  constructor(port: LeashSession["port"]) { this.port = port; }
  clear(): void { this.holder = null; this.departedAt = null; this.port.changed(null); }
  departed(member: number): void { if (this.holder?.MemberNumber === member) this.departedAt = Date.now(); }
  current(characters: CharacterSummary[]): CharacterSummary | null {
    if (!this.holder) return null;
    const current = characters.find(c => c.MemberNumber === this.holder!.MemberNumber);
    if (current) { this.holder = current; this.departedAt = null; }
    else if (this.departedAt === null) this.departedAt = Date.now();
    if ((this.departedAt !== null && Date.now() - this.departedAt > 30000) || !this.port.eligible(this.holder)) { this.clear(); return null; }
    return this.holder;
  }
  message(sender: CharacterSummary, content: string): void {
    if (content === 'HoldLeash') {
      if (!this.port.eligible(sender)) { this.port.hidden(sender.MemberNumber, 'RemoveLeash'); return; }
      if (this.holder && this.holder.MemberNumber !== sender.MemberNumber) this.port.hidden(this.holder.MemberNumber, 'RemoveLeash');
      this.holder = sender; this.departedAt = null; this.port.changed(sender.MemberNumber);
    } else if (content === 'StopHoldLeash' && this.holder?.MemberNumber === sender.MemberNumber) this.clear();
    else if (content === 'PingHoldLeash' && (this.holder?.MemberNumber !== sender.MemberNumber || !this.port.eligible(sender))) {
      if (this.holder?.MemberNumber === sender.MemberNumber) this.clear();
      this.port.hidden(sender.MemberNumber, 'RemoveLeash');
    }
  }
}
