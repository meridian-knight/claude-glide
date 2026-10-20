import { expect, test as base, type Page } from '@playwright/test';
import { decodePng } from './png';

/**
 * Browser tests against the production build (see playwright.config.ts).
 * Every test fails on any console error, page error, failed request, HTTP
 * error or request to another host, so the pages stay clean and self-hosted.
 */
const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push('console: ' + m.text());
      });
      page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
      page.on('requestfailed', (r) => problems.push('failed: ' + r.url()));
      page.on('response', (r) => {
        if (r.status() >= 400) problems.push(`http ${r.status()} ${r.url()}`);
      });
      page.on('request', (r) => {
        const host = new URL(r.url()).host;
        if (!host.startsWith('127.0.0.1')) problems.push('external: ' + r.url());
      });
      await use();
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

const state = (page: Page) => page.evaluate(() => window.__glide!.getState());
const flaps = (page: Page) => page.evaluate(() => window.__glide!.events().filter((e) => e === 'flapped').length);
const status = (page: Page) => page.evaluate(() => document.body.dataset.status);
const isTouch = () => Boolean(test.info().project.use.hasTouch);
const isLandscape = () => {
  const vp = test.info().project.use.viewport;
  return Boolean(vp && vp.width > vp.height && vp.height <= 520);
};

/** Starts a run and arms it with one flap. */
async function startFlying(page: Page): Promise<void> {
  await page.locator('#action-btn').click();
  await expect.poll(() => status(page)).toBe('running');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).armed).toBe(true);
}

/** Puts a stack right on top of the agent so the next step ends the run. */
async function killNow(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__glide!.setObstacles([{ id: 500, x: 40, gapY: 20, gapH: 20, passed: false }, { id: 501, x: 400, gapY: 140, gapH: 100, passed: false }]);
    window.__glide!.step(1);
  });
  await expect.poll(() => status(page)).toBe('over');
}

test.beforeEach(async ({ page }) => {
  await page.goto('./?test&seed=42');
  await expect(page.locator('#board')).toBeVisible();
});

