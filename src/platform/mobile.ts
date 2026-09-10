/** Match the responsive layout, not a browser's user-agent string. */
export function isMobileLayout(): boolean {
  return window.matchMedia("(max-width: 760px)").matches;
}

/** Horizontal page gestures leave vertical scrolling and pinch zoom to the browser. */
export function bindPageSwipe(element: HTMLElement, turn: (delta: number) => void): void {
  let start: { x: number; y: number; id: number } | null = null;
  element.addEventListener("touchstart", event => {
    const touch = event.touches[0];
    start = isMobileLayout() && event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY, id: touch.identifier } : null;
  }, { passive: true });
  element.addEventListener("touchcancel", () => { start = null; }, { passive: true });
  element.addEventListener("touchend", event => {
    const origin = start; start = null;
    if (!origin || event.touches.length) return;
    const touch = Array.from(event.changedTouches).find(item => item.identifier === origin.id);
    if (!touch) return;
    const dx = touch.clientX - origin.x, dy = touch.clientY - origin.y;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      event.preventDefault(); // A swipe must not also activate the join button beneath it.
      turn(dx < 0 ? 1 : -1);
    }
  }, { passive: false });
}
