import * as C from '../game/config';
import { agentBox, obstacleBoxes, speedAt } from '../game/game';
import type { GameState, Obstacle } from '../game/types';
import { Backdrop, type BackdropTheme } from './backdrop';
import { fitWorld, type WorldFit } from './sizing';
import { agentSprite, type Face, type Gaze, type Wing } from './sprites';
import { CHOMP_MS, FLAP_WING_MS, MILESTONE_FLOAT_MS, SCORE_FLOAT_MS, SHAKE_MS, type VisualState } from './visual';

const COLOURS = {
  well: '#120e0b',
  screen: '#1c1712',
  blockEdge: '#9a4f36',
  blockHot: '#d97757',
  blockFill: '#f3e6cf',
  blockLight: '#fff6e6',
  pin: '#d97757',
  spark: '#f7c948',
  hotBand: '#f4a97a',
  text: '#f3e6cf',
  milestone: '#f4a97a',
  debugAgent: '#7cfc00',
  debugObstacle: '#ff5252',
  debugGap: 'rgba(124, 252, 0, 0.12)',
};

/** Each stack is a column of chip blocks this tall (world units), built out from the gap. */
const BLOCK_H = 20;
/** Blink timing on the fixed-step clock (deterministic): 100 ms every 1.5 s. */
const BLINK_PERIOD = 180;
const BLINK_TICKS = 12;
const VIGNETTE_IDLE = 0.5;
const VIGNETTE_PLAY = 0.3;
const VIGNETTE_FADE_MS = 300;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private fit: WorldFit;
  private dpr = 1;
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private vignette: HTMLCanvasElement | null = null;
  private readonly backdrop: Backdrop;
  /** Background scroll in world units (render-only; drives the parallax). */
  private scrollX = 0;
  private lastDrawAt = -1;
  /** Where the agent sprite was last drawn, in CSS px relative to the canvas (for tests). */
  lastAgentCss: { x: number; y: number; size: number } = { x: 0, y: 0, size: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly debug = false,
    theme: BackdropTheme = 'dusk',
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.backdrop = new Backdrop(theme, C.WORLD_W, C.WORLD_H, C.GROUND_Y);
    this.fit = fitWorld(canvas.clientWidth || 300, canvas.clientHeight || 400, 1, C.WORLD_W, C.WORLD_H);
    this.resize(canvas.clientWidth || 300, canvas.clientHeight || 400);
  }

  get theme(): BackdropTheme {
    return this.backdrop.theme;
  }

  /**
   * Sizes the canvas to the frame's content box (`availableW × availableH`
   * CSS px): a 1:1, whole-pixel backing store (see sizing.ts) with the world
   * drawn inside it at one uniform scale and letterboxed. Resizing never
   * touches game state.
   */
  resize(availableW: number, availableH: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this.fit = fitWorld(Math.max(1, availableW), Math.max(1, availableH), dpr, C.WORLD_W, C.WORLD_H);
    this.canvas.width = this.fit.backingW;
    this.canvas.height = this.fit.backingH;
    this.canvas.style.width = `${this.fit.cssW}px`;
    this.canvas.style.height = `${this.fit.cssH}px`;
    this.cache.clear();
    this.vignette = this.buildVignette();
    this.backdrop.resize(this.fit);
  }

  /** Sizing facts for tests and the ?debug overlay. */
  boardMetrics(): {
    world: [number, number];
    backing: [number, number];
    box: [number, number];
    dpr: number;
    scale: number;
    letterbox: [number, number];
    worldBoxCss: [number, number];
    wholeCss: boolean;
    oneToOne: boolean;
    uniform: boolean;
  } {
    const b = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const f = this.fit;
    return {
      world: [C.WORLD_W, C.WORLD_H],
      backing: [this.canvas.width, this.canvas.height],
      box: [b.width, b.height],
      dpr,
      scale: f.scale,
      letterbox: [f.offsetX, f.offsetY],
      worldBoxCss: [f.worldPxW / dpr, f.worldPxH / dpr],
      wholeCss: f.wholeCss,
      // Layout rects are reported at 1/64 CSS px, so allow that much (×dpr) slack.
      oneToOne: Math.abs(b.width * dpr - this.canvas.width) < 0.05 && Math.abs(b.height * dpr - this.canvas.height) < 0.05,
      // One scale for both axes; the drawn world can only differ by rounding.
      uniform: Math.abs(f.worldPxW / C.WORLD_W - f.worldPxH / C.WORLD_H) <= 1 / Math.min(C.WORLD_W, C.WORLD_H),
    };
  }

  private buildVignette(): HTMLCanvasElement | null {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const cx = c.width / 2;
    const cy = c.height / 2;
    const r = Math.max(c.width, c.height);
    const grad = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r * 0.8);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  private sprite(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
    let s = this.cache.get(key);
    if (!s) {
      s = make();
      this.cache.set(key, s);
    }
    return s;
  }

  /** World x → device px (rounded, so adjacent rects tile exactly). */
  private X(x: number): number {
    return this.fit.offsetX + Math.round(x * this.fit.scale);
  }

  private Y(y: number): number {
    return this.fit.offsetY + Math.round(y * this.fit.scale);
  }

  private rect(x: number, y: number, w: number, h: number, colour: string): void {
    const x0 = this.X(x);
    const y0 = this.Y(y);
    this.ctx.fillStyle = colour;
    this.ctx.fillRect(x0, y0, this.X(x + w) - x0, this.Y(y + h) - y0);
  }

  private drawBlock(x: number, y: number, hotEdge: 'top' | 'bottom' | null): void {
    this.rect(x, y, C.OB_W, BLOCK_H, hotEdge ? COLOURS.blockHot : COLOURS.blockEdge);
    this.rect(x + 2, y + 2, C.OB_W - 4, BLOCK_H - 4, COLOURS.blockFill);
    this.rect(x + 2, y + 2, C.OB_W - 4, 2, COLOURS.blockLight);
    this.rect(x + 2, y + 2, 2, BLOCK_H - 4, COLOURS.blockLight);
    // Two connector pins and a spark, so the blocks read as the series' AI chips.
    this.rect(x + 8, y + 8, 4, 4, COLOURS.pin);
    this.rect(x + C.OB_W - 12, y + 8, 4, 4, COLOURS.pin);
    this.rect(x + C.OB_W / 2 - 2, y + 8, 4, 4, COLOURS.spark);
    if (hotEdge === 'bottom') this.rect(x, y + BLOCK_H - 2, C.OB_W, 2, COLOURS.hotBand);
    if (hotEdge === 'top') this.rect(x, y, C.OB_W, 2, COLOURS.hotBand);
  }

  /** A stack: blocks stacked away from the gap, so the block at the gap edge is always whole. */
  private drawStack(ob: Obstacle): void {
    const gapTop = ob.gapY - ob.gapH / 2;
    const gapBottom = ob.gapY + ob.gapH / 2;
    let first = true;
    for (let y = gapTop - BLOCK_H; y + BLOCK_H > 0; y -= BLOCK_H) {
      this.drawBlock(ob.x, y, first ? 'bottom' : null);
      first = false;
    }
    first = true;
    for (let y = gapBottom; y < C.GROUND_Y; y += BLOCK_H) {
      this.drawBlock(ob.x, y, first ? 'top' : null);
      first = false;
    }
  }

  draw(state: GameState, visual: VisualState, now: number): void {
    const { ctx } = this;
    const f = this.fit;
    const reduced = visual.reducedMotion;
    const dtMs = this.lastDrawAt < 0 ? 0 : Math.min(100, now - this.lastDrawAt);
    this.lastDrawAt = now;
    const flying = state.status === 'running' && state.armed;
    if (flying && !reduced) this.scrollX += (speedAt(state.score) * dtMs) / 1000;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Death shake: a couple of pixels for a few frames, never under reduced motion.
    if (visual.overAt !== null && !reduced && now - visual.overAt < SHAKE_MS) {
      const k = 1 - (now - visual.overAt) / SHAKE_MS;
      const amp = 2 * f.scale * k;
      ctx.translate(Math.round(Math.sin(now * 0.09) * amp), Math.round(Math.cos(now * 0.13) * amp));
    }

    // Letterbox bars read as bezel; the world itself starts with the sky.
    ctx.fillStyle = COLOURS.well;
    ctx.fillRect(-4, -4, this.canvas.width + 8, this.canvas.height + 8);
    ctx.save();
    ctx.beginPath();
    ctx.rect(f.offsetX, f.offsetY, f.worldPxW, f.worldPxH);
    ctx.clip();
    this.rect(0, 0, C.WORLD_W, C.WORLD_H, COLOURS.screen);

    // Backdrop layers, far to near.
    this.backdrop.drawSky(ctx, visual.phase, visual.prevPhase, visual.phaseBlend(now));
    this.backdrop.drawSkyline(ctx, this.scrollX, now, reduced);
    this.backdrop.drawTokens(ctx, this.scrollX, now, reduced);
    this.backdrop.drawDust(ctx, this.scrollX);

    for (const ob of state.obstacles) this.drawStack(ob);

    this.backdrop.drawGround(ctx, this.scrollX);

    // Agent.
    const agent = state.agent;
    let ay = agent.y;
    let face: Face = 'open';
    let gaze: Gaze = 'right';
    let wing: Wing = 0;
    if (state.status === 'over') {
      face = 'dizzy';
      if (visual.overAt !== null && !reduced) {
        // Render-only tumble to the ground; the sim is frozen at the collision.
        const t = (now - visual.overAt) / 1000;
        ay = Math.min(C.GROUND_Y - C.AGENT_H / 2 + C.HITBOX_INSET, agent.y + agent.vy * t + 0.5 * C.GRAVITY * t * t);
      }
    } else {
      if (!state.armed) {
        if (!reduced) {
          ay += Math.sin((state.tick / C.STEP_HZ) * Math.PI * 2 * C.HOVER_BOB_HZ) * C.HOVER_BOB_AMP;
          wing = Math.floor(now / 300) % 2 === 0 ? 0 : 1;
        }
      } else {
        if (agent.vy < -60) gaze = 'up';
        else if (agent.vy > 150) gaze = 'down';
        if (now - visual.flappedAt < FLAP_WING_MS) wing = 1;
      }
      if (now - visual.scoredAt < CHOMP_MS) face = 'chomp';
      else if (!reduced && state.tick % BLINK_PERIOD < BLINK_TICKS && state.tick > BLINK_TICKS) face = 'blink';
    }
    const pixel = 2 * f.scale; // sprite pixels are 2 world units
    const sprite = this.sprite(`agent:${wing}:${face}:${gaze}:${f.backingW}x${f.backingH}`, () =>
      agentSprite({ wing, face, gaze }, pixel),
    );
    const sx = this.X(agent.x - C.AGENT_W / 2);
    const sy = this.Y(ay - C.AGENT_H / 2);
    ctx.drawImage(sprite, sx, sy);
    this.lastAgentCss = { x: sx / this.dpr, y: sy / this.dpr, size: sprite.width / this.dpr };

    // "+1" float after scoring; "10!" on every tenth point.
    const sinceMilestone = now - visual.milestoneAt;
    const sinceScore = now - visual.scoredAt;
    const milestone = sinceMilestone >= 0 && sinceMilestone < MILESTONE_FLOAT_MS;
    if (milestone || (sinceScore >= 0 && sinceScore < SCORE_FLOAT_MS)) {
      const k = milestone ? sinceMilestone / MILESTONE_FLOAT_MS : sinceScore / SCORE_FLOAT_MS;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = milestone ? COLOURS.milestone : COLOURS.text;
      const size = Math.max(8, Math.round((milestone ? 13 : 9) * f.scale));
      ctx.font = `700 ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
      ctx.textBaseline = 'bottom';
      const rise = reduced ? 0 : k * (milestone ? 26 : 18);
      ctx.fillText(milestone ? `${state.score}!` : '+1', this.X(agent.x + C.AGENT_W / 2 + 2), this.Y(agent.y - C.AGENT_H / 2 - rise));
      ctx.globalAlpha = 1;
    }

    if (this.debug) this.drawDebug(state);

    ctx.restore();

    if (this.vignette) {
      const sinceStart = now - visual.startedAt;
      const playing = state.status === 'running' || state.status === 'paused';
      let alpha = playing ? VIGNETTE_PLAY : VIGNETTE_IDLE;
      if (playing && sinceStart >= 0 && sinceStart < VIGNETTE_FADE_MS && !reduced) {
        alpha = VIGNETTE_IDLE + (VIGNETTE_PLAY - VIGNETTE_IDLE) * (sinceStart / VIGNETTE_FADE_MS);
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(this.vignette, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** ?debug: hitboxes exactly as the sim tests them. */
  private drawDebug(state: GameState): void {
    const { ctx } = this;
    ctx.lineWidth = 1;
    const stroke = (b: { x0: number; y0: number; x1: number; y1: number }, colour: string): void => {
      ctx.strokeStyle = colour;
      ctx.strokeRect(this.X(b.x0) + 0.5, this.Y(b.y0) + 0.5, this.X(b.x1) - this.X(b.x0) - 1, this.Y(b.y1) - this.Y(b.y0) - 1);
    };
    for (const ob of state.obstacles) {
      const [top, bottom] = obstacleBoxes(ob);
      stroke(top, COLOURS.debugObstacle);
      stroke(bottom, COLOURS.debugObstacle);
      this.rect(ob.x, top.y1, C.OB_W, bottom.y0 - top.y1, COLOURS.debugGap);
    }
    stroke({ x0: 0, y0: C.GROUND_Y, x1: C.WORLD_W, y1: C.GROUND_Y + 1 }, COLOURS.debugObstacle);
    stroke(agentBox(state.agent), COLOURS.debugAgent);
  }
}
