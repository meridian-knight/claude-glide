/**
 * Keyboard and pointer input. One rule keeps taps from double-firing: the
 * flap surface listens to `pointerdown` only (never click, touchstart or
 * mousedown), so a touch's synthesised mouse events are simply not heard.
 * Utility buttons are ordinary click handlers outside the surface.
 */
export interface InputHandlers {
  /** Space / ArrowUp / W, or a pointer down on the play surface. */
  onFlap(): void;
  /** P key or the pause chip. */
  onPause(): void;
  /** Enter key: start, restart or resume. */
  onEnter(): void;
  /** The big overlay button: start, resume or restart depending on status. */
  onAction(): void;
  /** Any user gesture (used to unlock audio). */
  onGesture(): void;
  /** When true (e.g. a dialog is open) no game input is processed. */
  isBlocked(): boolean;
}

const FLAP_CODES = new Set(['Space', 'ArrowUp', 'KeyW']);
const PAUSE_CODES = new Set(['KeyP']);
const ENTER_CODES = new Set(['Enter', 'NumpadEnter']);
/** Two taps closer than this are a flap burst, never a zoom gesture. */
const DOUBLE_TAP_MS = 350;

export function bindInput(
  handlers: InputHandlers,
  elements: { surface: HTMLElement; action: HTMLButtonElement; pause: HTMLButtonElement },
): void {
  // Keys: one action per physical press. `repeat` covers OS auto-repeat; the
  // held set covers engines that omit the flag for synthetic repeats.
  const heldKeys = new Set<string>();
  const codeOf = (e: KeyboardEvent): string => (e.code === '' && e.key === ' ' ? 'Space' : e.code);
  window.addEventListener(
    'keydown',
    (e) => {
      const code = codeOf(e);
      const kind = FLAP_CODES.has(code) ? 'flap' : PAUSE_CODES.has(code) ? 'pause' : ENTER_CODES.has(code) ? 'enter' : null;
      if (!kind) return;
      if (handlers.isBlocked()) return;
      e.preventDefault(); // no page scroll on Space/ArrowUp, no button activation on Enter
      if (e.repeat || heldKeys.has(code)) return;
      heldKeys.add(code);
      handlers.onGesture();
      if (kind === 'flap') handlers.onFlap();
      else if (kind === 'pause') handlers.onPause();
      else handlers.onEnter();
    },
    { passive: false },
  );
  window.addEventListener('keyup', (e) => {
    const code = codeOf(e);
    heldKeys.delete(code);
    // Space activates a focused button on keyup; the game already used the press.
    if (code === 'Space' && !handlers.isBlocked()) e.preventDefault();
  });
  window.addEventListener('blur', () => heldKeys.clear());

  // Pointer: the whole screen frame flaps, except the overlay and its button,
  // which sit above the canvas and act through their own click handlers.
  const surface = elements.surface;
  const held = new Set<number>();
  surface.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('button, .overlay, .modal')) return;
    e.preventDefault(); // no focus change, text selection or long-press callout
    handlers.onGesture();
    if (handlers.isBlocked()) return;
    if (held.has(e.pointerId)) return;
    held.add(e.pointerId);
    handlers.onFlap();
  });
  const release = (e: PointerEvent): void => {
    held.delete(e.pointerId);
  };
  surface.addEventListener('pointerup', release);
  surface.addEventListener('pointercancel', release);
  surface.addEventListener('lostpointercapture', release);
  window.addEventListener('pointerup', release, { passive: true });
  surface.addEventListener('contextmenu', (e) => e.preventDefault());
  // Safari grants user activation for audio on pointerup/touchend rather than
  // pointerdown, so unlock again on the way up too.
  window.addEventListener('pointerup', () => handlers.onGesture(), { passive: true });
  // Older WebKit ignores touch-action for double-tap zoom: a second tap within
  // DOUBLE_TAP_MS anywhere but a button or link is cancelled here instead.
  // Flaps come from pointerdown, so nothing is lost; buttons keep their clicks.
  let lastTapEnd = Number.NEGATIVE_INFINITY;
  window.addEventListener(
    'touchend',
    (e) => {
      handlers.onGesture();
      const now = performance.now();
      const target = e.target instanceof Element ? e.target : null;
      if (now - lastTapEnd < DOUBLE_TAP_MS && e.touches.length === 0 && !target?.closest('button, a') && e.cancelable) {
        e.preventDefault();
      }
      lastTapEnd = now;
    },
    { passive: false },
  );

  elements.action.addEventListener('click', () => {
    if (handlers.isBlocked()) return;
    handlers.onGesture();
    handlers.onAction();
    elements.action.blur();
  });
  elements.pause.addEventListener('click', () => {
    if (handlers.isBlocked()) return;
    handlers.onGesture();
    handlers.onPause();
    elements.pause.blur();
  });
}
