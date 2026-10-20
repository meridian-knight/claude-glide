import './style.css';
import * as C from './game/config';
import { createGame, flap, restartGame, startGame, step, togglePause } from './game/game';
import { defaultRng, seededRng, type Rng } from './game/rng';
import type { Agent, GameEvent, GameState, Obstacle, StepResult } from './game/types';
import { GameAudio, type AudioState } from './ui/audio';
import { Haptics, type VibratePattern } from './ui/haptics';
import { HelpModal } from './ui/help';
import { Hud } from './ui/hud';
import { bindInput } from './ui/input';
import { bindLayout } from './ui/layout';
import { drawStaticAgent, Mascot } from './ui/mascot';
import { Renderer } from './ui/renderer';
import { loadBest, loadMuted, saveBest, saveMuted } from './ui/storage';
import { VisualState } from './ui/visual';

declare global {
  interface Window {
    __glide?: {
      getState(): GameState;
      /** Advances the sim by n fixed steps (default 1). */
      step(n?: number): void;
      flap(): void;
      /** Test-only: overrides the agent's position/velocity. */
      setAgent(agent: Partial<Agent>): void;
      /** Test-only: replaces the stacks. */
      setObstacles(obstacles: Obstacle[]): void;
      boardMetrics(): ReturnType<Renderer['boardMetrics']>;
      lastAgentCss(): Renderer['lastAgentCss'];
      /** The last 64 events in order. */
      events(): GameEvent[];
      frameStats(): { avgMs: number; maxMs: number; samples: number };
      audioState(): AudioState;
      suspendAudio(): Promise<void>;
      hapticsSupported(): boolean;
      lastVibrate(): VibratePattern | null;
    };
  }
}

const params = new URLSearchParams(window.location.search);
const seedParam = params.get('seed');
const rng: Rng = seedParam !== null && seedParam !== '' ? seededRng(Number(seedParam) || 0) : defaultRng;

const canvas = document.getElementById('board') as HTMLCanvasElement;
const screen = document.getElementById('screen') as HTMLElement;

const hud = new Hud();
bindLayout({
  hudButtons: document.querySelector<HTMLElement>('.hud-buttons') as HTMLElement,
  deckLeft: document.getElementById('deck-left') as HTMLElement,
  pause: hud.pauseButton,
  help: hud.helpButton,
  mute: hud.muteButton,
});
const haptics = new Haptics();
const renderer = new Renderer(canvas, params.has('debug'));
const audio = new GameAudio(loadMuted());
const visual = new VisualState();
const mascot = new Mascot(hud.mascot, () => visual.reducedMotion);

const helpRoot = document.getElementById('help') as HTMLElement;
const helpClose = document.getElementById('help-close') as HTMLButtonElement;
let resumeAfterHelp = false;
const help = new HelpModal(helpRoot, helpClose, hud.helpButton, {
  onOpen() {
    audio.unlock();
    hud.suppressPause = true;
    resumeAfterHelp = state.status === 'running';
    if (resumeAfterHelp) apply(togglePause(state));
  },
  onClose() {
    hud.suppressPause = false;
    if (resumeAfterHelp && state.status === 'paused') apply(togglePause(state));
    else syncHud();
    resumeAfterHelp = false;
  },
});

let state: GameState = createGame();
let best = loadBest();
let bestAtRunStart = best;
let accumulator = 0;
let lastFrame = 0;
let overAt = Number.NEGATIVE_INFINITY;
const frameTimes: number[] = [];
const recentEvents: GameEvent[] = [];

function syncHud(delayMs = 0): void {
  mascot.setMode(state.status === 'over' ? 'over' : 'idle');
  hud.setStats({ score: state.score, best });
  hud.setHoverHint(state.status === 'running' && !state.armed);
  hud.setOverlay({ status: state.status, score: state.score, best, newBest: best > bestAtRunStart }, delayMs);
}

/** Every resume path restarts the clock, so a long gap never becomes a burst of steps. */
function resetClock(): void {
  accumulator = 0;
  lastFrame = performance.now();
}

