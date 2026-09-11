import { historyOwner, privateRows, type HistoryMessage } from '../storage/history';
import type { ClientSnapshot, DisplayMessage } from '../shared/types';

/** A snapshot-derived view, shared by the log and pager instead of sorting twice. */
export class PrivateMessages {
  private state: Readonly<ClientSnapshot> | null = null;
  private saved: HistoryMessage[] | null = null;
  private peer = 0;
  private rows: DisplayMessage[] = [];
  private end: HistoryMessage | undefined;
  get(state: Readonly<ClientSnapshot>, saved: HistoryMessage[], peer: number, end?: HistoryMessage): DisplayMessage[] {
    const previous=this.state;
    if (previous && historyOwner(previous)===historyOwner(state) && previous.beeps===state.beeps && previous.whispers===state.whispers && (state.whispers || previous.messages===state.messages) && this.saved===saved && this.peer===peer && this.end===end) return this.rows;
    this.end=end;
    this.state=state; this.saved=saved; this.peer=peer;
    const rows=new Map([...saved.map(row=>row.message),...privateRows(state)].map(message=>[message.id,message]));
    this.rows=[...rows.values()].filter(message=>(!peer || message.sender===peer || (message.sender===state.player?.MemberNumber && message.target===peer)) && (!end || +message.time<end.timestamp || (+message.time===end.timestamp && message.id<=end.message.id))).sort((a,b)=>+a.time-+b.time || (a.id<b.id ? -1 : a.id>b.id ? 1 : 0));
    return this.rows;
  }
  reset(): void { this.state=null; this.saved=null; this.rows=[]; this.peer=0; }
}
