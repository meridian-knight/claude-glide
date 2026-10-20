/**
 * Keyboard and pointer input. One rule keeps taps from double-firing: the
 * flap surface listens to `pointerdown` only (never click, touchstart or
 * mousedown), so a touch's synthesised mouse events are simply not heard.
 *
 * Zoom is disabled on this page at the owner's request. iOS Safari zooms on a
 * double tap and, in fast two-thumb bursts, ignored `touch-action` and a
 * distance-based guard. So every `touchend` on the page is cancelled (the
 * technique FastClick used), which removes Safari's double-tap zoom and its
 * native synthesised click; taps on buttons and other click targets get a
 * synthesised click here instead. Links keep their native behaviour.
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
/** A touch that moves less than this (CSS px) between start and end is a tap. */
export const TAP_SLOP_PX = 10;

export interface TouchPoint {
  x: number;
  y: number;
}

/** True when a touch ended close to where it started (a tap, not a drag). */
export function isTap(start: TouchPoint | undefined, end: TouchPoint, slop = TAP_SLOP_PX): boolean {
  if (!start) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) < slop;
}

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

  // Touch: cancel every touchend (no double-tap zoom, no native click) and
  // synthesise the click for taps ourselves. Links are left native.
  const starts = new Map<number, TouchPoint>();
  const pressedOf = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? target.closest<HTMLElement>('button, .action') : null;
  document.addEventListener(
    'touchstart',
    (e) => {
      for (const t of Array.from(e.changedTouches)) starts.set(t.identifier, { x: t.clientX, y: t.clientY });
      const pressed = pressedOf(e.target);
      if (pressed && !(pressed as HTMLButtonElement).disabled) pressed.dataset.pressed = '';
    },
    { passive: true },
  );
  document.addEventListener(
    'touchend',
    (e) => {
      handlers.onGesture();
      const target = e.target instanceof Element ? e.target : null;
      pressedOf(target)?.removeAttribute('data-pressed');
      if (target?.closest('a')) return;
      if (e.cancelable) e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        const start = starts.get(t.identifier);
        starts.delete(t.identifier);
        if (!target || !isTap(start, { x: t.clientX, y: t.clientY })) continue;
        const button = target.closest<HTMLButtonElement>('button');
        if (button) {
          if (!button.disabled) button.click();
        } else {
          // Non-button click targets (e.g. the help dialog's backdrop) still get their click.
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }
      }
    },
    { passive: false },
  );
  document.addEventListener(
    'touchcancel',
    (e) => {
      for (const t of Array.from(e.changedTouches)) starts.delete(t.identifier);
      pressedOf(e.target)?.removeAttribute('data-pressed');
    },
    { passive: true },
  );
  // Pinch (WebKit gesture events; other engines never fire them).
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }

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
