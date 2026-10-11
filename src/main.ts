import { Application, Assets, type Texture } from 'pixi.js';
import { Game } from './game/Game';
import { SHADE } from './game/combat';
import './ui.css';
import { fetchMap, loadSheets } from './map/sheets';

(async () => {
  const app = new Application();
  await app.init({ background: '#1a1a2e', resizeTo: window, antialias: false, roundPixels: true });
  document.body.appendChild(app.canvas);

  const data = await fetchMap();
  const textures = await loadSheets(data.sheets);
  const sprite = (file: string) => Assets.load<Texture>(`${import.meta.env.BASE_URL}sprites/${file}`);
  const [hero, npc, mob] = await Promise.all([sprite('healer_f.png'), sprite('warrior_m.png'), sprite(SHADE.sheet)]);
  new Game(app, data, textures, { hero, npc, mob }).start();
})();
