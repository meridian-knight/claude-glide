/**
 * Pure game logic. No DOM, no timers, no randomness except the injected `Rng`.
 * Every function returns a new state; nothing is mutated. `step` advances
 * exactly one fixed step of DT seconds; the caller owns the clock.
 */
import * as C from './config';
import { defaultRng, type Rng } from './rng';
import type { Agent, Box, Cause, GameEvent, GameState, Obstacle, StepResult } from './types';

const none = (state: GameState): StepResult => ({ state, events: [] });

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function createGame(): GameState {
  return {
    agent: { x: C.AGENT_X, y: C.AGENT_START_Y, vy: 0 },
    obstacles: [],
    nextId: 1,
    score: 0,
    status: 'idle',
    armed: false,
    tick: 0,
    cause: null,
    lastDeltas: [],
  };
}

/** Scroll speed at a given score: a capped linear ramp. */
export function speedAt(score: number): number {
  return Math.min(C.SPEED_MAX, C.SPEED_START + score * C.SPEED_PER_POINT);
}

/** Gap height at a given score: shrinks linearly down to a floor. */
export function gapHeightAt(score: number): number {
  return Math.max(C.GAP_H_MIN, C.GAP_H_START - score * C.GAP_SHRINK_PER_POINT);
}

/** Allowed range for a gap centre of height `gapH`. */
export function gapBounds(gapH: number): { min: number; max: number } {
  return { min: C.GAP_MARGIN + gapH / 2, max: C.GROUND_Y - C.GAP_MARGIN - gapH / 2 };
}

/** The agent's hitbox: the sprite box inset by HITBOX_INSET on every side. */
export function agentBox(agent: Agent): Box {
  return {
    x0: agent.x - C.AGENT_W / 2 + C.HITBOX_INSET,
    y0: agent.y - C.AGENT_H / 2 + C.HITBOX_INSET,
    x1: agent.x + C.AGENT_W / 2 - C.HITBOX_INSET,
    y1: agent.y + C.AGENT_H / 2 - C.HITBOX_INSET,
  };
}

/** The two solid columns of a stack: above the gap and below it (down to the ground). */
export function obstacleBoxes(ob: Obstacle): [Box, Box] {
  return [
    { x0: ob.x, y0: 0, x1: ob.x + C.OB_W, y1: ob.gapY - ob.gapH / 2 },
    { x0: ob.x, y0: ob.gapY + ob.gapH / 2, x1: ob.x + C.OB_W, y1: C.GROUND_Y },
  ];
}

/** Strict overlap: boxes that merely touch do not collide. */
export function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/** The first stack: fixed distance, gap close to the agent's start height, no jitter. */
function firstStack(id: number, rng: Rng): Obstacle {
  const gapH = gapHeightAt(0);
  const { min, max } = gapBounds(gapH);
  const gapY = clamp(C.AGENT_START_Y + (rng() * 2 - 1) * C.FIRST_GAP_DELTA, min, max);
  return { id, x: C.FIRST_OB_X, gapY, gapH, passed: false };
}

/**
 * The stack after `prev`. Spacing, gap height and the size of the gap-centre
 * move are all drawn per stack; the move is never smaller than MIN_GAP_DELTA,
 * never larger than GAP_REACH × spacing (so it stays reachable), flips
 * direction after two moves the same way, and reflects off the top and bottom
 * bounds instead of flattening against them.
 */
export function nextStack(
  prev: Obstacle,
  lastDeltas: readonly number[],
  id: number,
  score: number,
  rng: Rng,
): { obstacle: Obstacle; delta: number } {
  const spacing = C.OB_SPACING_MIN + rng() * (C.OB_SPACING_MAX - C.OB_SPACING_MIN);
  const gapH = Math.max(C.GAP_H_FLOOR, gapHeightAt(score) + C.GAP_JITTER_MIN + rng() * (C.GAP_JITTER_MAX - C.GAP_JITTER_MIN));
  const magnitude = C.MIN_GAP_DELTA + rng() * (C.GAP_REACH * spacing - C.MIN_GAP_DELTA);
  let sign = rng() < 0.5 ? -1 : 1;
  if (lastDeltas.length >= 2) {
    const a = Math.sign(lastDeltas[lastDeltas.length - 2]!);
    const b = Math.sign(lastDeltas[lastDeltas.length - 1]!);
    if (a !== 0 && a === b && rng() < C.GAP_SAME_DIR_FLIP) sign = -a;
  }
  const { min, max } = gapBounds(gapH);
  let gapY = prev.gapY + sign * magnitude;
  if (gapY < min || gapY > max) gapY = prev.gapY - sign * magnitude;
  gapY = clamp(gapY, min, max);
  return { obstacle: { id, x: prev.x + spacing, gapY, gapH, passed: false }, delta: gapY - prev.gapY };
}

