import { Application, Assets, type Texture } from 'pixi.js';
import { Game } from './game/Game';
import { fetchMap, loadSheets } from './map/sheets';

(async () => {
  const app = new Application();
  await app.init({ background: '#1a1a2e', resizeTo: window, antialias: false, roundPixels: true });
  document.body.appendChild(app.canvas);

  const data = await fetchMap();
  const textures = await loadSheets(data.sheets);
  const hero = await Assets.load<Texture>(`${import.meta.env.BASE_URL}sprites/healer_f.png`);
  const npc = await Assets.load<Texture>(`${import.meta.env.BASE_URL}sprites/warrior_m.png`);
  new Game(app, data, textures, hero, npc).start();
})();
