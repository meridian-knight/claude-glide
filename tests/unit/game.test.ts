import { describe, expect, it } from 'vitest';
import * as C from '../../src/game/config';
import {
  agentBox,
  createGame,
  flap,
  gapBounds,
  gapHeightAt,
  obstacleBoxes,
  overlaps,
  restartGame,
  speedAt,
  startGame,
  step,
  togglePause,
} from '../../src/game/game';
import { seededRng, type Rng } from '../../src/game/rng';
import type { GameState, Obstacle } from '../../src/game/types';

/** Deterministic "middle" rng: every gap lands on its previous centre. */
const mid: Rng = () => 0.5;

/** A running, armed game with the first stack still far to the right. */
function flying(rng: Rng = mid): GameState {
  return flap(startGame(createGame(), rng).state).state;
}

function stepN(state: GameState, n: number, rng: Rng = mid): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = step(s, rng).state;
  return s;
}

function stack(x: number, gapY = C.AGENT_START_Y, gapH = C.GAP_H_START, id = 99): Obstacle {
  return { id, x, gapY, gapH, passed: false };
}

/** A stack far away plus the one under test, so spawning never interferes. */
function withStacks(state: GameState, ...obstacles: Obstacle[]): GameState {
  return { ...state, obstacles: [...obstacles, stack(C.WORLD_W + 200, C.AGENT_START_Y, C.GAP_H_START, 100)] };
}

describe('createGame / startGame', () => {
  it('starts idle with the agent at rest and no stacks', () => {
    const g = createGame();
    expect(g.status).toBe('idle');
    expect(g.agent).toEqual({ x: C.AGENT_X, y: C.AGENT_START_Y, vy: 0 });
    expect(g.obstacles).toEqual([]);
    expect(g.score).toBe(0);
    expect(g.armed).toBe(false);
  });

  it('startGame runs in hover with one stack waiting off-screen', () => {
    const { state, events } = startGame(createGame(), mid);
    expect(events).toEqual(['started']);
    expect(state.status).toBe('running');
    expect(state.armed).toBe(false);
    expect(state.obstacles).toHaveLength(1);
    expect(state.obstacles[0]!.x).toBe(C.FIRST_OB_X);
    expect(state.obstacles[0]!.gapY).toBe(C.AGENT_START_Y);
  });

  it('startGame is a no-op unless idle', () => {
    const running = startGame(createGame(), mid).state;
    expect(startGame(running, mid).state).toBe(running);
  });

  it('step and flap are no-ops when idle or over', () => {
    const idle = createGame();
    expect(step(idle, mid).state).toBe(idle);
    expect(flap(idle).state).toBe(idle);
    const over: GameState = { ...flying(), status: 'over', cause: 'ground' };
    expect(step(over, mid).state).toBe(over);
    expect(flap(over).state).toBe(over);
  });
});

describe('hover', () => {
  it('moves nothing and spawns nothing until the first flap', () => {
    const start = startGame(createGame(), mid).state;
    const later = stepN(start, 300);
    expect(later.agent).toEqual(start.agent);
    expect(later.obstacles).toEqual(start.obstacles);
    expect(later.tick).toBe(300);
    expect(later.score).toBe(0);
  });

  it('the first flap arms the run and sets the flap velocity', () => {
    const start = startGame(createGame(), mid).state;
    const { state, events } = flap(start);
    expect(events).toEqual(['armed', 'flapped']);
    expect(state.armed).toBe(true);
    expect(state.agent.vy).toBe(C.FLAP_VY);
    expect(state.agent.y).toBe(C.AGENT_START_Y);
    expect(flap(state).events).toEqual(['flapped']);
  });
});

