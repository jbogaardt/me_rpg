---
name: playtest
description: Run me_rpg in a real browser to see or drive it - take screenshots, press keys, check HUD/dialog/combat behaviour, or confirm a change works in the actual game rather than only in unit tests. Use after any gameplay, rendering, UI or map change that should be seen, and when asked to run or screenshot the game.
---

# Playtest the game

Two layers, use the cheapest that answers the question:

1. **Logic** - `npm run test` (Vitest; pure rules, collision, camera, map format, map checks).
2. **Browser** - `npm run test:e2e` (Playwright smoke tests against the production build: boots clean, HUD, casting
   spends MP, menu, hi-dpi canvas, touch controls) or an ad-hoc script as below.

## Ad-hoc driving (screenshots, poking state)

`npm run dev` serves the game (campaign 1, the sandbox; `?campaign=campaign2`, `?campaign=random` or `?seed=N` for another world) and, **in dev only**, exposes `window.__game = { app, scenes, overworld, content, campaign, assembly, items }` (`items` is the campaign's item registry: `overworld.equip(items.steelSword)` changes the hero's gear and look). `scenes.current` is
the running `OverworldScene`; its fields are TypeScript-`private` but reachable at runtime (`player`, `npc`,
`mobs`, `hero`, `world`, `camera`). Production builds don't have the handle.

```js
import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM, // cloud sessions: /opt/pw-browsers/chromium-*/chrome-linux/chrome
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'], // software WebGL when there is no GPU
});
const page = await (await browser.newContext({ viewport: { width: 640, height: 480 } })).newPage();
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.__game && document.getElementById('loading').hidden);
await page.evaluate(() => { const s = window.__game.scenes.current; s.player.position.set(s.npc.x - 20, s.npc.y); });
await page.keyboard.press('KeyJ'); // talk to the NPC
await page.screenshot({ path: 'shot.png' }); // then Read the PNG to look at it
```

Keys: arrows/WASD move, Space/J/Enter/E action (talk or attack), K/Q cast, Esc/I/Tab menu.

## Two-player (co-op) test

`e2e/multiplayer.spec.ts` opens two browser contexts and does the whole manual handshake (Menu → Online → Host →
Generate Host Code; the joiner opens `/#offer=<code>`, Generate Answer; paste it back, Establish Connection). For an
ad-hoc script do the same with two pages on the dev server, then drive them: in dev, `scenes.current.role` is
`'host'`/`'client'` and `.remotes` maps player numbers to the other players. Launch Chromium with
`--disable-features=WebRtcHideLocalIpsWithMdns` so two contexts on one machine connect over plain host candidates;
with no internet the STUN server is unreachable and each side waits out the 10 s gathering cap.

## Gotchas learned the hard way

- **Short-lived visuals (damage numbers, slashes, bolts) are easy to miss** in a screenshot: headless software GL
  runs at a few fps, so timing is unreliable. Freeze the frame instead: poll for the object in
  `requestAnimationFrame`, then `app.ticker.stop(); app.render()` and take the screenshot.
- Class names are minified in production builds; find objects by shape (`typeof c.text === 'string'`), not
  `constructor.name`.
- `page.screenshot({ clip })` takes **CSS px**, not device px, even with `deviceScaleFactor: 2`.
- Don't `pkill -f` / `pgrep -f` a pattern that also appears in your own command line (it kills the shell). Use the
  `[v]ite --port 5199` trick or keep the server's PID.
- Playwright installed under `/opt/node-tools` is a different version from the repo's `@playwright/test`; the repo's
  tests need `PW_CHROMIUM` pointing at a matching Chromium (CI downloads its own).
