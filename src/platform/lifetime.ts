type LifecycleEvents = GlobalEventHandlersEventMap & WindowEventMap & DocumentEventMap;
/** Owns page-instance listeners and timers without owning the network session. */
export class Lifetime {
  private cleanup = new Set<() => void>();
  disposed = false;
  add(dispose: (() => void) | void): void {
    if (!dispose) return;
    if (this.disposed) dispose(); else this.cleanup.add(dispose);
  }
  listen<K extends keyof LifecycleEvents>(target: EventTarget, type: K, listener: (event: LifecycleEvents[K]) => void, options: boolean | AddEventListenerOptions = false): void {
    target.addEventListener(type, listener as EventListener, options);
    this.add(() => target.removeEventListener(type, listener as EventListener, options));
  }
  timeout(callback: () => void, delay: number): number {
    if (this.disposed) return 0;
    const cancel = () => window.clearTimeout(id);
    const id = window.setTimeout(() => { this.cleanup.delete(cancel); if (!this.disposed) callback(); }, delay);
    this.add(cancel);
    return id;
  }
  interval(callback: () => void, delay: number): void {
    if (this.disposed) return;
    const id = window.setInterval(callback, delay);
    this.add(() => window.clearInterval(id));
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const dispose of this.cleanup) dispose();
    this.cleanup.clear();
  }
}
