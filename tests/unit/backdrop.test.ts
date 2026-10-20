import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../../src/game/config';
import {
  buildSkyline,
  buildTokens,
  LED_MAX,
  LED_MIN,
  LED_PERIOD_MAX,
  LED_PERIOD_MIN,
  ledLevel,
  SKY_PHASES,
  skyPhaseAt,
  SKYLINE_TILE_W,
  TOKENS_TILE_W,
} from '../../src/ui/backdrop';

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
        expect(led.period).toBeGreaterThanOrEqual(LED_PERIOD_MIN);
        expect(led.period).toBeLessThanOrEqual(LED_PERIOD_MAX);
      }
    }
  });
});

describe('ledLevel', () => {
  it('glows steadily: always lit, never a step, constant under reduced motion', () => {
    const racks = buildSkyline(7);
    for (const led of racks.flatMap((r) => r.leds).slice(0, 12)) {
      let prev = ledLevel(0, led);
      for (let ms = 16; ms <= 20000; ms += 16) {
        const level = ledLevel(ms, led);
        expect(level).toBeGreaterThanOrEqual(LED_MIN);
        expect(level).toBeLessThanOrEqual(LED_MAX);
        expect(Math.abs(level - prev)).toBeLessThan(0.01);
        prev = level;
      }
      expect(ledLevel(1234, led, true)).toBe(ledLevel(9876, led, true));
    }
  });
});

describe('buildTokens', () => {
  it('keeps tokens inside the tile and clear of the ground glow', () => {
    const spots = buildTokens(3);
    expect(spots).toHaveLength(7);
    for (const t of spots) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(TOKENS_TILE_W);
      expect(t.y).toBeGreaterThanOrEqual(30);
      expect(t.y).toBeLessThanOrEqual(200);
      expect(t.bob).toBeGreaterThanOrEqual(2);
      expect(t.bob).toBeLessThanOrEqual(3);
    }
    expect(buildTokens(3)).toEqual(buildTokens(3));
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