describe('flight physics', () => {
  it('integrates gravity at the fixed step', () => {
    const s0 = flying();
    const s1 = step(s0, mid).state;
    const vy = C.FLAP_VY + C.GRAVITY * C.DT;
    expect(s1.agent.vy).toBeCloseTo(vy, 9);
    expect(s1.agent.y).toBeCloseTo(C.AGENT_START_Y + vy * C.DT, 9);
    expect(s1.tick).toBe(s0.tick + 1);
  });

  it('a flap always resets the velocity, whatever the current speed', () => {
    const falling = { ...flying(), agent: { x: C.AGENT_X, y: 150, vy: C.MAX_FALL_VY } };
    expect(flap(falling).state.agent.vy).toBe(C.FLAP_VY);
    const rising = { ...flying(), agent: { x: C.AGENT_X, y: 150, vy: -100 } };
    expect(flap(rising).state.agent.vy).toBe(C.FLAP_VY);
  });

  it('caps the fall speed', () => {
    let s = { ...flying(), agent: { x: C.AGENT_X, y: 40, vy: 0 } };
    for (let i = 0; i < 70 && s.status === 'running'; i++) s = step(s, mid).state;
    expect(s.status).toBe('running');
    expect(s.agent.vy).toBe(C.MAX_FALL_VY);
  });

  it('clamps at the ceiling without ending the run', () => {
    const s = { ...flying(), agent: { x: C.AGENT_X, y: C.AGENT_H / 2 + 1, vy: C.FLAP_VY } };
    const next = step(s, mid).state;
    expect(next.status).toBe('running');
    expect(next.agent.y).toBe(C.AGENT_H / 2);
    expect(next.agent.vy).toBe(0);
  });

  it('ends the run on the ground', () => {
    const s = { ...flying(), agent: { x: C.AGENT_X, y: C.GROUND_Y - C.AGENT_H / 2 + C.HITBOX_INSET - 1, vy: 300 } };
    const { state, events } = step(s, mid);
    expect(state.status).toBe('over');
    expect(state.cause).toBe('ground');
    expect(events).toContain('over');
    expect(step(state, mid).state).toBe(state);
  });
});

describe('collisions', () => {
  it('a stack column across the agent ends the run', () => {
    const s = withStacks({ ...flying(), agent: { x: C.AGENT_X, y: 200, vy: 0 } }, stack(C.AGENT_X - 10, 60, 80));
    const { state, events } = step(s, mid);
    expect(state.status).toBe('over');
    expect(state.cause).toBe('obstacle');
    expect(events).toContain('over');
  });

  it('flying through the gap survives', () => {
    const s = withStacks({ ...flying(), agent: { x: C.AGENT_X, y: 140, vy: 0 } }, stack(C.AGENT_X - 10, 140, 100));
    expect(step(s, mid).state.status).toBe('running');
  });

  it('the hitbox is inset: a column that only grazes the sprite box is survived', () => {
    const y = 140;
    const spriteTop = y - C.AGENT_H / 2;
    const hitboxTop = spriteTop + C.HITBOX_INSET;
    // Column bottom edge 2 units into the sprite box but above the hitbox.
    const grazing = { ...stack(C.AGENT_X - 10), gapY: 0, gapH: 0 };
    const grazeBottom = spriteTop + 2;
    const survive = withStacks({ ...flying(), agent: { x: C.AGENT_X, y, vy: 0 } }, { ...grazing, gapY: grazeBottom / 2 + 200, gapH: 400 - grazeBottom });
    // The step moves the agent by vy*DT; vy starts at 0 so it drops ~0.06 units. Still above the hitbox top.
    expect(step(survive, mid).state.status).toBe('running');
    // Column bottom edge 2 units below the hitbox top: collision.
    const hitBottom = hitboxTop + 2;
    const die = withStacks({ ...flying(), agent: { x: C.AGENT_X, y, vy: 0 } }, { ...grazing, gapY: hitBottom / 2 + 200, gapH: 400 - hitBottom });
    expect(step(die, mid).state.status).toBe('over');
  });

  it('boxes that merely touch do not overlap', () => {
    expect(overlaps({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10, y0: 0, x1: 20, y1: 10 })).toBe(false);
    expect(overlaps({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 9, y0: 9, x1: 20, y1: 20 })).toBe(true);
  });

  it('exposes the boxes the renderer debug view draws', () => {
    const box = agentBox({ x: 56, y: 140, vy: 0 });
    expect(box).toEqual({ x0: 48, y0: 132, x1: 64, y1: 148 });
    const [top, bottom] = obstacleBoxes(stack(100, 150, 100));
    expect(top).toEqual({ x0: 100, y0: 0, x1: 140, y1: 100 });
    expect(bottom).toEqual({ x0: 100, y0: 200, x1: 140, y1: C.GROUND_Y });
  });
});