function apply(result: StepResult): void {
  const prev = state;
  state = result.state;
  const now = performance.now();
  if (result.events.length === 0 && prev.status === state.status && prev.score === state.score) return;
  visual.observe(prev, state, result.events, now);
  let overlayDelay = 0;
  for (const event of result.events) {
    recentEvents.push(event);
    if (recentEvents.length > 64) recentEvents.shift();
    switch (event) {
      case 'started':
        bestAtRunStart = best;
        resetClock();
        audio.play('start');
        break;
      case 'flapped':
        audio.play('flap');
        break;
      case 'scored':
        audio.play('score');
        haptics.score();
        if (state.score > best) {
          best = state.score;
          saveBest(best);
        }
        break;
      case 'paused':
        audio.play('pause');
        break;
      case 'resumed':
        resetClock();
        audio.play('resume');
        break;
      case 'over':
        overAt = now;
        overlayDelay = C.OVER_OVERLAY_DELAY_MS;
        hud.lockAction(C.RESTART_LOCKOUT_MS);
        audio.play('over');
        haptics.over();
        break;
      case 'armed':
      case 'spawned':
        break;
    }
  }
  syncHud(overlayDelay);
}

function restartAllowed(): boolean {
  return performance.now() - overAt >= C.RESTART_LOCKOUT_MS;
}

function startOrRestart(): void {
  if (state.status === 'idle') apply(startGame(state, rng));
  else if (state.status === 'over' && restartAllowed()) apply(restartGame(state, rng));
}

/** Enter and the overlay button: resume if paused, otherwise start or restart. */
function primary(): void {
  if (state.status === 'paused') apply(togglePause(state));
  else startOrRestart();
}

bindInput(
  {
    onFlap() {
      // A tap while paused or over does nothing: resume and restart are explicit.
      // Space from the start screen starts (into the hover); the next press flaps.
      if (state.status === 'running') apply(flap(state));
      else if (state.status === 'idle') startOrRestart();
    },
    onPause() {
      if (state.status === 'running' || state.status === 'paused') apply(togglePause(state));
    },
    onEnter: primary,
    onAction: primary,
    onGesture() {
      audio.unlock();
    },
    isBlocked() {
      return help.isOpen;
    },
  },
  { surface: screen, action: hud.actionButton, pause: hud.pauseButton },
);

hud.setMuted(audio.isMuted);
hud.muteButton.addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.isMuted);
  saveMuted(audio.isMuted);
  hud.setMuted(audio.isMuted);
  hud.muteButton.blur();
});

// Leaving the page, losing focus, backgrounding or rotating pauses; resuming is always explicit.
const pauseIfRunning = (): void => {
  if (state.status === 'running') apply(togglePause(state));
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseIfRunning();
});
window.addEventListener('blur', pauseIfRunning);
window.addEventListener('pagehide', pauseIfRunning);

/** The frame's content box (padding excluded), which is what the canvas fills. */
function screenContentBox(): { w: number; h: number } {
  const rect = screen.getBoundingClientRect();
  const cs = getComputedStyle(screen);
  const w = rect.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = rect.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  return { w: Math.max(0, w), h: Math.max(0, h) };
}

const resize = (): void => {
  const { w, h } = screenContentBox();
  renderer.resize(w, h);
  const touchLayout = document.body.dataset.layout === 'touch';
  mascot.fit(parseFloat(getComputedStyle(hud.titleNode).fontSize) || 20, touchLayout ? w : undefined);
  drawStaticAgent(document.getElementById('hud-mascot') as HTMLCanvasElement, 2);
  updateDebugOverlay();
};
// Coalesce bursts of layout events (toolbar animations, rotation) into one
// resize per frame, then settle again once the browser chrome has finished moving.
let resizeFrame = 0;
let settleTimer = 0;
const scheduleResize = (): void => {
  if (resizeFrame) return;
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    resize();
  });
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(resize, 250);
};
new ResizeObserver(scheduleResize).observe(screen);
window.addEventListener('resize', scheduleResize);
window.addEventListener('pageshow', scheduleResize);
window.visualViewport?.addEventListener('resize', scheduleResize);
window.visualViewport?.addEventListener('scroll', scheduleResize);
// Rotation moves the play surface under the thumb: pause, then refit.
const onRotate = (): void => {
  pauseIfRunning();
  scheduleResize();
};
window.addEventListener('orientationchange', onRotate);
window.screen.orientation?.addEventListener('change', onRotate);
// Device pixel ratio can change (zoom, external display); re-pick the scale.
const watchDpr = (): void => {
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  mq.addEventListener(
    'change',
    () => {
      scheduleResize();
      watchDpr();
    },
    { once: true },
  );
};
watchDpr();

