import { Application, BitmapFont, BitmapFontManager, CullerPlugin, extensions, TextureStyle } from 'pixi.js';
import '@fontsource/cinzel/700.css';
import '@fontsource/crimson-text/400.css';
import '@fontsource/crimson-text/600.css';
import './ui.css';
import { initAssets, loadSprites, loadZone } from './assets';
import { SceneManager } from './core/Scene';
import { createTouchControls } from './core/touch';
import { Dialog } from './hud/Dialog';
import { Hud } from './hud/Hud';
import { Loading } from './hud/Loading';
import { Menu } from './hud/Menu';
import { Session } from './net/session';
import { OverworldScene } from './scenes/OverworldScene';

const START_ZONE = 'overworld';

void (async () => {
  const loading = new Loading();
  try {
    // Pixel art: every texture loaded from here on is sampled with nearest-neighbour filtering.
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    extensions.add(CullerPlugin); // skips drawing `cullable` objects (map props) that are off screen

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
      style: {
        fontFamily: 'monospace',
        fontSize: 10,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3, join: 'round' },
      },
    });

    await initAssets();
    const [sprites, zone] = await Promise.all([
      loadSprites(),
      loadZone(START_ZONE, (fraction) => loading.progress(fraction)),
    ]);

    const scenes = new SceneManager(app);
    const touch = createTouchControls(() => scenes.resize());
    const session = new Session();
    const ui = { hud: new Hud(), menu: new Menu(session), dialog: new Dialog(), touch, session };
    scenes.change(new OverworldScene(zone, sprites, ui));
    scenes.start();
    loading.done();

    // Dev-only handle for playtest scripts (see .claude/skills/playtest); stripped from production builds.
    if (import.meta.env.DEV) Object.assign(window, { __game: { app, scenes } });
  } catch (err) {
    loading.fail(err);
    throw err;
  }
})();
