export type Status = 'idle' | 'running' | 'paused' | 'over';

export type Cause = 'obstacle' | 'ground';

export interface Agent {
  /** Centre of the sprite box, in world units. */
  readonly x: number;
  readonly y: number;
  /** Vertical velocity in world units per second (negative is up). */
  readonly vy: number;
}

export interface Obstacle {
  readonly id: number;
  /** Left edge, in world units. */
  readonly x: number;
  /** Centre of the gap. */
  readonly gapY: number;
  readonly gapH: number;
  /** Set once the agent has passed it (scored). */
  readonly passed: boolean;
}

/** Axis-aligned box: x0/y0 inclusive top-left, x1/y1 exclusive bottom-right. */
export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Complete, serialisable game state. */
export interface GameState {
  readonly agent: Agent;
  /** Ordered by x ascending; at least one waits beyond the right edge while running. */
  readonly obstacles: readonly Obstacle[];
  readonly nextId: number;
  readonly score: number;
  readonly status: Status;
  /** Running but hovering until the first flap; nothing moves before then. */
  readonly armed: boolean;
  /** Fixed steps since the run started (hover steps included). */
  readonly tick: number;
  readonly cause: Cause | null;
}

export type GameEvent =
  | 'started'
  | 'armed'
  | 'flapped'
  | 'spawned'
  | 'scored'
  | 'paused'
  | 'resumed'
  | 'over';

export interface StepResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}
