import { Application, Assets, BitmapFont, BitmapFontManager, TextureStyle, type Texture } from 'pixi.js';
import { Game } from './game/Game';
import { MOB_KINDS } from './game/combat';
import '@fontsource/cinzel/700.css';
import '@fontsource/crimson-text/400.css';
import '@fontsource/crimson-text/600.css';
import './ui.css';
import { fetchMap, loadSheets } from './map/sheets';

(async () => {
  // Pixel art: every texture loaded from here on is sampled with nearest-neighbour filtering.
  TextureStyle.defaultOptions.scaleMode = 'nearest';

  const app = new Application();
  await app.init({
    background: '#1a1a2e',
    resizeTo: window,
    antialias: false,
    roundPixels: true,
    // Render at the device's pixel density so the canvas stays crisp on phones and retina screens.
    // app.screen and layout stay in CSS pixels (autoDensity).
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);

  // Glyph atlas for floating combat text (white + black outline, tinted per use). The world layer is
  // scaled up by the camera zoom, so the atlas is generated at a high resolution.
  BitmapFont.install({
    name: 'FloatText',
    resolution: 4,
    chars: BitmapFontManager.ASCII,
    textureStyle: { scaleMode: 'linear' },
    style: { fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold', fill: 0xffffff, stroke: { color: 0x000000, width: 3, join: 'round' } },
  });

  const data = await fetchMap();
  const textures = await loadSheets(data.sheets);
  const sprite = (file: string) => Assets.load<Texture>(`${import.meta.env.BASE_URL}sprites/${file}`);
  for (const m of data.mobs) if (!MOB_KINDS[m.kind]) throw new Error(`Map spawns unknown mob kind "${m.kind}"`);
  const mobSheets = [...new Set(data.mobs.map((m) => MOB_KINDS[m.kind].sheet))];
  const [hero, npc, ...mobTextures] = await Promise.all([sprite('healer_f.png'), sprite('warrior_m.png'), ...mobSheets.map(sprite)]);
  const mobs = new Map(mobSheets.map((file, i) => [file, mobTextures[i]]));
  new Game(app, data, textures, { hero, npc, mobs }).start();
})();
