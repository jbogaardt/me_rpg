import { chromium } from '@playwright/test';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 440 } })).newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5199/');
await page.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 90000 });
await page.evaluate(() => {
  const s = window.__game.scenes.current;
  const d = s.arena.zone.data;
  const w = d.surfaces.indexOf('water');
  const blocked = new Set(d.collision);
  const lab = new Int32Array(d.surface.length).fill(-1); const comps = [];
  for (let i = 0; i < d.surface.length; i++) {
    if (d.surface[i] !== w || lab[i] >= 0) continue;
    const cells = [i]; lab[i] = i;
    for (let k = 0; k < cells.length; k++) { const j = cells[k], c = j % d.width;
      for (const n of [c > 0 ? j - 1 : -1, c < d.width - 1 ? j + 1 : -1, j - d.width, j + d.width])
        if (n >= 0 && n < lab.length && lab[n] < 0 && d.surface[n] === w) { lab[n] = i; cells.push(n); } }
    comps.push(cells);
  }
  comps.sort((a, b) => a.length - b.length);
  const pond = comps.find((c) => c.length > 30);
  let spot = null;
  for (const i of pond.slice().sort((a, b) => b - a)) {
    const b = i + d.width, b2 = b + d.width;
    if (d.surface[b] === w || blocked.has(b) || blocked.has(b2)) continue;
    spot = i; break;
  }
  const c = spot % d.width, r = Math.floor(spot / d.width);
  s.player.position.set((c + 0.5) * 32, (r + 1.75) * 32);
  s.hero.needs.water = 0;
  s.setWeather(null, 0);
  s.setHour(12);
});
await page.waitForTimeout(6000);
const st = () => page.evaluate(() => { const s = window.__game.scenes.current; return JSON.stringify({ water: Math.round(s.hero.needs.water), drinking: !!s.arena.local.drinking, cooldown: +s.arena.local.attackCooldown.toFixed(2) }); });
// an enemy right beside the pond
await page.evaluate(() => { const s = window.__game.scenes.current; const m = s.arena.zone.mobs.find((m) => m.alive);
  m.body.position.set(s.player.x + 70, s.player.y + 10); window.__mob = m; });
await page.keyboard.press('Space');
await page.waitForTimeout(150);
console.log('enemy near:', await st());
await page.screenshot({ path: out + '/foe.png' });
// send it far away, then A drinks
await page.evaluate(() => { const s = window.__game.scenes.current; s.arena.zone.mobs.forEach((m) => m.body.position.set(10, 10)); s.arena.local.attackCooldown = 0; });
await page.waitForTimeout(300);
await page.keyboard.press('Space');
await page.waitForTimeout(2000);
console.log('no enemy:', await st());
await browser.close();
