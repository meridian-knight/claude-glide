/**
 * The scrolling scene behind the stacks. Pure layout builders (unit-tested,
 * seeded, never the game rng) plus a class that pre-renders the static tiles
 * per resize and draws the parallax layers each frame. Every layer derives its
 * position from the renderer's scroll distance, so pausing and reduced motion
 * freeze the scene for free. Three themes exist while the owner compares them
 * (`?backdrop=dusk|tokens|minimal`); `dusk` is the default.
 */
import { seededRng } from '../game/rng';
import { TOKEN_PALETTE, tokenGrid } from '../art/token-grid';
import type { WorldFit } from './sizing';
import { paint } from './sprites';

export type BackdropTheme = 'dusk' | 'tokens' | 'minimal';
export const THEMES: readonly BackdropTheme[] = ['dusk', 'tokens', 'minimal'];

export interface Led {
  /** Offsets inside the rack, world units. */
  x: number;
  y: number;
  colour: string;
  /** Blink phase (0..1) and period in seconds. */
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
  period: number;
}

export interface Spark {
  x: number;
  y: number;
  phase: number;
}

export const SKYLINE_TILE_W = 240;
export const TOKENS_TILE_W = 480;
export const GROUND_TILE_W = 48;
const LED_COLOURS = ['#9a4f36', '#d97757', '#f3e6cf', '#d97757'];

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
        period: 1.8 + rng() * 1.4,
      });
    }
    racks.push({ x, w, h, leds });
    x += w + 2 + Math.floor(rng() * 9); // gap 2..10
  }
  return racks;
}

/** Drifting chips: positions in a 480-wide tile, clear of the ground glow. */
export function buildTokens(seed: number, count = 7): TokenSpot[] {
  const rng = seededRng(seed);
  const spots: TokenSpot[] = [];
  for (let i = 0; i < count; i++) {
    spots.push({
      x: (i + rng() * 0.8) * (TOKENS_TILE_W / count),
      y: 30 + rng() * 170, // 30..200
      bob: 2 + rng() * 2,
      phase: rng(),
      period: 3 + rng() * 2,
    });
  }
  return spots;
}