test.describe('start screen', () => {
  test('start screen shows the series copy, controls and footer', async ({ page }) => {
    await expect(page).toHaveTitle('Claude Glide | Retro Flappy-Style Arcade Game | CyberSquad0');
    await expect(page.locator('#overlay-eyebrow')).toHaveText('Unofficial fan game');
    await expect(page.locator('#overlay-title')).toHaveText('Claude Glide');
    await expect(page.locator('#overlay-text')).toHaveText('Tap to flap. Thread the gaps. Beat your best.');
    await expect(page.locator('#overlay-keys')).toHaveText('Avoid the stacks and the ground.');
    await expect(page.locator('#action-btn')).toHaveText('Start');
    await expect(page.locator('#action-btn')).toBeEnabled();
    await expect(page.locator('#pause-btn')).toBeDisabled();
    await expect(page.locator('.scoreboard')).toContainText('Score');
    await expect(page.locator('.scoreboard')).toContainText('Best');
    await expect(page.locator('.scoreboard')).not.toContainText('Agents');
    const foot = (await page.locator('.foot').innerText()).replace(/\s+/g, ' ').trim();
    expect(foot).toMatch(/A FAN GAME BUILT BY CYBER SQUAD ZERO \+ CLAUDE\./);
    expect(foot).toMatch(/NOT AFFILIATED WITH OR ENDORSED BY ANTHROPIC\./);
    expect(foot).not.toMatch(/CYBERSQUAD0|NORTH OF ZERO/);
    await expect(page.locator('.foot a.credit-link')).toHaveAttribute('href', 'https://www.cs0.dev');
    await expect(page.locator('.dpad')).toHaveCount(0);
    if (isTouch()) {
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'touch');
      await expect(page.locator('#overlay-controls')).toBeHidden();
      await expect(page.locator('#overlay-hint')).toHaveText('Tap the screen to flap.');
      await expect(page.locator('#help-controls .tap-icon')).toHaveCount(1);
      await expect(page.locator('#help-controls')).toContainText('Tap the screen to flap.');
    } else {
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'desktop');
      await expect(page.locator('#overlay-hint')).toBeHidden();
      const legend = isLandscape() ? page.locator('#help-controls') : page.locator('#overlay-controls');
      await expect(legend.locator('.key')).toHaveText(['Space', 'P', 'Enter']);
      await expect(legend).toContainText('Flap');
      await expect(legend).toContainText('Pause');
      await expect(legend).toContainText('Start');
    }
    await expect(page.locator('#hud-mascot')).toBeVisible();
    const brand = await page.locator('#hud-mascot').boundingBox();
    expect(brand!.height).toBeGreaterThan(0);
    expect(brand!.height).toBeLessThanOrEqual(28);
  });

  test('start screen fits the viewport with no horizontal scroll', async ({ page }) => {
    await expect(page.locator('#overlay')).toHaveClass(/is-open/);
    await page.waitForTimeout(300); // let the overlay's scale-in transition finish before measuring
    const m = await page.evaluate(() => ({
      vw: innerWidth,
      scrollW: document.documentElement.scrollWidth,
      board: document.getElementById('board')!.getBoundingClientRect().toJSON() as DOMRect,
      start: document.getElementById('action-btn')!.getBoundingClientRect().toJSON() as DOMRect,
      title: document.getElementById('overlay-title')!.getBoundingClientRect().toJSON() as DOMRect,
      mascotShown: getComputedStyle(document.getElementById('mascot')!).display !== 'none',
      foot: document.querySelector('.foot')!.getBoundingClientRect().toJSON() as DOMRect,
      docH: document.documentElement.scrollHeight,
    }));
    expect(m.scrollW).toBeLessThanOrEqual(m.vw);
    // Title and Start sit inside the screen; the mascot shows unless the phone is in short landscape.
    expect(m.title.y).toBeGreaterThanOrEqual(m.board.y - 1);
    expect(m.start.y + m.start.height).toBeLessThanOrEqual(m.board.y + m.board.height + 1);
    expect(m.mascotShown).toBe(!isLandscape());
    if (isTouch()) expect(m.start.height).toBeGreaterThanOrEqual(44);
    // Footer is within the document (reachable by natural scroll on short screens).
    expect(m.foot.y + m.foot.height).toBeLessThanOrEqual(m.docH + 1);
    // The screen keeps its 3:4 proportion rather than stretching.
    const screen = await page.locator('.screen').boundingBox();
    expect(screen!.width / screen!.height).toBeCloseTo(0.75, 1);
  });
});

test.describe('world scale', () => {
  test('world scale is uniform, 1:1 with device pixels and whole CSS pixels', async ({ page }) => {
    const m = await page.evaluate(() => window.__glide!.boardMetrics());
    expect(m.oneToOne).toBe(true);
    expect(m.uniform).toBe(true);
    expect(m.wholeCss).toBe(true);
    expect(Number.isInteger(m.backing[0]) && Number.isInteger(m.backing[1])).toBe(true);
    expect(m.scale).toBeGreaterThan(0.5);
    // Letterbox stays a sliver on the 3:4 frame.
    expect(Math.min(m.letterbox[0], m.letterbox[1])).toBeLessThanOrEqual(1);
    expect(Math.max(m.letterbox[0], m.letterbox[1]) / m.dpr).toBeLessThanOrEqual(12);
  });

  test('world scale survives a resize mid-run without touching the state', async ({ page }) => {
    await startFlying(page);
    await page.keyboard.press('KeyP');
    await expect.poll(() => status(page)).toBe('paused');
    const before = await state(page);
    const vp = test.info().project.use.viewport!;
    await page.setViewportSize({ width: Math.round(vp.width * 0.8), height: Math.round(vp.height * 0.85) });
    await page.waitForTimeout(400);
    const after = await state(page);
    expect(after).toEqual(before);
    const m = await page.evaluate(() => window.__glide!.boardMetrics());
    expect(m.oneToOne && m.uniform).toBe(true);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(400);
    const m2 = await page.evaluate(() => window.__glide!.boardMetrics());
    expect(m2.oneToOne && m2.uniform).toBe(true);
    expect(await state(page)).toEqual(before);
  });
});

