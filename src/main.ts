import { Application } from 'pixi.js';
import { Game } from './game/Game';

(async () => {
  const app = new Application();
  await app.init({ background: '#1a1a2e', resizeTo: window, antialias: false });
  document.body.appendChild(app.canvas);
  new Game(app).start();
})();
