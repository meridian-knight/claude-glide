/**
 * Fits a fixed logical world into a CSS box. Pure, so the rule is unit-tested
 * for the device pixel ratios phones actually use.
 *
 * The rule (inherited from Claude Swarm, where resampling dropped pixel rows on
 * phones): the canvas backing store is a whole number of device pixels and its
 * CSS box is exactly `backing / dpr` AND a whole number of CSS pixels, so the
 * canvas maps 1:1 to device pixels and is never resampled. Inside that box the
 * world is drawn at one uniform scale (fractional allowed) and letterboxed, so
 * the scene never stretches and difficulty never depends on the screen.
 */
export interface WorldFit {
  /** CSS size of the canvas box. */
  cssW: number;
  cssH: number;
  /** Backing store size in device pixels. */
  backingW: number;
  backingH: number;
  /** Device pixels per world unit, the same on both axes. */
  scale: number;
  /** Device-pixel offset of the world's top-left corner inside the backing store. */
  offsetX: number;
  offsetY: number;
  /** Size of the drawn world in device pixels. */
  worldPxW: number;
  worldPxH: number;
  /** True when both CSS sides are whole CSS pixels (the normal case). */
  wholeCss: boolean;
}

function pickSide(avail: number, dpr: number): { css: number; dev: number; whole: boolean } {
  const max = Math.max(1, Math.floor(avail));
  // Largest whole CSS size within 10% of the box whose device size is also whole
  // (e.g. multiples of 4 CSS px at 2.75x, of 8 at 2.625x). Odd ratios that allow
  // none fall back to a whole device size with a fractional CSS box.
  const lo = Math.max(1, Math.ceil(max * 0.9));
  for (let css = max; css >= lo; css--) {
    const dev = css * dpr;
    if (Math.abs(dev - Math.round(dev)) < 1e-6) return { css, dev: Math.round(dev), whole: true };
  }
  const dev = Math.max(1, Math.floor(max * dpr));
  return { css: dev / dpr, dev, whole: false };
}

export function fitWorld(availW: number, availH: number, dpr: number, worldW: number, worldH: number): WorldFit {
  const w = pickSide(availW, dpr);
  const h = pickSide(availH, dpr);
  const scale = Math.min(w.dev / worldW, h.dev / worldH);
  const worldPxW = Math.round(worldW * scale);
  const worldPxH = Math.round(worldH * scale);
  return {
    cssW: w.css,
    cssH: h.css,
    backingW: w.dev,
    backingH: h.dev,
    scale,
    offsetX: Math.floor((w.dev - worldPxW) / 2),
    offsetY: Math.floor((h.dev - worldPxH) / 2),
    worldPxW,
    worldPxH,
    wholeCss: w.whole && h.whole,
  };
}
