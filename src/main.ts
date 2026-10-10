import { Application } from 'pixi.js';
import { Game } from './game/Game';
import { fetchMap, loadSheets } from './map/sheets';

(async () => {
  const app = new Application();
  await app.init({ background: '#1a1a2e', resizeTo: window, antialias: false, roundPixels: true });
  document.body.appendChild(app.canvas);

  const data = await fetchMap();
  const textures = await loadSheets(data.sheets);
  new Game(app, data, textures).start();
})();
