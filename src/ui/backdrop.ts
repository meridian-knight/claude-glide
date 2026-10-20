/**
 * The scrolling scene behind the stacks: a data centre at dusk. Pure layout
 * builders (unit-tested, seeded, never the game rng) plus a class that
 * pre-renders the static tiles per resize and draws the parallax layers each
 * frame. Every layer derives its position from the renderer's scroll distance,
 * so pausing and reduced motion freeze the scene for free. Nothing here blinks
 * or pulses: the owner found hard on/off LEDs made the skyline look like it was
 * dropping in and out, so LEDs only drift slowly in brightness.
 */
import { seededRng } from '../game/rng';
import { TOKEN_PALETTE, tokenGrid } from '../art/token-grid';
import type { WorldFit } from './sizing';
import { paint } from './sprites';

export interface Led {
  /** Offsets inside the rack, world units. */
  x: number;
  y: number;
  colour: string;
  /** Drift phase (0..1) and period in seconds. */
  phase: number;
  period: number;
}

export interface Rack {
  x: number;
  w: number;
  h: number;
  leds: Led[];
}

export interface TokenSpot {
  x: number;
  y: number;
  bob: number;
  phase: number;
}

export const SKYLINE_TILE_W = 240;
export const TOKENS_TILE_W = 480;
export const GROUND_TILE_W = 48;
const LED_COLOURS = ['#9a4f36', '#d97757', '#f3e6cf', '#d97757'];
export const LED_MIN = 0.55;
export const LED_MAX = 0.8;
export const LED_PERIOD_MIN = 5;
export const LED_PERIOD_MAX = 9;

/** A repeating 240-wide row of rack silhouettes standing on the ground line. */
export function buildSkyline(seed: number): Rack[] {
  const rng = seededRng(seed);
  const racks: Rack[] = [];
  let x = 2 + rng() * 6;
  while (x < SKYLINE_TILE_W - 14) {
    const w = 14 + Math.floor(rng() * 15); // 14..28
    const h = 36 + Math.floor(rng() * 75); // 36..110
    if (x + w > SKYLINE_TILE_W - 2) break;
    const leds: Led[] = [];
    const count = 2 + Math.floor(rng() * 5); // 2..6
    for (let i = 0; i < count; i++) {
      leds.push({
        x: 3 + Math.floor(rng() * (w - 6)),
        y: 4 + Math.floor(rng() * (h - 8)),
        colour: LED_COLOURS[Math.floor(rng() * LED_COLOURS.length)]!,
        phase: rng(),
        period: LED_PERIOD_MIN + rng() * (LED_PERIOD_MAX - LED_PERIOD_MIN),
      });
    }
    racks.push({ x, w, h, leds });
    x += w + 2 + Math.floor(rng() * 9); // gap 2..10
  }
  return racks;
}

/** Steady glow with a slow drift: never off, never a step. */
export function ledLevel(now: number, led: Led, reduced = false): number {
  if (reduced) return (LED_MIN + LED_MAX) / 2;
  const wave = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (now / 1000 / led.period + led.phase));
  return LED_MIN + (LED_MAX - LED_MIN) * wave;
}

/** Drifting chips: positions in a 480-wide tile, clear of the ground glow. */
export function buildTokens(seed: number, count = 7): TokenSpot[] {
  const rng = seededRng(seed);
  const spots: TokenSpot[] = [];
  for (let i = 0; i < count; i++) {
    spots.push({
      x: (i + rng() * 0.8) * (TOKENS_TILE_W / count),
      y: 30 + rng() * 170, // 30..200
      bob: 2 + rng(), // 2..3
      phase: rng(),
    });
  }
  return spots;
}

/** Phase of day: top, middle and horizon colours (all dark; the glow sits low). */
export interface SkyPhase {
  name: string;
  top: string;
  mid: string;
  glow: string;
}
export const SKY_PHASES: readonly SkyPhase[] = [
  { name: 'dusk', top: '#1a1411', mid: '#221a14', glow: '#4e2c1c' },
  { name: 'night', top: '#120f0e', mid: '#171310', glow: '#2b1d17' },
  { name: 'dawn', top: '#1c1713', mid: '#2a2018', glow: '#5a3b25' },
  { name: 'day', top: '#1f1915', mid: '#2a211a', glow: '#473424' },
];

