// README screenshots from the production preview. Usage: npm run preview (port 4173) then: npm run shots
import { chromium, devices } from '@playwright/test';
const out = process.argv[2] ?? 'docs';
const browser = await chromium.launch();

/** Flies a few stacks with a simple autopilot so the shot shows a real run with a score. */
async function fly(page, steps) {
  await page.evaluate((n) => {
    const g = window.__glide;
    for (let i = 0; i < n; i++) {
      const s = g.getState();
      if (s.status !== 'running') break;
      const next = s.obstacles.find((o) => o.x + 40 > s.agent.x - 8);
      if (next && s.agent.vy >= 0 && s.agent.y > next.gapY + 12) g.flap();
      g.step(1);
    }
  }, steps);
}

/**
 * Arms the run and lets the autopilot fly `seconds` of simulation in one synchronous
 * call (the live loop cannot interleave), then shoots within a frame or two.
 */
async function stage(page, seconds) {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // no fades or parallax drift
  await page.evaluate(() => window.__glide.flap());
  await fly(page, Math.round(120 * seconds));
  await page.waitForTimeout(30);
}

// Desktop: 1280x800 at 2x for crispness, cropped to the handheld frame.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/?test&seed=7');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await stage(page, 7.4);
  const box = await page.locator('.handheld').boundingBox();
  await page.screenshot({ path: `${out}/screenshot-desktop.png`, clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 } });
  await ctx.close();
}
// Mobile: Pixel 7 portrait, full viewport.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/?test&seed=7');
  await page.locator('#action-btn').tap();
  await page.waitForTimeout(200);
  await stage(page, 5.2);
  const frame = await page.locator('.handheld').boundingBox();
  await page.screenshot({ path: `${out}/screenshot-mobile.png`, clip: { x: 0, y: 0, width: 412, height: Math.ceil(frame.y + frame.height + 12) } });
  await ctx.close();
}
await browser.close();
console.log('readme screenshots written');
