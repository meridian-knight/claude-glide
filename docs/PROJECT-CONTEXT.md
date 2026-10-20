# Claude Glide: project context and handover

Read this first when resuming development. It records what the game is, the decisions that shaped it, how it is built, tested and deployed, and what is still open. Second game in the CyberSquad0 retro arcade series, after Claude Swarm (Snake). Last updated for release 1.1.1 (2026-10-20).

## What it is

A static browser game in the Flappy Bird style: the player's orange pixel "agent" flies right through gaps in vertical "stacks" of chip blocks; tap, click or Space flaps; one point per stack passed; a stack or the ground ends the run. No backend, no accounts, no AI API, no network traffic after load. "Agent" is the figurative name for the character; it is a canvas sprite.

- Live: https://meridian-knight.github.io/claude-glide/
- Repository: https://github.com/meridian-knight/claude-glide (`main` deploys; `develop` is the working branch and is kept fast-forwarded onto `main`)
- Stack: Vite 8, TypeScript 5.9, Vitest, Playwright. No runtime dependencies. Same pinned versions as Claude Swarm.
- Sibling project: Claude Swarm at `/Users/agentnoz/Claude Swarm Game` (frozen, do not modify). The platform modules here were copied from it; see "Lineage".

## Brand and copy rules (fixed)

- Tagline: **Tap to flap. Thread the gaps. Beat your best.**
- Terms: agent (the character, never "bot"), stacks (the obstacles), gap, flap.
- Creator: uppercase contexts use **CYBER SQUAD ZERO**; mixed case uses **CyberSquad0**; abbreviation if ever needed **Cs0**; site https://www.cs0.dev.
- Credits: uppercase **BUILT BY CYBER SQUAD ZERO + CLAUDE**, mixed case **Built by CyberSquad0 + Claude.** The footer is uppercase via CSS, so the uppercase form is written literally there; never place "CyberSquad0" inside an element with `text-transform: uppercase`.
- Disclaimer (keep): "Not affiliated with or endorsed by Anthropic." plus "Unofficial fan game". README adds "Not affiliated with the makers of Flappy Bird."
- Page title: "Claude Glide | Retro Flappy-Style Arcade Game | CyberSquad0".
- Social preview: `public/social-preview-v1.png`. Bump the version number on every artwork change and update all four references in `index.html` (og:image, og:image:secure_url, twitter:image, JSON-LD image) plus the release test and `verify-live.mjs`.
- No licence file, by choice (as Claude Swarm).

## Architecture

```
src/game/      pure rules, no DOM: createGame, startGame, restartGame, togglePause, flap, step
               (one fixed 120 Hz step, no dt parameter), speedAt, gapHeightAt, agentBox,
               obstacleBoxes. config.ts is the ONLY tuning table (world, physics, stacks,
               ramp, lockouts). Injected mulberry32 Rng (?seed=N).
src/art/       agent-grid.js (+ .d.ts): the 12x12 agent grid shared by sprites.ts and
               scripts/make-assets.mjs so icons and the preview never drift from the game.
src/ui/        sizing (pure fit of the fixed 240x320 world into a 1:1 whole-pixel canvas),
               renderer (stacks, ground, parallax, agent, "+1", ?debug hitboxes), sprites
               (paint/pixelEdges), visual (event timers, reduced motion), hud (overlays,
               scoreboard, hover hint, restart lockout), help (dialog, focus trap), input
               (keys + flap surface), audio (WebAudio blips, unlock on every gesture),
               haptics (score/over only, Android), layout (chips between HUD and deck),
               mascot, storage (localStorage best + mute, keys claude-glide:*).
src/main.ts    wiring, rAF loop with a fixed-step accumulator, pause policy, resize
               coalescing, ?test hook (window.__glide), ?debug readout.
index.html     markup, metadata, CSP (injected at build by vite.config.ts), JSON-LD.
src/style.css  series theme; portrait 3:4 screen; deck with three chips; breakpoints for
               touch (coarse pointer or <=700px), short phones (<=680px tall), narrow
               (<=400px, <=340px), tablets, short landscape; reduced motion.
public/        icons, social preview, robots.txt, .nojekyll (copied into dist as-is).
scripts/       make-assets.mjs, readme-shots.mjs, serve-dist.mjs (sub-path server),
               verify-live.mjs, audit-start.mjs, audit-help.mjs, smoke.mjs (all read-only).
tests/unit     34 Vitest cases: sim rules, reachability over the config, sizing maths, art grid.
tests/e2e      Playwright matrix, 14 projects (desktop, short desktop, five phone sizes incl.
               browser-bars heights, two landscapes, iPad, sub-path, two WebKit iPhones),
               181 tests.
```