/** ?debug: a small readout over the screen so a phone screenshot shows the sizing facts. */
const debugOverlay = params.has('debug') ? document.createElement('pre') : null;
if (debugOverlay) {
  debugOverlay.className = 'debug-overlay';
  debugOverlay.setAttribute('aria-hidden', 'true');
  screen.appendChild(debugOverlay);
}
function updateDebugOverlay(): void {
  if (!debugOverlay) return;
  const m = renderer.boardMetrics();
  const { w, h } = screenContentBox();
  debugOverlay.textContent = [
    `ua ${/CriOS/.test(navigator.userAgent) ? 'Chrome iOS' : /Safari/.test(navigator.userAgent) ? 'Safari/WebKit' : 'other'}`,
    `viewport ${window.innerWidth}x${window.innerHeight} dpr ${m.dpr}`,
    `content ${w.toFixed(1)}x${h.toFixed(1)}`,
    `backing ${m.backing[0]}x${m.backing[1]}`,
    `box ${m.box[0].toFixed(2)}x${m.box[1].toFixed(2)}`,
    `scale ${m.scale.toFixed(3)} letterbox ${m.letterbox[0]},${m.letterbox[1]}`,
    `uniform ${m.uniform} wholeCss ${m.wholeCss}`,
    `1:1 ${m.oneToOne}`,
  ].join('\n');
}
resize();

function frame(now: number): void {
  const dt = Math.max(0, Math.min(now - lastFrame, C.MAX_FRAME_MS));
  lastFrame = now;
  frameTimes.push(dt);
  if (frameTimes.length > 120) frameTimes.shift();

  if (state.status === 'running') {
    accumulator += dt;
    let steps = 0;
    while (state.status === 'running' && accumulator >= C.STEP_MS && steps < C.MAX_STEPS_PER_FRAME) {
      accumulator -= C.STEP_MS;
      apply(step(state, rng));
      steps++;
    }
    // A device that cannot keep up runs in slow motion rather than teleporting.
    if (accumulator > C.STEP_MS) accumulator = C.STEP_MS;
  } else if (state.status !== 'paused') {
    accumulator = 0;
  }

  renderer.draw(state, visual, now);
  if (state.status === 'idle' || state.status === 'over') mascot.draw(now);
  window.requestAnimationFrame(frame);
}

syncHud();
window.requestAnimationFrame((t) => {
  lastFrame = t;
  frame(t);
});

if (params.has('test')) {
  window.__glide = {
    getState: () => state,
    step(n = 1) {
      for (let i = 0; i < n; i++) apply(step(state, rng));
    },
    flap() {
      apply(flap(state));
    },
    setAgent(agent) {
      state = { ...state, agent: { ...state.agent, ...agent } };
      syncHud();
    },
    setObstacles(obstacles) {
      state = { ...state, obstacles };
      syncHud();
    },
    boardMetrics: () => renderer.boardMetrics(),
    lastAgentCss: () => renderer.lastAgentCss,
    events: () => recentEvents.slice(),
    frameStats() {
      const samples = frameTimes.length;
      const avgMs = samples ? frameTimes.reduce((a, b) => a + b, 0) / samples : 0;
      const maxMs = samples ? Math.max(...frameTimes) : 0;
      return { avgMs, maxMs, samples };
    },
    audioState: () => audio.state,
    suspendAudio: () => audio.suspendForTest(),
    hapticsSupported: () => haptics.supported,
    lastVibrate: () => haptics.lastPattern,
  };
}