export function skyPhaseAt(score: number): number {
  return Math.floor(score / 10) % SKY_PHASES.length;
}

type Rect = (x: number, y: number, w: number, h: number, colour: string) => void;

export class Backdrop {
  private fit: WorldFit | null = null;
  private skies: HTMLCanvasElement[] = [];
  private skylineTile: HTMLCanvasElement | null = null;
  private groundTile: HTMLCanvasElement | null = null;
  private tokenSprite: HTMLCanvasElement | null = null;
  readonly racks: Rack[];
  readonly tokens: TokenSpot[];

  constructor(
    private readonly worldW: number,
    private readonly worldH: number,
    private readonly groundY: number,
  ) {
    this.racks = buildSkyline(7);
    this.tokens = buildTokens(3);
  }

  /** Re-renders every static tile for a new canvas size. */
  resize(fit: WorldFit): void {
    this.fit = fit;
    const s = fit.scale;
    this.skies = SKY_PHASES.map((p) => this.makeSky(p, s));
    this.skylineTile = this.makeSkyline(s);
    this.groundTile = this.makeGround(s);
    this.tokenSprite = paint(tokenGrid(0), TOKEN_PALETTE, s);
  }

  private X(x: number): number {
    return this.fit!.offsetX + Math.round(x * this.fit!.scale);
  }

  private Y(y: number): number {
    return this.fit!.offsetY + Math.round(y * this.fit!.scale);
  }

