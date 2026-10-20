import { describe, expect, it } from 'vitest';
import { isTap, TAP_SLOP_PX } from '../../src/ui/input';

describe('isTap', () => {
  it('accepts a touch that barely moved and rejects a drag or an unknown start', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 103, y: 98 })).toBe(true);
    expect(isTap({ x: 100, y: 100 }, { x: 100 + TAP_SLOP_PX, y: 100 })).toBe(false);
    expect(isTap({ x: 100, y: 100 }, { x: 160, y: 100 })).toBe(false);
    expect(isTap(undefined, { x: 100, y: 100 })).toBe(false);
    expect(isTap({ x: 0, y: 0 }, { x: 30, y: 0 }, 40)).toBe(true);
  });
});
