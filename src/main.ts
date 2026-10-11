import { Application, Assets, type Texture } from 'pixi.js';
import { Game } from './game/Game';
import { MOB_KINDS } from './game/combat';
import '@fontsource/cinzel/700.css';
import '@fontsource/crimson-text/400.css';
import '@fontsource/crimson-text/600.css';
import './ui.css';
import { fetchMap, loadSheets } from './map/sheets';

(async () => {
  const app = new Application();
  await app.init({ background: '#1a1a2e', resizeTo: window, antialias: false, roundPixels: true });
  document.body.appendChild(app.canvas);

  const data = await fetchMap();
  const textures = await loadSheets(data.sheets);
  const sprite = (file: string) => Assets.load<Texture>(`${import.meta.env.BASE_URL}sprites/${file}`);
  for (const m of data.mobs) if (!MOB_KINDS[m.kind]) throw new Error(`Map spawns unknown mob kind "${m.kind}"`);
  const mobSheets = [...new Set(data.mobs.map((m) => MOB_KINDS[m.kind].sheet))];
  const [hero, npc, ...mobTextures] = await Promise.all([sprite('healer_f.png'), sprite('warrior_m.png'), ...mobSheets.map(sprite)]);
  const mobs = new Map(mobSheets.map((file, i) => [file, mobTextures[i]]));
  new Game(app, data, textures, { hero, npc, mobs }).start();
})();
