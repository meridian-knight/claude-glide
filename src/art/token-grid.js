/**
 * The series' AI-chip "token" (from Claude Swarm), used here as backdrop
 * decoration. A 12×12 grid of palette keys; frame 1 is the brighter pulse.
 * Plain ESM JavaScript so the asset generator could reuse it; token-grid.d.ts
 * carries the types.
 */
export const TOKEN_PALETTE = {
  T: '#d97757', // outline / spark arms
  C: '#f3e6cf', // chip body
  H: '#fff6e6', // highlight
  P: '#9a4f36', // pins
  K: '#f7c948', // spark core
  y: '#ffd45a', // bright core (pulse frame)
  A: '#f3e6cf', // cream arms (pulse frame)
};

const SIZE = 12;

function blank() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => '.'));
}

function put(g, x, y, k) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  g[y][x] = k;
}

export function tokenGrid(frame = 0) {
  const g = blank();
  // Outline 2..9 with clipped corners.
  for (let i = 3; i <= 8; i++) {
    put(g, i, 2, 'T');
    put(g, i, 9, 'T');
    put(g, 2, i, 'T');
    put(g, 9, i, 'T');
  }
  // Body.
  for (let y = 3; y <= 8; y++) for (let x = 3; x <= 8; x++) put(g, x, y, 'C');
  put(g, 3, 3, 'H');
  put(g, 4, 3, 'H');
  put(g, 3, 4, 'H');
  // Pins: two per side.
  for (const i of [4, 7]) {
    put(g, i, 1, 'P');
    put(g, i, 10, 'P');
    put(g, 1, i, 'P');
    put(g, 10, i, 'P');
  }
  // Spark: 2x2 core with 1px arms.
  const core = frame === 1 ? 'y' : 'K';
  const arm = frame === 1 ? 'A' : 'T';
  for (const y of [5, 6]) for (const x of [5, 6]) put(g, x, y, core);
  for (const c of [5, 6]) {
    put(g, c, 3, arm);
    put(g, c, 8, arm);
    put(g, 3, c, arm);
    put(g, 8, c, arm);
  }
  return g;
}
