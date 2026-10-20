import { chromium, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
// Read-only live checks (desktop + Pixel 7 emulation). Usage: node scripts/verify-live.mjs [baseUrl]
const BASE = process.argv[2] ?? 'https://meridian-knight.github.io/claude-glide/';
const HOST = new URL(BASE).host;
const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };

// Release identity: live index.html equals the local build output.
{
  const res = await fetch(BASE, { cache: 'no-store' });
  const live = await res.text();
  const local = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  check('live index.html byte-equal to local dist (current dist)', live === local, `${live.length} vs ${local.length} bytes`);
}

async function session(label, ctxOpts, touch) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('failed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()} ${r.url()}`); });
  const hosts = new Set();
  page.on('request', (r) => hosts.add(new URL(r.url()).host));
  const state = () => page.evaluate(() => window.__glide.getState());
  const status = () => page.evaluate(() => document.body.dataset.status);
  const flaps = () => page.evaluate(() => window.__glide.events().filter((e) => e === 'flapped').length);

  const res = await page.goto(BASE + '?test', { waitUntil: 'load' });
  check(`${label}: direct load`, res.status() === 200);
  await page.reload({ waitUntil: 'load' });
  check(`${label}: refresh`, await page.locator('#board').isVisible());
  const meta = await page.evaluate(() => ({
    title: document.title,
    desc: document.querySelector('meta[name=description]')?.content,
    ogImage: document.querySelector('meta[property="og:image"]')?.content,
    canonical: document.querySelector('link[rel=canonical]')?.href,
    startText: document.getElementById('overlay-text')?.textContent,
    rule: document.getElementById('overlay-keys')?.textContent,
    scoreboard: document.querySelector('.scoreboard')?.textContent ?? '',
    hudMascot: (() => { const c = document.getElementById('hud-mascot'); return c ? c.getBoundingClientRect().height : 0; })(),
    footer: document.querySelector('.foot')?.innerText?.replace(/\s+/g, ' ').trim(),
    layout: document.body.dataset.layout,
    csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
  }));
  check(`${label}: title credits CyberSquad0`, meta.title === 'Claude Glide | Retro Flappy-Style Arcade Game | CyberSquad0', meta.title);
  check(`${label}: description (flight copy, CyberSquad0 credit)`, (meta.desc || '').startsWith('Tap to flap, thread the gaps and beat your best.') && (meta.desc || '').endsWith('Built by CyberSquad0 + Claude.'), meta.desc);
  check(`${label}: canonical + og:image v1`, meta.canonical === BASE && meta.ogImage === BASE + 'social-preview-v1.png');
  check(`${label}: CSP meta present`, meta.csp);
  check(`${label}: start copy`, meta.startText === 'Tap to flap. Thread the gaps. Beat your best.' && meta.rule === 'Avoid the stacks and the ground.');
  check(`${label}: scoreboard says Score and Best only`, /Score/.test(meta.scoreboard) && /Best/.test(meta.scoreboard) && !/Agents/.test(meta.scoreboard));
  check(`${label}: header mascot drawn`, meta.hudMascot > 0 && meta.hudMascot <= 28, `${meta.hudMascot}px`);
  check(`${label}: footer rendered as CYBER SQUAD ZERO`, /A FAN GAME BUILT BY CYBER SQUAD ZERO \+ CLAUDE\./.test(meta.footer) && !/CYBERSQUAD0|NORTH OF ZERO/.test(meta.footer) && /NOT AFFILIATED WITH OR ENDORSED BY ANTHROPIC\./.test(meta.footer), meta.footer);
  const credit = await page.evaluate(() => { const a = document.querySelector('.foot a.credit-link'); return a ? { href: a.href, rel: a.rel, text: a.innerText } : null; });
  check(`${label}: credit link to cs0.dev`, !!credit && credit.href === 'https://www.cs0.dev/' && /noopener/.test(credit.rel) && credit.text === 'CYBER SQUAD ZERO', JSON.stringify(credit));
  check(`${label}: layout`, meta.layout === (touch ? 'touch' : 'desktop'));
  for (const p of ['favicon.svg', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'social-preview-v1.png', 'robots.txt']) {
    const r = await page.request.get(BASE + p);
    check(`${label}: ${p}`, r.status() === 200);
  }
  const board = await page.evaluate(() => window.__glide.boardMetrics());
  check(`${label}: canvas 1:1, uniform scale, whole CSS px`, board.oneToOne === true && board.uniform === true && board.wholeCss === true, JSON.stringify(board));
  const boardBox = await page.locator('#board').boundingBox();
  if (touch) {
    const idle = await page.evaluate(() => ({ chips: ['pause-btn', 'help-btn', 'mute-btn'].map((id) => document.getElementById(id).getBoundingClientRect().height), legendOff: getComputedStyle(document.getElementById('overlay-controls')).display === 'none', hint: document.getElementById('overlay-hint').textContent, dpad: document.querySelector('.dpad') }));
    check(`${label}: start screen: chips >= 44px, no D-pad, legend off, tap hint shown`, idle.chips.every((h) => h >= 44) && idle.legendOff && idle.hint === 'Tap the screen to flap.' && idle.dpad === null, JSON.stringify(idle));
    await page.touchscreen.tap(boardBox.x + boardBox.width / 2, boardBox.y + 20);
    await page.waitForTimeout(250);
    check(`${label}: a tap on the overlay does not start a game`, (await status()) === 'idle');
    const startBox = await page.locator('#action-btn').boundingBox();
    const mascotBox = await page.locator('#mascot').boundingBox();
    check(`${label}: mascot and Start inside the screen`, mascotBox.y >= boardBox.y && startBox.y + startBox.height <= boardBox.y + boardBox.height && startBox.height >= 44, `start h=${startBox.height}`);
  }
  // Play
  if (touch) await page.locator('#action-btn').tap(); else await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.dataset.status === 'running');
  check(`${label}: Start lands in the hover`, (await state()).armed === false && !(await page.locator('#hover-hint').isHidden()));
  const audio = await page.evaluate(() => window.__glide.audioState());
  check(`${label}: audio context running after Start`, audio === 'running', audio);
  if (touch) await page.touchscreen.tap(boardBox.x + boardBox.width / 2, boardBox.y + boardBox.height * 0.7); else await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__glide.getState().armed === true, null, { timeout: 3000 });
  await page.waitForTimeout(200);
  check(`${label}: one ${touch ? 'tap' : 'press'} = one flap`, (await flaps()) === 1, `flaps=${await flaps()}`);
  const pause = () => (touch ? page.locator('#pause-btn').tap() : page.keyboard.press('KeyP'));
  await pause();
  await page.waitForFunction(() => document.body.dataset.status === 'paused');
  const before = await flaps();
  await page.locator('#help-btn').click();
  await page.locator('#help-close').click();
  await page.waitForTimeout(100);
  check(`${label}: help while paused leaves it paused`, (await status()) === 'paused');
  await page.evaluate(() => {
    window.__glide.setAgent({ y: 140, vy: 0 });
    window.__glide.setObstacles([{ id: 300, x: 17, gapY: 140, gapH: 100, passed: false }, { id: 301, x: 400, gapY: 140, gapH: 100, passed: false }]);
  });
  await pause();
  await page.waitForFunction(() => window.__glide.getState().score === 1, null, { timeout: 3000 });
  check(`${label}: score once per stack`, (await state()).score === 1 && (await flaps()) === before);
  const hap = await page.evaluate(() => ({ s: window.__glide.hapticsSupported(), v: window.__glide.lastVibrate() }));
  check(`${label}: haptics ${touch ? 'fire on score' : 'inactive on desktop'}`, touch ? hap.s && hap.v === 15 : !hap.s && hap.v === null, JSON.stringify(hap));
  await page.locator('#help-btn').click();
  await page.waitForFunction(() => document.body.dataset.status === 'paused');
  await page.locator('#help-close').click();
  await page.waitForFunction(() => document.body.dataset.status === 'running');
  check(`${label}: help pauses and resumes`, true);
  await page.evaluate(() => { window.__glide.setObstacles([{ id: 500, x: 40, gapY: 20, gapH: 20, passed: false }, { id: 501, x: 400, gapY: 140, gapH: 100, passed: false }]); window.__glide.step(1); });
  await page.waitForFunction(() => window.__glide.getState().status === 'over', null, { timeout: 3000 });
  if (touch) await page.locator('#action-btn').tap({ force: true }); else await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  check(`${label}: restart locked out during the death animation`, (await status()) === 'over');
  await page.waitForTimeout(700);
  const over = await page.evaluate(() => ({ mode: document.getElementById('mascot').dataset.mode, frame: document.getElementById('mascot').dataset.frame, hidden: document.getElementById('mascot').hidden, enabled: !document.getElementById('action-btn').disabled }));
  check(`${label}: game-over mascot dizzy, Restart enabled`, over.mode === 'over' && over.frame === 'centre:dizzy:0:0:1' && !over.hidden && over.enabled, JSON.stringify(over));
  if (touch) await page.locator('#action-btn').tap(); else await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.dataset.status === 'running');
  check(`${label}: restart`, (await state()).score === 0 && (await state()).armed === false);
  check(`${label}: best stored`, (await page.evaluate(() => localStorage.getItem('claude-glide:best'))) === '1');
  await page.locator('#mute-btn').click();
  check(`${label}: mute toggle`, (await page.locator('#mute-btn').getAttribute('aria-pressed')) === 'true');
  check(`${label}: zero console/asset errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  check(`${label}: same-origin only`, [...hosts].every((h) => h === HOST), [...hosts].join(','));
  await ctx.close();
}
await session('desktop', { viewport: { width: 1280, height: 800 } }, false);
await session('pixel7', { ...devices['Pixel 7'] }, true);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} live checks passed`);
process.exit(failed.length ? 1 : 0);
