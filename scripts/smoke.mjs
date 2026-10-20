// Quick browser smoke run against a preview server: start screen, hover, flaps, death, restart,
// with screenshots and a sizing/layout readout per device. Read-only; a local check, not a test.
// Usage: npm run preview (port 4173) then: node scripts/smoke.mjs <outDir> [baseUrl]
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'test-results/smoke';
const BASE = process.argv[3] ?? 'http://127.0.0.1:4173/';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();

async function session(label, ctxOpts, touch) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('failed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()} ${r.url()}`); });
  await page.goto(BASE + '?test&seed=7', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  const g = () => page.evaluate(() => window.__glide.getState());
  const m = await page.evaluate(() => window.__glide.boardMetrics());
  const layout = await page.evaluate(() => {
    const r = (sel) => { const el = document.querySelector(sel); const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)].join(','); };
    return {
      layout: document.body.dataset.layout,
      viewport: `${innerWidth}x${innerHeight}`, scroll: `${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight}`,
      screen: r('.screen'), board: r('#board'), start: r('#action-btn'), mascot: r('#mascot'), foot: r('.foot'), deck: r('.deck'), hud: r('.hud'),
    };
  });
  console.log(`\n== ${label}`);
  console.log('metrics', JSON.stringify(m));
  console.log('layout', JSON.stringify(layout));
  await page.screenshot({ path: `${out}/${label}-1-start.png` });

  if (touch) await page.locator('#action-btn').tap(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  let s = await g();
  console.log('after start', s.status, 'armed', s.armed, 'hoverHintHidden', await page.evaluate(() => document.getElementById('hover-hint').hidden));
  await page.screenshot({ path: `${out}/${label}-2-hover.png` });

  const flapTouch = async () => { const b = await page.locator('#board').boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height * 0.7); };
  for (let i = 0; i < 6; i++) {
    if (touch) await flapTouch(); else await page.keyboard.press('Space');
    await page.waitForTimeout(380);
  }
  s = await g();
  const ev = await page.evaluate(() => window.__glide.events());
  console.log('after flaps', s.status, 'armed', s.armed, 'y', s.agent.y.toFixed(1), 'score', s.score, 'flaps', ev.filter((e) => e === 'flapped').length, 'stacks', s.obstacles.length);
  await page.screenshot({ path: `${out}/${label}-3-flying.png` });

  await page.waitForFunction(() => window.__glide.getState().status === 'over', null, { timeout: 15000 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/${label}-4-dying.png` });
  await page.waitForTimeout(600);
  s = await g();
  console.log('over cause', s.cause, 'score', s.score, 'best stored', await page.evaluate(() => localStorage.getItem('claude-glide:best')));
  await page.screenshot({ path: `${out}/${label}-5-over.png` });
  console.log('frames', JSON.stringify(await page.evaluate(() => window.__glide.frameStats())));
  console.log('audio', await page.evaluate(() => window.__glide.audioState()));
  if (touch) await page.locator('#action-btn').tap(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  s = await g();
  console.log('after restart', s.status, 'armed', s.armed, 'score', s.score);
  console.log('errors', errors.length ? errors : 'none');
  await ctx.close();
}

await session('desktop', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, false);
await session('pixel7', { ...devices['Pixel 7'] }, true);
await session('iphone-se', { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, true);
await session('se-landscape', { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, true);
await browser.close();
