/**
 * Render-side bookkeeping that reacts to game events: short-lived animation
 * timers, the sky phase crossfade and the reduced-motion preference. Nothing
 * in here feeds back into game logic.
 */
import type { GameEvent, GameState } from '../game/types';
import { skyPhaseAt } from './backdrop';

export const SHAKE_MS = 160;
/** How long the wings stay raised after a flap. */
export const FLAP_WING_MS = 130;
/** Open-mouth cheer after scoring. */
export const CHOMP_MS = 180;
/** "+1" float after scoring. */
export const SCORE_FLOAT_MS = 550;
/** "10!" float on every tenth point. */
export const MILESTONE_FLOAT_MS = 900;
/** Sky crossfade when the phase of day changes. */
export const PHASE_FADE_MS = 1500;

export class VisualState {
  startedAt = Number.NEGATIVE_INFINITY;
  flappedAt = Number.NEGATIVE_INFINITY;
  scoredAt = Number.NEGATIVE_INFINITY;
  milestoneAt = Number.NEGATIVE_INFINITY;
  overAt: number | null = null;
  phase = 0;
  prevPhase = 0;
  phaseChangedAt = Number.NEGATIVE_INFINITY;
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
  observe(_prev: GameState, next: GameState, events: readonly GameEvent[], now: number): void {
    for (const event of events) {
      switch (event) {
        case 'started':
          this.startedAt = now;
          this.flappedAt = Number.NEGATIVE_INFINITY;
          this.scoredAt = Number.NEGATIVE_INFINITY;
          this.milestoneAt = Number.NEGATIVE_INFINITY;
          this.overAt = null;
          this.phase = 0;
          this.prevPhase = 0;
          this.phaseChangedAt = Number.NEGATIVE_INFINITY;
          break;
        case 'flapped':
          this.flappedAt = now;
          break;
        case 'scored': {
          this.scoredAt = now;
          if (next.score % 10 === 0) this.milestoneAt = now;
          const phase = skyPhaseAt(next.score);
          if (phase !== this.phase) {
            this.prevPhase = this.phase;
            this.phase = phase;
            this.phaseChangedAt = now;
          }
          break;
        }
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

  /** 0..1 progress of the sky crossfade (1 when settled or under reduced motion). */
  phaseBlend(now: number): number {
    if (this.reducedMotion) return 1;
    return Math.max(0, Math.min(1, (now - this.phaseChangedAt) / PHASE_FADE_MS));
  }
}