describe('scoring', () => {
  it('scores exactly once when a stack passes the agent', () => {
    const speed = speedAt(0);
    // After one step the stack's right edge is just left of the agent's centre.
    const x = C.AGENT_X - C.OB_W + speed * C.DT - 0.01;
    let s = withStacks({ ...flying(), agent: { x: C.AGENT_X, y: 140, vy: 0 } }, stack(x, 140, 100));
    const first = step(s, mid);
    expect(first.events.filter((e) => e === 'scored')).toHaveLength(1);
    expect(first.state.score).toBe(1);
    s = first.state;
    for (let i = 0; i < 60; i++) {
      const r = step(s, mid);
      expect(r.events).not.toContain('scored');
      s = r.state;
    }
    expect(s.score).toBe(1);
  });

  it('never scores after the run is over', () => {
    const over: GameState = { ...flying(), status: 'over', cause: 'ground', obstacles: [stack(0, 140, 100)] };
    expect(step(over, mid).state.score).toBe(0);
  });
});

describe('stacks', () => {
  it('keeps one stack beyond the right edge, spaced exactly, with gaps in bounds and reachable', () => {
    const rng = seededRng(7);
    let s = flying(rng);
    let spawns = 0;
    let steps = 0;
    while (steps < 6000 && s.status === 'running') {
      // Autopilot: aim a little below the centre of the first stack the hitbox has not cleared,
      // and only flap while falling (a flap mid-rise would overshoot).
      const next = s.obstacles.find((o) => o.x + C.OB_W > agentBox(s.agent).x0)!;
      if (s.agent.vy >= 0 && s.agent.y > next.gapY + 12) s = flap(s).state;
      const r = step(s, rng);
      s = r.state;
      steps++;
      spawns += r.events.filter((e) => e === 'spawned').length;
      expect(s.obstacles.some((o) => o.x >= C.WORLD_W)).toBe(true);
      for (let i = 1; i < s.obstacles.length; i++) {
        const a = s.obstacles[i - 1]!;
        const b = s.obstacles[i]!;
        expect(b.x - a.x).toBeCloseTo(C.OB_SPACING, 6);
        expect(Math.abs(b.gapY - a.gapY)).toBeLessThanOrEqual(C.MAX_GAP_DELTA + 1e-9);
      }
      for (const o of s.obstacles) {
        const { min, max } = gapBounds(o.gapH);
        expect(o.gapY).toBeGreaterThanOrEqual(min);
        expect(o.gapY).toBeLessThanOrEqual(max);
        expect(o.x + C.OB_W).toBeGreaterThanOrEqual(0);
      }
    }
    // The naive autopilot survives a long run: the gaps are reachable in practice.
    const where = JSON.stringify({ score: s.score, cause: s.cause, agent: s.agent, stacks: s.obstacles.slice(0, 2) });
    expect(s.status, where).toBe('running');
    expect(s.score).toBeGreaterThanOrEqual(25);
    expect(spawns).toBeGreaterThanOrEqual(25);
  });

  it('config keeps consecutive gaps reachable at top speed (closed form)', () => {
    const between = C.OB_SPACING / C.SPEED_MAX; // seconds between stacks
    const period = 0.15; // a brisk but human flap rhythm
    const climbPerFlap = -C.FLAP_VY * period - 0.5 * C.GRAVITY * period * period;
    const climb = (between / period) * climbPerFlap;
    expect(climbPerFlap).toBeGreaterThan(0);
    expect(C.MAX_GAP_DELTA).toBeLessThanOrEqual(0.7 * climb);
    // Falling covers at least as much.
    const tCap = C.MAX_FALL_VY / C.GRAVITY;
    const fall = tCap >= between ? 0.5 * C.GRAVITY * between * between : 0.5 * C.GRAVITY * tCap * tCap + C.MAX_FALL_VY * (between - tCap);
    expect(C.MAX_GAP_DELTA).toBeLessThanOrEqual(0.7 * fall);
    // Even the widest gap leaves the agent's hitbox room on both sides.
    expect(C.GAP_H_MIN).toBeGreaterThan(C.AGENT_H - 2 * C.HITBOX_INSET + 24);
  });

  it('ramps speed and gap height monotonically to their caps', () => {
    expect(speedAt(0)).toBe(C.SPEED_START);
    expect(gapHeightAt(0)).toBe(C.GAP_H_START);
    for (let s = 1; s <= 200; s++) {
      expect(speedAt(s)).toBeGreaterThanOrEqual(speedAt(s - 1));
      expect(speedAt(s)).toBeLessThanOrEqual(C.SPEED_MAX);
      expect(gapHeightAt(s)).toBeLessThanOrEqual(gapHeightAt(s - 1));
      expect(gapHeightAt(s)).toBeGreaterThanOrEqual(C.GAP_H_MIN);
    }
    expect(speedAt(1000)).toBe(C.SPEED_MAX);
    expect(gapHeightAt(1000)).toBe(C.GAP_H_MIN);
  });
});

