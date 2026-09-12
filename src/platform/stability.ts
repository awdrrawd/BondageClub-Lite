import { t } from "../i18n";

/** Optional browser aids. Neither is a background-execution guarantee. */
export class StabilityControls {
  private awake = false;
  private lock: WakeLockSentinel | null = null;
  private acquiring = false;
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private status = "";
  private statusNode: HTMLElement | null = null;

  private onVisibility = () => { if (document.visibilityState === "visible" && this.awake) void this.acquire(); };
  constructor() { document.addEventListener("visibilitychange", this.onVisibility); }
  dispose(): void { document.removeEventListener("visibilitychange", this.onVisibility); this.stop(); this.statusNode = null; }
  private show(text: string): void { this.status = text; if (this.statusNode) this.statusNode.textContent = text; }
  private async acquire(): Promise<void> {
    if (!this.awake || this.lock || this.acquiring || document.visibilityState !== "visible") return;
    if (!("wakeLock" in window.navigator)) { this.show(t("stability.unsupported")); return; }
    this.acquiring = true;
    try {
      const lock = await window.navigator.wakeLock.request("screen");
      if (!this.awake) { await lock.release(); return; }
      this.lock = lock;
      this.show(t("stability.awakeOn"));
      lock.addEventListener("release", () => { if (this.lock === lock) { this.lock = null; this.show(t("stability.awakeReleased")); } });
    } catch { this.show(t("stability.unsupported")); }
    finally { this.acquiring = false; }
  }
  stop(): void {
    this.awake = false;
    void this.lock?.release().catch(() => {});
    this.lock = null;
    this.audio?.pause();
    this.audio?.removeAttribute("src");
    this.audio?.load();
    this.audio?.remove();
    this.audio = null;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.status = "";
  }
  build(readDiagnostics: () => string, check: () => void): HTMLElement {
    const panel = document.createElement("section"); panel.className = "settings-card";
    const heading = document.createElement("h2"); heading.textContent = t("stability.title");
    const note = document.createElement("p"); note.textContent = t("stability.help");
    const label = document.createElement("label"); label.className = "checkbox";
    const awake = document.createElement("input"); awake.type = "checkbox"; awake.checked = this.awake;
    awake.addEventListener("change", () => {
      this.awake = awake.checked;
      if (this.awake) void this.acquire();
      else { void this.lock?.release().catch(() => {}); this.lock = null; this.show(t("stability.awakeReleased")); }
    });
    label.append(awake, document.createTextNode(t("stability.awake")));
    const file = document.createElement("input"); file.type = "file"; file.accept = "audio/*"; file.setAttribute("aria-label", t("stability.file"));
    file.addEventListener("change", () => {
      const selected = file.files?.[0]; if (!selected) return;
      if (!this.audio) {
        this.audio = document.createElement("audio"); this.audio.loop = true; this.audio.preload = "none"; this.audio.hidden = true;
        this.audio.addEventListener("playing", () => this.show(t("stability.playing")));
        this.audio.addEventListener("pause", () => this.show(t("stability.paused")));
        this.audio.addEventListener("error", () => this.show(t("stability.audioError")));
        document.body.append(this.audio);
      }
      this.audio.pause();
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = URL.createObjectURL(selected);
      this.audio.src = this.objectUrl;
      this.show(t("stability.selected"));
    });
    const button = (key: Parameters<typeof t>[0], action: () => void) => {
      const element = document.createElement("button"); element.type = "button"; element.className = "button ghost"; element.textContent = t(key); element.addEventListener("click", action); return element;
    };
    const play = button("stability.play", () => {
      if (!this.audio?.src) { this.show(t("stability.selectedNeeded")); return; }
      void this.audio.play().catch(() => this.show(t("stability.audioError")));
    });
    const pause = button("stability.pause", () => this.audio?.pause());
    const status = document.createElement("p"); status.setAttribute("role", "status"); status.textContent = this.status; this.statusNode = status;
    const diagnostics = document.createElement("textarea"); diagnostics.readOnly = true; diagnostics.hidden = true; diagnostics.setAttribute("aria-label", t("stability.logs"));
    panel.append(heading, note, label, file, play, pause, status, button("stability.check", check), button("stability.logs", () => { diagnostics.hidden = false; diagnostics.value = readDiagnostics() || t("stability.empty"); }), diagnostics);
    return panel;
  }
}