test.describe('keyboard play', () => {
  test('Enter starts a hover; a held Space flaps exactly once', async ({ page }) => {
    await page.keyboard.press('Enter');
    await expect.poll(() => status(page)).toBe('running');
    let s = await state(page);
    expect(s.armed).toBe(false);
    expect(s.agent.vy).toBe(0);
    await expect(page.locator('#hover-hint')).toBeVisible();
    await expect(page.locator('#overlay')).toBeHidden();
    await page.waitForTimeout(300);
    s = await state(page);
    expect(s.agent.y).toBe(140); // nothing moves before the first flap
    await page.keyboard.down('Space');
    await page.waitForTimeout(400);
    await page.keyboard.up('Space');
    expect(await flaps(page)).toBe(1);
    s = await state(page);
    expect(s.armed).toBe(true);
    await expect(page.locator('#hover-hint')).toBeHidden();
    const events = await page.evaluate(() => window.__glide!.events());
    expect(events).toContain('armed');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('KeyW');
    await expect.poll(() => flaps(page)).toBe(3);
  });

  test('Space on the start screen starts without flapping', async ({ page }) => {
    await page.keyboard.press('Space');
    await expect.poll(() => status(page)).toBe('running');
    const s = await state(page);
    expect(s.armed).toBe(false);
    expect(await flaps(page)).toBe(0);
  });

  test('P pauses and resumes; input while paused does nothing', async ({ page }) => {
    await startFlying(page);
    await page.keyboard.press('KeyP');
    await expect.poll(() => status(page)).toBe('paused');
    await expect(page.locator('#overlay-title')).toHaveText('Paused');
    await expect(page.locator('#pause-btn')).toHaveAttribute('aria-label', 'Resume');
    const frozen = await state(page);
    const n = await flaps(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    expect(await state(page)).toEqual(frozen);
    expect(await flaps(page)).toBe(n);
    await page.keyboard.press('KeyP');
    await expect.poll(() => status(page)).toBe('running');
    await page.keyboard.press('KeyP');
    await expect.poll(() => status(page)).toBe('paused');
    await page.keyboard.press('Enter');
    await expect.poll(() => status(page)).toBe('running');
  });

  test('scoring counts each stack once and stores the best', async ({ page }) => {
    await startFlying(page);
    await page.keyboard.press('KeyP');
    await expect.poll(() => status(page)).toBe('paused');
    await page.evaluate(() => {
      // A stack whose right edge is 1 unit short of the agent's centre, gap around the agent.
      window.__glide!.setAgent({ y: 140, vy: 0 });
      window.__glide!.setObstacles([{ id: 300, x: 56 - 40 + 1, gapY: 140, gapH: 100, passed: false }, { id: 301, x: 400, gapY: 140, gapH: 100, passed: false }]);
    });
    await page.keyboard.press('KeyP');
    await expect.poll(async () => (await state(page)).score).toBe(1);
    await expect(page.locator('#score')).toHaveText('1');
    await expect(page.locator('#best')).toHaveText('1');
    expect(await page.evaluate(() => localStorage.getItem('claude-glide:best'))).toBe('1');
    await page.waitForTimeout(400);
    expect((await state(page)).score).toBe(1);
    const scored = await page.evaluate(() => window.__glide!.events().filter((e) => e === 'scored').length);
    expect(scored).toBe(1);
  });

  test('a stack ends the run; Restart is locked out briefly, then works', async ({ page }) => {
    await startFlying(page);
    await killNow(page);
    expect((await state(page)).cause).toBe('obstacle');
    // Mashing during the death animation changes nothing.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    expect(await status(page)).toBe('over');
    await expect(page.locator('#overlay')).toBeVisible({ timeout: 1000 });
    await expect(page.locator('#overlay-title')).toHaveText('Game over');
    await expect(page.locator('#action-btn')).toHaveText('Restart');
    await expect(page.locator('#mascot')).toHaveAttribute('data-mode', 'over');
    await expect(page.locator('#action-btn')).toBeEnabled({ timeout: 1500 });
    await page.keyboard.press('Enter');
    await expect.poll(() => status(page)).toBe('running');
    const s = await state(page);
    expect(s.armed).toBe(false);
    expect(s.score).toBe(0);
    expect(s.obstacles).toHaveLength(1);
  });

  test('a long run ends on the ground when nobody flaps', async ({ page }) => {
    await startFlying(page);
    await page.evaluate(() => window.__glide!.setObstacles([{ id: 400, x: 800, gapY: 140, gapH: 100, passed: false }]));
    await expect.poll(() => status(page), { timeout: 10000 }).toBe('over');
    expect((await state(page)).cause).toBe('ground');
  });
});

test.describe('touch play', () => {
  test.skip(() => !isTouch(), 'touch layouts only');

  test('one tap on the frame is exactly one flap', async ({ page }) => {
    await page.locator('#action-btn').tap();
    await expect.poll(() => status(page)).toBe('running');
    expect(await flaps(page)).toBe(0);
    const board = (await page.locator('#board').boundingBox())!;
    await page.touchscreen.tap(board.x + board.width / 2, board.y + board.height * 0.7);
    await page.waitForTimeout(250);
    expect(await flaps(page)).toBe(1);
    expect((await state(page)).armed).toBe(true);
    // The frame's padding and letterbox count too.
    const screen = (await page.locator('.screen').boundingBox())!;
    await page.touchscreen.tap(screen.x + 3, screen.y + screen.height / 2);
    await page.waitForTimeout(250);
    expect(await flaps(page)).toBe(2);
  });

  test('help, pause and sound taps never flap; a tap while paused does nothing', async ({ page }) => {
    await page.locator('#action-btn').tap();
    await expect.poll(() => status(page)).toBe('running');
    const board = (await page.locator('#board').boundingBox())!;
    await page.touchscreen.tap(board.x + board.width / 2, board.y + board.height / 2);
    await expect.poll(() => flaps(page)).toBe(1);
    await page.locator('#mute-btn').tap();
    await page.locator('#mute-btn').tap();
    await page.locator('#pause-btn').tap();
    await expect.poll(() => status(page)).toBe('paused');
    await page.locator('#pause-btn').tap();
    await expect.poll(() => status(page)).toBe('running');
    await page.locator('#help-btn').tap();
    await expect.poll(() => status(page)).toBe('paused');
    await page.locator('#help-close').tap();
    await expect.poll(() => status(page)).toBe('running');
    expect(await flaps(page)).toBe(1);
    await page.locator('#pause-btn').tap();
    await expect.poll(() => status(page)).toBe('paused');
    const frozen = await state(page);
    await page.touchscreen.tap(board.x + board.width / 2, board.y + board.height * 0.3);
    await page.waitForTimeout(250);
    expect(await status(page)).toBe('paused');
    expect(await state(page)).toEqual(frozen);
    expect(await flaps(page)).toBe(1);
  });

  test('a tap on the overlay never starts or restarts; only the button does', async ({ page }) => {
    const board = (await page.locator('#board').boundingBox())!;
    await page.touchscreen.tap(board.x + board.width / 2, board.y + 20);
    await page.waitForTimeout(250);
    expect(await status(page)).toBe('idle');
    await page.locator('#action-btn').tap();
    await expect.poll(() => status(page)).toBe('running');
    await page.touchscreen.tap(board.x + board.width / 2, board.y + board.height / 2);
    await expect.poll(() => flaps(page)).toBe(1);
    await killNow(page);
    await expect(page.locator('#action-btn')).toBeEnabled({ timeout: 1500 });
    await page.touchscreen.tap(board.x + board.width / 2, board.y + 20);
    await page.waitForTimeout(250);
    expect(await status(page)).toBe('over');
    expect(await flaps(page)).toBe(1);
    await page.locator('#action-btn').tap();
    await expect.poll(() => status(page)).toBe('running');
    expect((await state(page)).armed).toBe(false);
  });
});

test.describe('mobile readiness', () => {
  test('mobile readiness: large touch targets, chips under the screen, no horizontal scroll', async ({ page }) => {
    test.skip(!isTouch(), 'touch layouts only');
    const m = await page.evaluate(() => {
      const box = (id: string) => document.getElementById(id)!.getBoundingClientRect().toJSON() as DOMRect;
      return {
        chips: ['pause-btn', 'help-btn', 'mute-btn'].map(box),
        screen: document.querySelector('.screen')!.getBoundingClientRect().toJSON() as DOMRect,
        scrollW: document.documentElement.scrollWidth,
        vw: innerWidth,
        deckInDeck: ['pause-btn', 'help-btn', 'mute-btn'].every((id) => document.getElementById(id)!.closest('#deck-left') !== null),
      };
    });
    expect(m.scrollW).toBeLessThanOrEqual(m.vw);
    expect(m.deckInDeck).toBe(true);
    // No element lets a fast double tap zoom the page (touch-action is not inherited).
    const zoomable = await page.evaluate(() =>
      ['body', '.handheld', '.hud', '.scoreboard', '.title', '.screen', '#board', '#overlay', '#action-btn', '.deck', '#deck-left', '#pause-btn', '#help-btn', '#mute-btn', '.foot', '.foot a', '#help', '.modal-panel']
        .filter((sel) => getComputedStyle(document.querySelector(sel)!).touchAction === 'auto'),
    );
    expect(zoomable).toEqual([]);
    for (const c of m.chips) {
      expect(c.width).toBeGreaterThanOrEqual(44);
      expect(c.height).toBeGreaterThanOrEqual(44);
      // Never over the play surface.
      const overlapsScreen = c.x < m.screen.x + m.screen.width && c.x + c.width > m.screen.x && c.y < m.screen.y + m.screen.height && c.y + c.height > m.screen.y;
      expect(overlapsScreen).toBe(false);
    }
  });

  test('mobile readiness: blur, pagehide and visibilitychange pause until an explicit resume', async ({ page }) => {
    await startFlying(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(() => status(page)).toBe('paused');
    await page.waitForTimeout(300);
    expect(await status(page)).toBe('paused');
    await page.locator('#action-btn').click();
    await expect.poll(() => status(page)).toBe('running');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect.poll(() => status(page)).toBe('paused');
    await page.keyboard.press('KeyP');
    await expect.poll(() => status(page)).toBe('running');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => status(page)).toBe('paused');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(200);
    expect(await status(page)).toBe('paused');
  });

  test('mobile readiness: resuming after a long pause never bursts the simulation', async ({ page }) => {
    await startFlying(page);
    await page.keyboard.press('KeyP');
    await expect.poll(() => status(page)).toBe('paused');
    await page.waitForTimeout(1500);
    const before = await state(page);
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(60);
    const after = await state(page);
    expect(after.status).toBe('running');
    // About 60 ms of simulation at 120 Hz is 7 steps; a catch-up burst would be 150+.
    expect(after.tick - before.tick).toBeLessThanOrEqual(16);
  });

  test('mobile readiness: help pauses a run, blocks input and resumes on close', async ({ page }) => {
    await startFlying(page);
    const n = await flaps(page);
    await page.locator('#help-btn').click();
    await expect.poll(() => status(page)).toBe('paused');
    await expect(page.locator('#help')).toBeVisible();
    await expect(page.locator('#overlay')).toBeHidden(); // no pause overlay behind the dialog
    // Game keys are blocked (Space would activate the focused Close button, which is standard).
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('KeyW');
    await page.waitForTimeout(150);
    expect(await flaps(page)).toBe(n);
    expect(await status(page)).toBe('paused');
    // Tab stays inside the dialog.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.getElementById('help')!.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => status(page)).toBe('running');
    await expect(page.locator('#help')).toBeHidden();
    // Help while idle or paused leaves the status alone.
    await page.keyboard.press('KeyP');
    await expect.poll(() => status(page)).toBe('paused');
    await page.locator('#help-btn').click();
    await page.locator('#help-close').click();
    await page.waitForTimeout(100);
    expect(await status(page)).toBe('paused');
  });

  test('mobile readiness: mute persists across reloads', async ({ page }) => {
    await page.locator('#mute-btn').click();
    await expect(page.locator('#mute-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#mute-btn')).toHaveAttribute('aria-label', 'Unmute sound');
    await page.reload();
    await expect(page.locator('#mute-btn')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('claude-glide:muted'))).toBe('1');
    await page.locator('#mute-btn').click();
    await expect(page.locator('#mute-btn')).toHaveAttribute('aria-pressed', 'false');
  });

  test('mobile readiness: audio unlocks on Start and recovers after a suspension', async ({ page }) => {
    await page.locator('#action-btn').click();
    await expect.poll(() => page.evaluate(() => window.__glide!.audioState())).toBe('running');
    await page.evaluate(() => window.__glide!.suspendAudio());
    await expect.poll(() => page.evaluate(() => window.__glide!.audioState())).toBe('suspended');
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => window.__glide!.audioState())).toBe('running');
  });

  test('mobile readiness: haptics only where supported, and only on score and death', async ({ page }) => {
    await startFlying(page);
    const supported = await page.evaluate(() => window.__glide!.hapticsSupported());
    expect(supported).toBe(isTouch());
    expect(await page.evaluate(() => window.__glide!.lastVibrate())).toBeNull(); // flaps never vibrate
    await page.keyboard.press('KeyP');
    await expect.poll(() => status(page)).toBe('paused');
    await page.evaluate(() => {
      window.__glide!.setAgent({ y: 140, vy: 0 });
      window.__glide!.setObstacles([{ id: 300, x: 17, gapY: 140, gapH: 100, passed: false }, { id: 301, x: 400, gapY: 140, gapH: 100, passed: false }]);
    });
    await page.keyboard.press('KeyP');
    await expect.poll(async () => (await state(page)).score).toBe(1);
    expect(await page.evaluate(() => window.__glide!.lastVibrate())).toBe(isTouch() ? 15 : null);
  });

  test('mobile readiness: reduced motion plays without errors and keeps the scene still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.locator('#action-btn').click();
    await expect.poll(() => status(page)).toBe('running');
    // While hovering under reduced motion nothing in the backdrop moves or blinks:
    // the right half of the upper world (clear of the agent and the prompt) is identical 400 ms apart.
    const region = async (): Promise<number[]> => {
      const img = decodePng(await page.locator('#board').screenshot());
      const out: number[] = [];
      for (let y = 0; y < img.height * 0.6; y += 3) for (let x = Math.floor(img.width * 0.55); x < img.width; x += 3) out.push(Math.round(img.lum(x, y)));
      return out;
    };
    const a = await region();
    await page.waitForTimeout(400);
    const b = await region();
    expect(b).toEqual(a);
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    await killNow(page);
    await expect(page.locator('#overlay')).toBeVisible();
    await expect(page.locator('#action-btn')).toBeEnabled({ timeout: 1500 });
  });

  test('mobile readiness: frame times stay reasonable during play', async ({ page }) => {
    await startFlying(page);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
    }
    const stats = await page.evaluate(() => window.__glide!.frameStats());
    expect(stats.samples).toBeGreaterThan(60);
    expect(stats.avgMs).toBeLessThan(40);
  });
});