  /** A tile canvas of `w × h` world units at scale `s`, drawn through a rect helper. */
  private tile(w: number, h: number, s: number, draw: (rect: Rect) => void): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    const ctx = c.getContext('2d');
    if (ctx) {
      const rect: Rect = (x, y, rw, rh, colour) => {
        const x0 = Math.round(x * s);
        const y0 = Math.round(y * s);
        ctx.fillStyle = colour;
        ctx.fillRect(x0, y0, Math.round((x + rw) * s) - x0, Math.round((y + rh) * s) - y0);
      };
      draw(rect);
    }
    return c;
  }

  private makeSky(phase: SkyPhase, s: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(this.worldW * s));
    c.height = Math.max(1, Math.round(this.worldH * s));
    const ctx = c.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, Math.round(this.groundY * s));
      grad.addColorStop(0, phase.top);
      grad.addColorStop(0.55, phase.mid);
      grad.addColorStop(0.86, phase.mid);
      grad.addColorStop(1, phase.glow);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }

  private makeSkyline(s: number): HTMLCanvasElement {
    return this.tile(SKYLINE_TILE_W, this.groundY, s, (rect) => {
      for (const r of this.racks) {
        const top = this.groundY - r.h;
        rect(r.x, top, r.w, r.h, '#211a15');
        rect(r.x, top, r.w, 1, '#2d241c');
        rect(r.x + 1, top + 1, r.w - 2, 1, '#191310');
        // Shelf lines every 10 units.
        for (let y = top + 10; y < this.groundY - 2; y += 10) rect(r.x + 2, y, r.w - 4, 1, '#1a1511');
      }
    });
  }

  private makeGround(s: number): HTMLCanvasElement {
    const h = this.worldH - this.groundY;
    return this.tile(GROUND_TILE_W, h, s, (rect) => {
      rect(0, 0, GROUND_TILE_W, h, '#241c16');
      // Circuit traces with pads and a stub, in the bezel tones.
      rect(0, 9, 30, 2, '#3a2d23');
      rect(34, 9, 14, 2, '#3a2d23');
      rect(6, 8, 4, 4, '#4d3c2f');
      rect(38, 8, 4, 4, '#4d3c2f');
      rect(22, 11, 2, 6, '#3a2d23');
      rect(14, 17, 34, 2, '#3a2d23');
      rect(20, 16, 4, 4, '#4d3c2f');
    });
  }

  /** Sky gradient, crossfading from `prevPhase` to `phase` by `blend` (0..1). */
  drawSky(ctx: CanvasRenderingContext2D, phase: number, prevPhase: number, blend: number): void {
    if (!this.fit) return;
    const x = this.fit.offsetX;
    const y = this.fit.offsetY;
    if (blend < 1 && prevPhase !== phase) {
      ctx.drawImage(this.skies[prevPhase]!, x, y);
      ctx.globalAlpha = blend;
      ctx.drawImage(this.skies[phase]!, x, y);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(this.skies[phase]!, x, y);
    }
  }

  /** Far racks with steadily glowing LEDs. */
  drawSkyline(ctx: CanvasRenderingContext2D, scrollX: number, now: number, reduced: boolean): void {
    if (!this.fit || !this.skylineTile) return;
    const s = this.fit.scale;
    const shift = (scrollX * 0.15) % SKYLINE_TILE_W;
    const y = this.fit.offsetY;
    const ledPx = Math.max(1, Math.round(2 * s));
    for (const k of [0, 1]) {
      const x = this.fit.offsetX + Math.round((k * SKYLINE_TILE_W - shift) * s);
      ctx.drawImage(this.skylineTile, x, y);
      for (const r of this.racks) {
        const top = this.groundY - r.h;
        for (const led of r.leds) {
          ctx.fillStyle = led.colour;
          ctx.globalAlpha = ledLevel(now, led, reduced);
          ctx.fillRect(x + Math.round((r.x + led.x) * s), y + Math.round((top + led.y) * s), ledPx, ledPx);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Drifting chips at a middle depth, dim and unpulsed. */
  drawTokens(ctx: CanvasRenderingContext2D, scrollX: number, reduced: boolean): void {
    if (!this.fit || !this.tokenSprite) return;
    const shift = (scrollX * 0.45) % TOKENS_TILE_W;
    ctx.globalAlpha = 0.4;
    for (const k of [0, 1]) {
      for (const t of this.tokens) {
        const bob = reduced ? 0 : Math.sin(scrollX / 60 + t.phase * Math.PI * 2) * t.bob;
        ctx.drawImage(this.tokenSprite, this.X(k * TOKENS_TILE_W + t.x - shift), this.Y(t.y + bob));
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Near dust: a sparse grid of faint dashes. */
  drawDust(ctx: CanvasRenderingContext2D, scrollX: number): void {
    if (!this.fit) return;
    const stepX = 48;
    const stepY = 40;
    const shift = (scrollX * 0.7) % stepX;
    ctx.fillStyle = '#26201a';
    for (let row = 0; row * stepY < this.groundY; row++) {
      const y = row * stepY + 12;
      const stagger = row % 2 === 0 ? 0 : stepX / 2;
      for (let col = -1; col * stepX < this.worldW + stepX; col++) {
        if ((row + col) % 3 !== 0) continue;
        const x0 = this.X(col * stepX + stagger - shift);
        const y0 = this.Y(y);
        ctx.fillRect(x0, y0, this.X(col * stepX + stagger - shift + 6) - x0, this.Y(y + 2) - y0);
      }
    }
  }

  /** Ground band: circuit traces scrolling with the stacks, under an orange-deep line. */
  drawGround(ctx: CanvasRenderingContext2D, scrollX: number): void {
    if (!this.fit || !this.groundTile) return;
    const s = this.fit.scale;
    const gx = this.fit.offsetX;
    const gy = this.Y(this.groundY);
    const shift = scrollX % GROUND_TILE_W;
    const n = Math.ceil(this.worldW / GROUND_TILE_W) + 2;
    for (let k = -1; k < n; k++) {
      ctx.drawImage(this.groundTile, gx + Math.round((k * GROUND_TILE_W - shift) * s), gy);
    }
    ctx.fillStyle = '#9a4f36';
    ctx.fillRect(gx, gy, this.fit.worldPxW, Math.max(1, this.Y(this.groundY + 2) - gy));
  }
}
