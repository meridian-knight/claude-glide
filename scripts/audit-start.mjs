import { chromium } from '@playwright/test';
// Read-only start-screen / deck fit audit across phone viewports. Usage: BASE_URL=... node scripts/audit-start.mjs
const BASE = process.env.BASE_URL ?? 'https://meridian-knight.github.io/claude-glide/?test';
const browser = await chromium.launch();
const cases = [
  ['android-small', 360, 640, 2], ['android-small-bars', 360, 560, 2], ['iphone-se', 375, 667, 2], ['iphone-se-bars', 375, 553, 2],
  ['iphone-14pro', 393, 852, 3], ['iphone-14pro-bars', 393, 660, 3], ['pixel7', 412, 915, 2.625], ['pixel7-bars', 412, 739, 2.625],
  ['se-landscape', 667, 375, 2], ['pixel7-landscape', 915, 412, 2.625], ['pixel7-landscape-bars', 915, 300, 2.625],
];
const r1 = (n) => Math.round(n);
for (const [name, w, h, dpr] of cases) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el || el.hidden) return null; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); if (cs.display === 'none') return null; return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const o = document.getElementById('overlay');
    return {
      vh: innerHeight, scrollH: document.documentElement.scrollHeight,
      screen: box('.screen'), board: box('#board'), overlay: box('#overlay'),
      overlayScroll: o.scrollHeight - o.clientHeight,
      metrics: window.__glide.boardMetrics(),
      mascot: box('#mascot'), eyebrow: box('#overlay-eyebrow'), title: box('#overlay-title'), text: box('#overlay-text'), rule: box('#overlay-keys'), start: box('#action-btn'), hint: box('#overlay-hint'),
      deck: box('.deck'), utils: box('.deck-left'), foot: box('.foot'), hud: box('.hud'),
    };
  });
  const content = ['mascot', 'eyebrow', 'title', 'text', 'rule', 'start', 'hint'].map((k) => m[k]).filter(Boolean);
  const top = Math.min(...content.map((b) => b.y)); const bottom = Math.max(...content.map((b) => b.y + b.h));
  const contentH = bottom - top;
  const clippedTop = m.board && top < m.board.y; const clippedBottom = m.board && bottom > m.board.y + m.board.h;
  console.log(`\n== ${name} ${w}x${h} (dpr ${dpr}) pageScroll=${m.scrollH > m.vh ? m.scrollH - m.vh + 'px' : 'none'}`);
  console.log(`board ${m.board?.w}x${m.board?.h} @y${m.board?.y} scale=${m.metrics.scale.toFixed(3)} 1:1=${m.metrics.oneToOne} uniform=${m.metrics.uniform} letterbox=${m.metrics.letterbox.join(',')} | overlay content ${contentH}px (${r1(100 * contentH / (m.board?.h || 1))}% of board) | overlay scrollable=${m.overlayScroll}px`);
  console.log(`mascot=${m.mascot ? m.mascot.h + 'px' : 'hidden'} title=${m.title?.h} text=${m.text?.h} rule=${m.rule?.h} start=${m.start?.w}x${m.start?.h} hint=${m.hint ? 'shown' : 'hidden'} clippedTop=${clippedTop} clippedBottom=${clippedBottom}`);
  console.log(`deck=${m.deck ? m.deck.w + 'x' + m.deck.h + '@y' + m.deck.y : 'hidden'} utils=${m.utils ? m.utils.w + 'x' + m.utils.h : '-'} foot@y${m.foot?.y} h${m.foot?.h} hud h${m.hud?.h}`);
  // Help modal
  await page.locator('#help-btn').tap();
  await page.waitForTimeout(250);
  const hm = await page.evaluate(() => { const p = document.querySelector('.modal-panel'); const b = p.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.y), scroll: p.scrollHeight - p.clientHeight, fits: b.y >= 0 && b.bottom <= innerHeight }; });
  console.log(`help panel ${hm.w}x${hm.h}@y${hm.y} scroll=${hm.scroll} fitsViewport=${hm.fits}`);
  await page.locator('#help-close').tap();
  // Game over
  await page.locator('#action-btn').tap();
  await page.waitForFunction(() => document.body.dataset.status === 'running');
  await page.evaluate(() => { window.__glide.flap(); window.__glide.setObstacles([{ id: 500, x: 40, gapY: 20, gapH: 20, passed: false }]); window.__glide.step(1); });
  await page.waitForFunction(() => window.__glide.getState().status === 'over', null, { timeout: 5000 });
  await page.waitForTimeout(700);
  const go = await page.evaluate(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el || el.hidden || getComputedStyle(el).display === 'none') return null; const b = el.getBoundingClientRect(); return { y: Math.round(b.y), h: Math.round(b.height) }; };
    const board = document.getElementById('board').getBoundingClientRect();
    const items = ['#mascot', '#overlay-title', '#overlay-text', '#overlay-keys', '#action-btn'].map(box).filter(Boolean);
    const top = Math.min(...items.map((b) => b.y)); const bottom = Math.max(...items.map((b) => b.y + b.h));
    return { contentH: bottom - top, boardH: Math.round(board.height), clipped: top < board.top || bottom > board.bottom, mascot: box('#mascot')?.h ?? 'hidden' };
  });
  console.log(`game over: content ${go.contentH}px of board ${go.boardH}px, mascot=${go.mascot}, clipped=${go.clipped}`);
  await ctx.close();
}
await browser.close();
