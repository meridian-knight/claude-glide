import { describe, expect, it } from 'vitest';
import { agentGrid, PALETTE, SPRITE_PX } from '../../src/art/agent-grid';
import { pixelEdges } from '../../src/ui/sprites';

describe('pixelEdges', () => {
  it('reproduces plain integer scales', () => {
    for (const scale of [1, 2, 3, 4]) {
      const edges = pixelEdges(scale);
      expect(edges).toEqual(Array.from({ length: SPRITE_PX + 1 }, (_, i) => i * scale));
    }
  });

  it('covers exactly round(12 × scale) device pixels at fractional scales', () => {
    for (const scale of [46 / 12, 44 / 12, 22 / 12, 15 / 12, 2.5, 7.35]) {
      const edges = pixelEdges(scale);
      expect(edges).toHaveLength(SPRITE_PX + 1);
      expect(edges[0]).toBe(0);
      expect(edges[SPRITE_PX]).toBe(Math.round(SPRITE_PX * scale));
      const widths = edges.slice(1).map((e, i) => e - edges[i]!);
      expect(Math.min(...widths)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(Math.round(SPRITE_PX * scale));
    }
  });
});

describe('agentGrid', () => {
  it('is a 12×12 grid whose keys are all in the palette', () => {
    for (const wing of [0, 1] as const) {
      for (const face of ['open', 'blink', 'chomp', 'dizzy'] as const) {
        for (const gaze of ['centre', 'up', 'down', 'left', 'right'] as const) {
          const g = agentGrid({ wing, face, gaze });
          expect(g).toHaveLength(SPRITE_PX);
          for (const row of g) {
            expect(row).toHaveLength(SPRITE_PX);
            for (const key of row) expect(key === '.' || key in PALETTE).toBe(true);
          }
        }
      }
    }
  });

  it('moves the wings between frames and keeps the face in place', () => {
    const down = agentGrid({ wing: 0 });
    const up = agentGrid({ wing: 1 });
    expect(down[7]![0]).toBe('W');
    expect(up[7]![0]).toBe('.');
    expect(up[3]![0]).toBe('W');
    expect(down[3]![0]).toBe('.');
    // Eyes unchanged between wing frames.
    for (const y of [3, 4]) expect(down[y]!.slice(1, 11)).toEqual(up[y]!.slice(1, 11));
  });
});