describe('pause', () => {
  it('toggles between running and paused and freezes the state', () => {
    const s = flying();
    const paused = togglePause(s);
    expect(paused.events).toEqual(['paused']);
    expect(paused.state.status).toBe('paused');
    expect(step(paused.state, mid).state).toBe(paused.state);
    expect(flap(paused.state).state).toBe(paused.state);
    const resumed = togglePause(paused.state);
    expect(resumed.events).toEqual(['resumed']);
    expect(resumed.state.status).toBe('running');
    expect(resumed.state.agent).toEqual(s.agent);
  });

  it('is a no-op when idle or over', () => {
    const idle = createGame();
    expect(togglePause(idle).state).toBe(idle);
    const over: GameState = { ...flying(), status: 'over', cause: 'ground' };
    expect(togglePause(over).state).toBe(over);
  });
});

describe('restart', () => {
  it('starts a fresh run from game over', () => {
    const over: GameState = { ...stepN(flying(), 50), status: 'over', cause: 'obstacle', score: 9 };
    const { state, events } = restartGame(over, mid);
    expect(events).toEqual(['started']);
    expect(state.status).toBe('running');
    expect(state.armed).toBe(false);
    expect(state.score).toBe(0);
    expect(state.tick).toBe(0);
    expect(state.cause).toBeNull();
    expect(state.obstacles).toHaveLength(1);
    expect(state.agent).toEqual({ x: C.AGENT_X, y: C.AGENT_START_Y, vy: 0 });
  });

  it('is a no-op unless over', () => {
    const s = flying();
    expect(restartGame(s, mid).state).toBe(s);
    const idle = createGame();
    expect(restartGame(idle, mid).state).toBe(idle);
  });
});

describe('determinism', () => {
  it('the same seed and inputs produce the same run', () => {
    const run = (seed: number): GameState => {
      const rng = seededRng(seed);
      let s = flying(rng);
      for (let i = 0; i < 2000 && s.status === 'running'; i++) {
        if (i % 37 === 0) s = flap(s).state;
        s = step(s, rng).state;
      }
      return s;
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42).obstacles.map((o) => o.gapY)).not.toEqual(run(43).obstacles.map((o) => o.gapY));
  });
});