test.describe('scene', () => {
  test('backdrop stays dark enough for the stacks and agent to read', async ({ page }) => {
    await page.locator('#action-btn').click();
    await expect.poll(() => status(page)).toBe('running');
    await page.evaluate(() => window.__glide!.setObstacles([{ id: 700, x: 120, gapY: 150, gapH: 100, passed: false }, { id: 701, x: 400, gapY: 140, gapH: 100, passed: false }]));
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => window.__glide!.boardMetrics());
    const img = decodePng(await page.locator('#board').screenshot());
    // Map world units through CSS px to image px (the element shot may be a px wider than the backing).
    const kx = img.width / m.box[0];
    const ky = img.height / m.box[1];
    const px = (wx: number, wy: number): [number, number] => [
      Math.min(img.width - 1, Math.round(((m.letterbox[0] + wx * m.scale) / m.dpr) * kx)),
      Math.min(img.height - 1, Math.round(((m.letterbox[1] + wy * m.scale) / m.dpr) * ky)),
    ];
    // Median luminance of the upper 60 % of the world, sampled, away from the stack and the agent.
    const samples: number[] = [];
    for (let wy = 2; wy < 190; wy += 4) {
      for (let wx = 2; wx < 238; wx += 4) {
        if (wx >= 118 && wx <= 162) continue; // the placed stack
        if (wx >= 40 && wx <= 72 && wy >= 120 && wy <= 170) continue; // the agent
        const [x, y] = px(wx, wy);
        samples.push(img.lum(x, y));
      }
    }
    samples.sort((a, b) => a - b);
    expect(samples[samples.length >> 1]!).toBeLessThan(48);
    // The stack's block fill is bright: plain fill inside the lowest block above the gap
    // (away from the highlight, pins and spark); brightest of a small neighbourhood so a
    // CSS scanline cannot dim the sample.
    const [bx, by] = px(126, 100 - 7);
    let brightest = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) brightest = Math.max(brightest, img.lum(bx + dx, by + dy));
    expect(brightest).toBeGreaterThan(170);
  });
});

