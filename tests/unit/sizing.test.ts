import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W } from '../../src/game/config';
import { fitWorld } from '../../src/ui/sizing';

const DPRS = [1, 1.5, 2, 2.625, 2.75, 3];
const BOXES: [number, number][] = [
  [336, 453], // Pixel 7 portrait content box
  [299, 399], // iPhone SE
  [404, 539], // desktop 1280x800
  [184, 251], // iPhone SE landscape
  [241.5, 322.7], // fractional CSS box
];

describe('fitWorld', () => {
  it('maps 1:1 with whole CSS pixels for the ratios phones use', () => {
    for (const dpr of DPRS) {
      for (const [w, h] of BOXES) {
        const f = fitWorld(w, h, dpr, WORLD_W, WORLD_H);
        expect(Number.isInteger(f.backingW)).toBe(true);
        expect(Number.isInteger(f.backingH)).toBe(true);
        expect(f.cssW * dpr).toBeCloseTo(f.backingW, 6);
        expect(f.cssH * dpr).toBeCloseTo(f.backingH, 6);
        expect(f.wholeCss).toBe(true);
        expect(Number.isInteger(f.cssW)).toBe(true);
        expect(Number.isInteger(f.cssH)).toBe(true);
        expect(f.cssW).toBeLessThanOrEqual(Math.floor(w));
        expect(f.cssH).toBeLessThanOrEqual(Math.floor(h));
        expect(f.cssW).toBeGreaterThanOrEqual(Math.floor(w) * 0.9 - 1);
        expect(f.cssH).toBeGreaterThanOrEqual(Math.floor(h) * 0.9 - 1);
      }
    }
  });

  it('scales the world uniformly and letterboxes the rest', () => {
    for (const dpr of DPRS) {
      for (const [w, h] of BOXES) {
        const f = fitWorld(w, h, dpr, WORLD_W, WORLD_H);
        expect(f.scale).toBeGreaterThan(0);
        expect(Math.abs(f.worldPxW / WORLD_W - f.worldPxH / WORLD_H)).toBeLessThanOrEqual(1 / WORLD_W);
        expect(f.worldPxW).toBeLessThanOrEqual(f.backingW);
        expect(f.worldPxH).toBeLessThanOrEqual(f.backingH);
        expect(f.offsetX).toBeGreaterThanOrEqual(0);
        expect(f.offsetY).toBeGreaterThanOrEqual(0);
        expect(f.offsetX + f.worldPxW).toBeLessThanOrEqual(f.backingW);
        expect(f.offsetY + f.worldPxH).toBeLessThanOrEqual(f.backingH);
        // One axis always fills the box (the other is letterboxed).
        expect(Math.min(f.backingW - f.worldPxW, f.backingH - f.worldPxH)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('fills a 3:4 box with at most a sliver of letterbox', () => {
    const f = fitWorld(336, 448, 2.625, WORLD_W, WORLD_H);
    expect(f.backingW).toBe(882);
    expect(f.backingH).toBe(1176);
    expect(f.offsetX).toBe(0);
    expect(f.offsetY).toBe(0);
    expect(f.scale).toBeCloseTo(3.675, 9);
  });

  it('never produces a zero or negative size', () => {
    const f = fitWorld(0, 0, 2, WORLD_W, WORLD_H);
    expect(f.backingW).toBeGreaterThanOrEqual(1);
    expect(f.backingH).toBeGreaterThanOrEqual(1);
    expect(f.scale).toBeGreaterThan(0);
  });
});
