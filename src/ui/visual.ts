/**
 * Render-side bookkeeping that reacts to game events: short-lived animation
 * timers and the reduced-motion preference. Nothing in here feeds back into
 * game logic.
 */
import type { GameEvent, GameState } from '../game/types';

export const SHAKE_MS = 160;
/** How long the wings stay raised after a flap. */
export const FLAP_WING_MS = 130;
/** Open-mouth cheer after scoring. */
export const CHOMP_MS = 180;
/** "+1" float after scoring. */
export const SCORE_FLOAT_MS = 550;

export class VisualState {
  startedAt = Number.NEGATIVE_INFINITY;
  flappedAt = Number.NEGATIVE_INFINITY;
  scoredAt = Number.NEGATIVE_INFINITY;
  overAt: number | null = null;
  reducedMotion = false;

  constructor() {
    if (typeof window !== 'undefined' && 'matchMedia' in window) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = mq.matches;
      mq.addEventListener('change', (e) => {
        this.reducedMotion = e.matches;
      });
    }
  }

  /** Call after every state transition. */
  observe(_prev: GameState, _next: GameState, events: readonly GameEvent[], now: number): void {
    for (const event of events) {
      switch (event) {
        case 'started':
          this.startedAt = now;
          this.flappedAt = Number.NEGATIVE_INFINITY;
          this.scoredAt = Number.NEGATIVE_INFINITY;
          this.overAt = null;
          break;
        case 'flapped':
          this.flappedAt = now;
          break;
        case 'scored':
          this.scoredAt = now;
          break;
        case 'over':
          this.overAt = now;
          break;
        case 'armed':
        case 'spawned':
        case 'paused':
        case 'resumed':
          break;
      }
    }
  }
}