## Key behaviours and decisions

- **World and scale.** The sim runs in a fixed 240x320-unit world (agent 24 units, ground band from y=296). The canvas is sized by `fitWorld` (src/ui/sizing.ts): backing store = whole device px, CSS box = backing/dpr and a whole number of CSS px (searched within 10%, so the canvas is never resampled, the rule inherited from Claude Swarm 1.2.4/1.2.5), world drawn at one uniform fractional scale and letterboxed inside. Difficulty therefore never depends on the screen. `?debug` shows hitboxes and the sizing readout (`1:1 true`, `uniform true`); `window.__glide.boardMetrics()` under `?test`.
- **Fixed step.** 120 Hz, `dt` clamped to 100 ms, at most 12 steps per frame then the remainder is dropped (slow devices run in slow motion rather than teleporting). No render interpolation. Every resume path (`started`, `resumed`) resets the clock, so a long background gap never becomes a burst of steps.
- **Hover.** Start lands in `running` with `armed=false`: the agent bobs, nothing moves, a "Tap to flap" prompt shows. The first flap arms the run. So the tap that presses Start never also flaps.
- **Input.** The whole `.screen` frame is the flap surface on `pointerdown` only (no click/touchstart listeners, so a touch's synthesised mouse events are never heard); taps on the overlay, its button or the help dialog are ignored by a `closest()` guard; a pointer-id set and `e.repeat` + a held-keys set stop duplicates. Keys: Space/ArrowUp/W flap (Space on the start screen starts, into the hover), P pauses, Enter starts/resumes/restarts, Escape belongs to help. Space `keyup` is prevented while the game owns it so a focused chip is not re-activated. Utility chips are plain click handlers outside the frame and blur themselves.
- **Restart lockout.** After a death the overlay opens after 450 ms and Restart/Enter are ignored for 600 ms (`RESTART_LOCKOUT_MS`), so a mash never restarts by accident. Restart lands in the hover.
- **Closing overlay.** `.overlay:not(.is-open) { pointer-events: none }`: during the 200 ms fade after Start/Resume the first tap must reach the frame (found by the touch tests).
- **Pause policy.** `visibilitychange` (hidden), `blur`, `pagehide` and rotation (`orientationchange`, `screen.orientation` change) pause; resuming is always explicit. Window/toolbar resizes only refit. Opening help pauses and closing resumes only if help caused the pause; input is blocked while it is open (Space on the focused Close button closes it, which is standard).
- **Difficulty.** By score only: speed 96 → 128 units/s (+1.6 per point, cap at 20), gap 100 → 84 units (−0.5 per point, floor at 32) before per-stack jitter; the first stack's gap stays within 40 of the start height. Reachability is a unit test over the config (closed form at both spacing extremes plus a 6000-step autopilot run).
- **Fair hitbox.** 16x16 inside the 24x24 sprite; strict overlap, so touching edges survive; the ceiling clamps without killing.
- **Audio** unlocks on pointerdown, pointerup, touchend, click and keydown and resumes a suspended context; a silent buffer kick helps older iOS. Flap is a quiet triangle chirp. Mute persists in localStorage.
- **Haptics:** 15 ms on score, 30/40/60 ms on death, never on flap; only where `navigator.vibrate` exists on a coarse-pointer device (Android). iOS has no vibration API and nothing promises it.
- **Reduced motion** disables parallax scroll, hover bob, death tumble and shake, the "+1" rise, the prompt blink, overlay transitions and mascot motion.
- **Zoom disabled (1.0.1 → 1.1.1, at the owner's request).** `touch-action: manipulation` on every element (`*`; it is not inherited), `none` on the play surface, `pan-y` on the overlay; viewport meta `maximum-scale=1, user-scalable=no`; WebKit `gesturestart/change/end` cancelled (pinch). Those were not enough on iPhone Safari during fast two-thumb bursts (Safari's double-tap tolerance is wider than a 40 px guard, and overlapping touches bypassed a "no other finger down" check), so since 1.1.1 **every `touchend` on the page is cancelled** (the FastClick technique, which removes Safari's double-tap zoom and its native click) and `input.ts` synthesises the click itself: `button.click()` for taps on enabled buttons, a dispatched click for other targets (the help backdrop); a touch that moved ≥ 10 px is not a tap; links stay native; `data-pressed` gives the pressed look. `?debug` shows `visualViewport.scale` and the last touch target. The e2e tests cover the burst, the drag, the backdrop and the meta.
- **Backdrop (1.1.0): a data centre at dusk.** `src/ui/backdrop.ts`: sky gradient whose phase (dusk → night → dawn → day) advances every 10 points with a 1.5 s crossfade and a "10!" float; far rack skyline (seeded layout, scroll ×0.15) whose LEDs glow steadily with only a slow 5 to 9 s brightness drift (hard blinking made the skyline look like it dropped in and out on the owner's phone); dim unpulsed token chips (×0.45) with a slow bob; sparse dust (×0.7); circuit-trace ground (×1). All layers derive from the renderer's scroll distance, so pause and reduced motion freeze them. A browser test checks the upper world stays dark enough for the stacks to read.
- **Stacks (1.1.0).** Spacing 128 to 184 per stack, gap height jitter −6..+14 over the score ramp with an absolute floor of 78, gap-centre moves between 24 and 0.6 × spacing that flip direction after two moves the same way and reflect off the bounds instead of clamping. Reachability is still a unit test over the config, plus a statistical variety test.
- **Touch layout:** chips (pause, help, sound) in a row under the screen, never over the play surface; short landscape puts them in a column to the left of the screen. The screen is `aspect-ratio: 3/4`, sized from `--vh - --chrome` with a `--board-min` floor; short screens scroll naturally.

## Lineage (what came from Claude Swarm)

Copied as-is or renamed: storage, audio (new sound table), haptics (new events), help, layout, sprites' paint/pixelEdges, mascot (wing frames instead of leg frames), hud overlay pattern, auto-pause, help pause policy, resize coalescing, test/debug hooks, reduced-motion handling, vite config with build-time CSP, tsconfig, .gitignore, the SHA-pinned Pages workflow, the Playwright device matrix and error-collecting fixture, png.ts, head metadata, the scripts. Adapted: renderer sizing (grid → fixed world), input (D-pad/swipe → flap surface), controls legend, CSS (square → portrait, no D-pad). Left behind: all Snake rules, swarm sprites, the won state, the grid-line screenshot test.

## Commands

```
npm install
npm run dev            # http://127.0.0.1:5173/
npm run typecheck
npm test               # unit tests
npm run test:e2e       # Playwright matrix (needs: npx playwright install chromium webkit)
npm run build          # dist/
npm run preview        # serve dist/ on 4173
npm run assets         # regenerate icons + social preview (bump the version first)
npm run shots          # README screenshots (run npm run preview first)
node scripts/smoke.mjs <outDir>        # screenshots + readout on four devices (preview first)
node scripts/verify-live.mjs [url]     # live checks, desktop + Pixel 7 emulation
node scripts/audit-start.mjs           # start screen / deck fit across 11 phone viewports
node scripts/audit-help.mjs            # help dialog fit across 6 viewports
```

## Release process

1. Work on `develop`; keep `src/game/config.ts` as the only place tuning changes.
2. Run typecheck, unit tests, build, full Playwright matrix; scan the diff for secrets.
3. Commit; `git tag -a vX.Y.Z`; `git switch main && git merge --ff-only develop`; `git push origin main develop vX.Y.Z`.
4. `.github/workflows/deploy-pages.yml` (SHA-pinned actions, lockfile install, typecheck + unit tests + build, deploys only `dist`) publishes on push to `main`. Pages source is "GitHub Actions"; the `github-pages` environment allows only `main`.
5. Verify: live `index.html` byte-equal to local `dist/index.html`; `node scripts/verify-live.mjs`; then `git tag -a deployed-vX.Y.Z main` and push the tag.
6. Rollback: `git revert` on `main` and push. Never force-push.

## Release history

| Tag | Content |
|---|---|
| `v1.0.0` / `deployed-v1.0.0` | first public release (2026-10-20) |
| `v1.0.1` / `deployed-v1.0.1` | no double-tap zoom on any element (owner found it on a phone) |
| `v1.1.0` / `deployed-v1.1.0` | varied stacks, data-centre-at-dusk backdrop with sky phases, zoom fully disabled |
| `v1.1.1` / `deployed-v1.1.1` | iPhone Safari still zoomed in fast two-thumb bursts: every touchend cancelled, clicks synthesised |

## Verified on physical devices

- Not yet. Emulation (Chromium + WebKit) only. The owner's checklist: iPhone Safari and Chrome, one Android: sound audible after the first tap and following the ring switch, mute glyph correct, one tap = one flap, no accidental restart after a death, rotation pauses, address-bar collapse does not distort (`?debug` shows `1:1 true`, `uniform true`), Android vibration on score and death only.

## Open items

- Physical-device verification (above).
- Repository description, website and topics: set at release with `gh repo edit` (see README/plan).
- Tuning: `config.ts` values are a first pass that a naive autopilot survives; adjust from real play if the first stack feels unfair or long runs feel too easy.