/** Tiny twinkling specks for the tokens theme. */
export function buildSparks(seed: number, count = 12): Spark[] {
  const rng = seededRng(seed);
  const sparks: Spark[] = [];
  for (let i = 0; i < count; i++) sparks.push({ x: rng() * TOKENS_TILE_W, y: 10 + rng() * 240, phase: rng() });
  return sparks;
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
  private tokenSprites: [HTMLCanvasElement, HTMLCanvasElement] | null = null;
  private tokenSpritesFar: [HTMLCanvasElement, HTMLCanvasElement] | null = null;
  readonly racks: Rack[];
  readonly tokens: TokenSpot[];
  readonly tokensFar: TokenSpot[];
  readonly sparks: Spark[];

  constructor(
    readonly theme: BackdropTheme,
    private readonly worldW: number,
    private readonly worldH: number,
    private readonly groundY: number,
  ) {
    this.racks = buildSkyline(7);
    this.tokens = buildTokens(3, theme === 'minimal' ? 4 : 7);
    this.tokensFar = buildTokens(5, 6);
    this.sparks = buildSparks(9);
  }

  /** Re-renders every static tile for a new canvas size. */
  resize(fit: WorldFit): void {
    this.fit = fit;
    const s = fit.scale;
    this.skies = SKY_PHASES.map((p) => this.makeSky(p, s));
    this.skylineTile = this.theme === 'dusk' ? this.makeSkyline(s) : null;
    this.groundTile = this.theme === 'minimal' ? null : this.makeGround(s);
    this.tokenSprites = [paint(tokenGrid(0), TOKEN_PALETTE, s), paint(tokenGrid(1), TOKEN_PALETTE, s)];
    this.tokenSpritesFar = [paint(tokenGrid(0), TOKEN_PALETTE, s * 0.66), paint(tokenGrid(1), TOKEN_PALETTE, s * 0.66)];
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
    const effective = this.theme === 'dusk' ? phase : 0;
    const previous = this.theme === 'dusk' ? prevPhase : 0;
    const x = this.fit.offsetX;
    const y = this.fit.offsetY;
    if (blend < 1 && previous !== effective) {
      ctx.drawImage(this.skies[previous]!, x, y);
      ctx.globalAlpha = blend;
      ctx.drawImage(this.skies[effective]!, x, y);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(this.skies[effective]!, x, y);
    }
  }

  /** Far racks with blinking LEDs (dusk only). */
  drawSkyline(ctx: CanvasRenderingContext2D, scrollX: number, now: number, reduced: boolean): void {
    if (!this.fit || !this.skylineTile) return;
    const s = this.fit.scale;
    const shift = (scrollX * 0.15) % SKYLINE_TILE_W;
    const tileW = this.skylineTile.width;
    const y = this.fit.offsetY;
    for (const k of [0, 1]) {
      const x = this.fit.offsetX + Math.round((k * SKYLINE_TILE_W - shift) * s);
      ctx.drawImage(this.skylineTile, x, y);
      for (const r of this.racks) {
        const top = this.groundY - r.h;
        for (const led of r.leds) {
          const on = reduced || ((now / 1000 / led.period + led.phase) % 1) < 0.55;
          ctx.fillStyle = led.colour;
          ctx.globalAlpha = on ? 0.9 : 0.18;
          const lx = x + Math.round((r.x + led.x) * s);
          const ly = y + Math.round((top + led.y) * s);
          ctx.fillRect(lx, ly, Math.max(1, Math.round(2 * s)), Math.max(1, Math.round(2 * s)));
        }
      }
      void tileW;
    }
    ctx.globalAlpha = 1;
  }

  private drawTokenLayer(
    ctx: CanvasRenderingContext2D,
    spots: TokenSpot[],
    sprites: [HTMLCanvasElement, HTMLCanvasElement],
    factor: number,
    alpha: number,
    scrollX: number,
    now: number,
    reduced: boolean,
  ): void {
    const shift = (scrollX * factor) % TOKENS_TILE_W;
    ctx.globalAlpha = alpha;
    for (const k of [0, 1]) {
      for (const t of spots) {
        const bob = reduced ? 0 : Math.sin(scrollX / 40 + t.phase * Math.PI * 2) * t.bob;
        const pulse = !reduced && ((now / 1000 + t.phase * t.period) % t.period) < 0.3 ? 1 : 0;
        ctx.drawImage(sprites[pulse]!, this.X(k * TOKENS_TILE_W + t.x - shift), this.Y(t.y + bob));
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Drifting chips; the tokens theme adds a smaller, farther layer and sparks. */
  drawTokens(ctx: CanvasRenderingContext2D, scrollX: number, now: number, reduced: boolean): void {
    if (!this.fit || !this.tokenSprites || !this.tokenSpritesFar) return;
    if (this.theme === 'tokens') {
      this.drawTokenLayer(ctx, this.tokensFar, this.tokenSpritesFar, 0.25, 0.2, scrollX, now, reduced);
      const shift = (scrollX * 0.5) % TOKENS_TILE_W;
      const s = this.fit.scale;
      for (const k of [0, 1]) {
        for (const sp of this.sparks) {
          const tw = reduced ? 0.6 : 0.3 + 0.7 * Math.abs(Math.sin(now / 900 + sp.phase * Math.PI * 2));
          ctx.globalAlpha = tw * 0.7;
          ctx.fillStyle = '#f3e6cf';
          ctx.fillRect(this.X(k * TOKENS_TILE_W + sp.x - shift), this.Y(sp.y), Math.max(1, Math.round(2 * s)), Math.max(1, Math.round(2 * s)));
        }
      }
      ctx.globalAlpha = 1;
      this.drawTokenLayer(ctx, this.tokens, this.tokenSprites, 0.6, 0.4, scrollX, now, reduced);
      return;
    }
    this.drawTokenLayer(ctx, this.tokens, this.tokenSprites, 0.45, this.theme === 'minimal' ? 0.4 : 0.45, scrollX, now, reduced);
  }

  /** Near dashes: dust (dusk, minimal) or code-like dashes of varied length (tokens). */
  drawDust(ctx: CanvasRenderingContext2D, scrollX: number): void {
    if (!this.fit) return;
    const stepX = 48;
    const stepY = 40;
    const factor = this.theme === 'minimal' ? 0.3 : this.theme === 'tokens' ? 0.5 : 0.7;
    const shift = (scrollX * factor) % stepX;
    ctx.fillStyle = '#26201a';
    for (let row = 0; row * stepY < this.groundY; row++) {
      const y = row * stepY + 12;
      const stagger = row % 2 === 0 ? 0 : stepX / 2;
      for (let col = -1; col * stepX < this.worldW + stepX; col++) {
        if (this.theme === 'dusk' && (row + col) % 3 !== 0) continue; // sparser
        const len = this.theme === 'tokens' ? 4 + ((row * 7 + col * 5) % 11) : 6;
        const x0 = this.X(col * stepX + stagger - shift);
        const y0 = this.Y(y);
        ctx.fillRect(x0, y0, this.X(col * stepX + stagger - shift + len) - x0, this.Y(y + 2) - y0);
      }
    }
  }

  /** Ground band: circuit traces (dusk, tokens) or the original dashes (minimal). */
  drawGround(ctx: CanvasRenderingContext2D, scrollX: number): void {
    if (!this.fit) return;
    const gx = this.fit.offsetX;
    const gy = this.Y(this.groundY);
    const h = this.worldH - this.groundY;
    if (this.groundTile) {
      const s = this.fit.scale;
      const shift = scrollX % GROUND_TILE_W;
      const n = Math.ceil(this.worldW / GROUND_TILE_W) + 2;
      for (let k = -1; k < n; k++) {
        ctx.drawImage(this.groundTile, gx + Math.round((k * GROUND_TILE_W - shift) * s), gy);
      }
    } else {
      ctx.fillStyle = '#241c16';
      ctx.fillRect(gx, gy, this.fit.worldPxW, this.Y(this.worldH) - gy);
      ctx.fillStyle = '#3a2d23';
      const shift = scrollX % 24;
      for (let x = -24; x < this.worldW + 24; x += 24) {
        const x0 = this.X(x - shift);
        const y0 = this.Y(this.groundY + 9);
        ctx.fillRect(x0, y0, this.X(x - shift + 12) - x0, this.Y(this.groundY + 11) - y0);
      }
    }
    void h;
    ctx.fillStyle = '#9a4f36';
    ctx.fillRect(gx, gy, this.fit.worldPxW, Math.max(1, this.Y(this.groundY + 2) - gy));
  }
}