/** idle → running (hovering until the first flap), with the first stack waiting off-screen. */
export function startGame(state: GameState, rng: Rng = defaultRng): StepResult {
  if (state.status !== 'idle') return none(state);
  const first = firstStack(state.nextId, rng);
  return {
    state: { ...state, status: 'running', armed: false, obstacles: [first], nextId: state.nextId + 1, lastDeltas: [] },
    events: ['started'],
  };
}

/** over → a fresh run. */
export function restartGame(state: GameState, rng: Rng = defaultRng): StepResult {
  if (state.status !== 'over') return none(state);
  return startGame(createGame(), rng);
}

export function togglePause(state: GameState): StepResult {
  if (state.status === 'running') return { state: { ...state, status: 'paused' }, events: ['paused'] };
  if (state.status === 'paused') return { state: { ...state, status: 'running' }, events: ['resumed'] };
  return none(state);
}

/** Sets the upward velocity. The first flap of a run also arms it (ends the hover). */
export function flap(state: GameState): StepResult {
  if (state.status !== 'running') return none(state);
  const events: GameEvent[] = state.armed ? ['flapped'] : ['armed', 'flapped'];
  return { state: { ...state, armed: true, agent: { ...state.agent, vy: C.FLAP_VY } }, events };
}

/** One fixed step of DT seconds. Does nothing unless running; only counts ticks while hovering. */
export function step(state: GameState, rng: Rng = defaultRng): StepResult {
  if (state.status !== 'running') return none(state);
  if (!state.armed) return { state: { ...state, tick: state.tick + 1 }, events: [] };
  const events: GameEvent[] = [];

  // Agent: semi-implicit Euler, fall speed capped, ceiling clamps without killing.
  let vy = Math.min(C.MAX_FALL_VY, state.agent.vy + C.GRAVITY * C.DT);
  let y = state.agent.y + vy * C.DT;
  if (y - C.AGENT_H / 2 < 0) {
    y = C.AGENT_H / 2;
    vy = 0;
  }
  const agent: Agent = { x: state.agent.x, y, vy };

  // Stacks scroll left; one that leaves the screen is dropped; passing one scores once.
  const speed = speedAt(state.score);
  let score = state.score;
  const obstacles: Obstacle[] = [];
  for (const ob of state.obstacles) {
    const x = ob.x - speed * C.DT;
    if (x + C.OB_W < 0) continue;
    let passed = ob.passed;
    if (!passed && x + C.OB_W <= agent.x) {
      passed = true;
      score++;
      events.push('scored');
    }
    obstacles.push({ ...ob, x, passed });
  }

  // Keep one stack waiting beyond the right edge, spaced from the previous one.
  let nextId = state.nextId;
  let lastDeltas = state.lastDeltas;
  let guard = 0;
  while (!obstacles.some((o) => o.x >= C.WORLD_W) && guard++ < 8) {
    const last = obstacles.length > 0 ? obstacles[obstacles.length - 1]! : null;
    if (last) {
      const { obstacle, delta } = nextStack(last, lastDeltas, nextId++, score, rng);
      obstacles.push(obstacle);
      lastDeltas = [...lastDeltas.slice(-1), delta];
    } else {
      obstacles.push(firstStack(nextId++, rng));
      lastDeltas = [];
    }
    events.push('spawned');
  }

  // Collision last, against the moved stacks and the ground.
  const box = agentBox(agent);
  let cause: Cause | null = null;
  if (box.y1 > C.GROUND_Y) {
    cause = 'ground';
  } else {
    for (const ob of obstacles) {
      if (ob.x >= box.x1 || ob.x + C.OB_W <= box.x0) continue;
      const [top, bottom] = obstacleBoxes(ob);
      if (overlaps(box, top) || overlaps(box, bottom)) {
        cause = 'obstacle';
        break;
      }
    }
  }
  if (cause) events.push('over');

  return {
    state: {
      ...state,
      agent,
      obstacles,
      nextId,
      score,
      tick: state.tick + 1,
      status: cause ? 'over' : 'running',
      cause,
      lastDeltas,
    },
    events,
  };
}
