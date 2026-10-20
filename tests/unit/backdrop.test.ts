import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../../src/game/config';
import { buildSkyline, buildSparks, buildTokens, SKY_PHASES, skyPhaseAt, SKYLINE_TILE_W, TOKENS_TILE_W } from '../../src/ui/backdrop';

describe('buildSkyline', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(buildSkyline(7)).toEqual(buildSkyline(7));
    expect(buildSkyline(7)).not.toEqual(buildSkyline(8));
  });

  it('places racks inside the tile, standing on the ground, without overlap', () => {
    const racks = buildSkyline(7);
    expect(racks.length).toBeGreaterThanOrEqual(6);
    expect(racks.length).toBeLessThanOrEqual(14);
    for (let i = 0; i < racks.length; i++) {
      const r = racks[i]!;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(SKYLINE_TILE_W);
      expect(r.w).toBeGreaterThanOrEqual(14);
      expect(r.w).toBeLessThanOrEqual(28);
      expect(r.h).toBeGreaterThanOrEqual(36);
      expect(r.h).toBeLessThanOrEqual(110);
      expect(GROUND_Y - r.h).toBeGreaterThan(100); // skyline never climbs into the play band's upper half
      if (i > 0) expect(r.x).toBeGreaterThanOrEqual(racks[i - 1]!.x + racks[i - 1]!.w + 2);
      expect(r.leds.length).toBeGreaterThanOrEqual(2);
      expect(r.leds.length).toBeLessThanOrEqual(6);
      for (const led of r.leds) {
        expect(led.x).toBeGreaterThanOrEqual(1);
        expect(led.x + 2).toBeLessThanOrEqual(r.w);
        expect(led.y).toBeGreaterThanOrEqual(1);
        expect(led.y + 2).toBeLessThanOrEqual(r.h);
        expect(led.period).toBeGreaterThanOrEqual(1.8);
        expect(led.period).toBeLessThanOrEqual(3.2);
      }
    }
  });
});

describe('buildTokens / buildSparks', () => {
  it('keeps tokens inside the tile and clear of the ground glow', () => {
    for (const count of [4, 7]) {
      const spots = buildTokens(3, count);
      expect(spots).toHaveLength(count);
      for (const t of spots) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThan(TOKENS_TILE_W);
        expect(t.y).toBeGreaterThanOrEqual(30);
        expect(t.y).toBeLessThanOrEqual(200);
        expect(t.bob).toBeGreaterThanOrEqual(2);
        expect(t.bob).toBeLessThanOrEqual(4);
      }
    }
    expect(buildTokens(3)).toEqual(buildTokens(3));
    for (const s of buildSparks(9)) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(TOKENS_TILE_W);
      expect(s.y).toBeLessThan(GROUND_Y - 40);
    }
  });
});

describe('sky phases', () => {
  it('advance every 10 points and cycle', () => {
    expect(skyPhaseAt(0)).toBe(0);
    expect(skyPhaseAt(9)).toBe(0);
    expect(skyPhaseAt(10)).toBe(1);
    expect(skyPhaseAt(25)).toBe(2);
    expect(skyPhaseAt(30)).toBe(3);
    expect(skyPhaseAt(40)).toBe(0);
    expect(SKY_PHASES).toHaveLength(4);
  });

  it('stay dark above the horizon so the stacks keep their contrast', () => {
    const lum = (hex: string): number => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3;
    };
    for (const p of SKY_PHASES) {
      expect(lum(p.top)).toBeLessThan(40);
      expect(lum(p.mid)).toBeLessThan(48);
      expect(lum(p.glow)).toBeLessThan(100);
    }
  });
});
