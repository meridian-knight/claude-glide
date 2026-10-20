/**
 * The agent's 12×12 pixel grid, shared by the game (src/ui/sprites.ts) and the
 * asset generator (scripts/make-assets.mjs) so icons and the social preview can
 * never drift from the in-game art. Plain ESM JavaScript because Node runs the
 * generator directly; agent-grid.d.ts carries the types for TypeScript.
 */
export const SPRITE_PX = 12;

/** Palette keys used by the grid. */
export const PALETTE = {
  D: '#7a3b22', // body outline
  O: '#e8895f', // body fill
  L: '#f8b98e', // body highlight
  E: '#2a1810', // eyes / mouth
  M: '#160c07', // open mouth
  G: '#ffe9d6', // eye glint
  A: '#f3e6cf', // antenna
  W: '#f3e6cf', // wing
  w: '#c9b89d', // wing shade
  g: '#5a2c1a', // tucked feet
};

function blank() {
  return Array.from({ length: SPRITE_PX }, () => Array.from({ length: SPRITE_PX }, () => '.'));
}

function put(g, x, y, k) {
  if (x < 0 || y < 0 || x >= SPRITE_PX || y >= SPRITE_PX) return;
  g[y][x] = k;
}

/**
 * The flying agent: Claude Swarm's boxy orange bot with its feet tucked in and
 * a pair of small wings. `wing` 0 = wings down, 1 = wings up (mid-flap).
 * `face`: open | blink | chomp | dizzy. `gaze`: centre | up | down | left | right.
 */
export function agentGrid({ wing = 0, face = 'open', gaze = 'centre' } = {}) {
  const g = blank();

  // Body: x 1..10, y 1..8 with 1px clipped corners. Columns 0 and 11 hold the wings.
  for (let x = 2; x <= 9; x++) {
    put(g, x, 1, 'D');
    put(g, x, 8, 'D');
  }
  for (let y = 2; y <= 7; y++) {
    put(g, 1, y, 'D');
    put(g, 10, y, 'D');
    for (let x = 2; x <= 9; x++) put(g, x, y, 'O');
  }
  put(g, 2, 2, 'L');
  put(g, 3, 2, 'L');
  put(g, 2, 3, 'L');
  put(g, 5, 0, 'A'); // antenna

  // Wings: two pixels of cream with a shaded root, raised or lowered.
  for (const wx of [0, 11]) {
    if (wing === 1) {
      put(g, wx, 3, 'W');
      put(g, wx, 4, 'W');
      put(g, wx, 5, 'w');
    } else {
      put(g, wx, 5, 'w');
      put(g, wx, 6, 'W');
      put(g, wx, 7, 'W');
    }
  }

  // Eyes: 2x2 blocks at x 3-4 and 7-8, rows 3-4, shifted one pixel toward the gaze.
  let ex = 0;
  let ey = 0;
  if (face !== 'dizzy') {
    if (gaze === 'left') ex = -1;
    if (gaze === 'right') ex = 1;
    if (gaze === 'up') ey = -1;
    if (gaze === 'down') ey = 1;
  }
  if (face === 'dizzy') {
    for (const cx of [2, 6]) {
      put(g, cx, 3, 'E');
      put(g, cx + 2, 3, 'E');
      put(g, cx + 1, 4, 'E');
      put(g, cx, 5, 'E');
      put(g, cx + 2, 5, 'E');
    }
  } else if (face === 'blink') {
    for (const bx of [3, 7]) {
      put(g, bx + ex, 4 + ey, 'E');
      put(g, bx + 1 + ex, 4 + ey, 'E');
    }
  } else {
    for (const bx of [3, 7]) {
      put(g, bx + ex, 3 + ey, 'E');
      put(g, bx + 1 + ex, 3 + ey, 'E');
      put(g, bx + ex, 4 + ey, 'E');
      put(g, bx + 1 + ex, 4 + ey, 'E');
      put(g, bx + ex, 3 + ey, 'G');
    }
  }

  // Mouth.
  if (face === 'chomp') {
    for (let x = 4; x <= 7; x++) {
      put(g, x, 6, 'M');
      put(g, x, 7, 'M');
    }
  } else if (face === 'dizzy') {
    for (let x = 4; x <= 7; x++) put(g, x, 7, 'E');
  } else {
    for (let x = 4; x <= 7; x++) put(g, x, 6, 'E');
  }

  // Feet, tucked in for flight.
  put(g, 4, 9, 'g');
  put(g, 7, 9, 'g');

  return g;
}