test.describe('release checks', () => {
  test('release checks: metadata, relative paths, CSP and static files', async ({ page, baseURL }) => {
    const html = await (await page.request.get(baseURL!)).text();
    expect(html).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(html).not.toMatch(/src="\/(?!\/)/); // no root-absolute asset paths
    expect(html).toMatch(/src="\.\/assets\//);
    expect(html).not.toMatch(/localhost|TODO|127\.0\.0\.1/);
    expect(html).not.toMatch(/<meta name="robots"/);
    // Only the JSON-LD block is inline; application scripts are external.
    const inline = html.match(/<script(?![^>]*src=)[^>]*>/g) ?? [];
    expect(inline).toHaveLength(1);
    expect(inline[0]).toContain('application/ld+json');
    expect(html.split('social-preview-v1.png')).toHaveLength(5); // og:image, secure_url, twitter:image, JSON-LD
    const meta = await page.evaluate(() => ({
      description: document.querySelector('meta[name=description]')?.getAttribute('content'),
      canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'),
      ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
      ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
      twitterCard: document.querySelector('meta[name="twitter:card"]')?.getAttribute('content'),
      theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      ld: JSON.parse(document.querySelector('script[type="application/ld+json"]')!.textContent!) as { '@type': string; author: { name: string; url: string }; name: string },
    }));
    expect(meta.description).toContain('Built by CyberSquad0 + Claude.');
    expect(meta.canonical).toBe('https://meridian-knight.github.io/claude-glide/');
    expect(meta.ogTitle).toBe('Claude Glide | Retro Flappy-Style Arcade Game | CyberSquad0');
    expect(meta.ogImage).toBe('https://meridian-knight.github.io/claude-glide/social-preview-v1.png');
    expect(meta.twitterCard).toBe('summary_large_image');
    expect(meta.theme).toBe('#15110e');
    expect(meta.ld['@type']).toBe('VideoGame');
    expect(meta.ld.name).toBe('Claude Glide');
    expect(meta.ld.author).toEqual({ '@type': 'Organization', name: 'CyberSquad0', url: 'https://www.cs0.dev' });
    for (const file of ['favicon.svg', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'social-preview-v1.png', 'robots.txt']) {
      const r = await page.request.get(new URL(file, baseURL!).toString());
      expect(r.status(), file).toBe(200);
    }
  });
});
