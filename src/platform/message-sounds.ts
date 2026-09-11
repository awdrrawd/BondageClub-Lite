/** Local synthesized tones only; never request notification permission or media URLs. */
export class MessageSounds {
  enabled = { beep: false, whisper: false };
  private context: AudioContext | null = null;
  private last = 0;
  constructor() {
    try { const value=JSON.parse(localStorage.getItem('bc-lite-sounds-v1') || '{}'); this.enabled={beep:value.beep===true,whisper:value.whisper===true}; } catch { /* optional storage */ }
  }
  async enable(kind: 'beep' | 'whisper', value: boolean): Promise<void> {
    this.enabled[kind]=value;
    localStorage.setItem('bc-lite-sounds-v1',JSON.stringify(this.enabled));
    if (value) { await this.unlock(); await this.play(kind,true); }
  }
  async unlock(): Promise<void> {
    if (!this.enabled.beep && !this.enabled.whisper) return;
    if (!this.context) this.context=new window.AudioContext();
    if (this.context.state==='suspended') await this.context.resume();
  }
  async play(kind: 'beep' | 'whisper', preview=false): Promise<void> {
    if (!this.enabled[kind] || !this.context || this.context.state!=='running') return;
    if (!preview && Date.now()-this.last<700) return;
    this.last=Date.now();
    const ctx=this.context, now=ctx.currentTime, tone=ctx.createOscillator(), volume=ctx.createGain();
    tone.frequency.value=kind==='beep' ? 660 : 880;
    volume.gain.setValueAtTime(0,now); volume.gain.linearRampToValueAtTime(0.12,now+0.015); volume.gain.exponentialRampToValueAtTime(0.001,now+0.18);
    tone.connect(volume); volume.connect(ctx.destination); tone.start(now); tone.stop(now+0.2);
    tone.onended=()=>{tone.disconnect(); volume.disconnect();};
  }
  stop(): void { const context=this.context; this.context=null; if(context) void context.close().catch(()=>{}); }
}
