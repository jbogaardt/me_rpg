import { Application, BitmapFont, BitmapFontManager, CullerPlugin, extensions, TextureStyle } from 'pixi.js';
import '@fontsource/cinzel/700.css';
import '@fontsource/crimson-text/400.css';
import '@fontsource/crimson-text/600.css';
import './ui.css';
import { initAssets, loadSprites, loadZone, staticContent, unloadZone } from './assets';
import { ContentManager } from './content/ContentManager';
import { SceneManager } from './core/Scene';
import { createTouchControls } from './core/touch';
import { Choices } from './hud/Choices';
import { Dialog } from './hud/Dialog';
import { Hud } from './hud/Hud';
import { Loading } from './hud/Loading';
import { Menu } from './hud/Menu';
import { ShopCounter } from './hud/ShopCounter';
import { TradeUi } from './hud/Trade';
import { Session } from './net/session';
import { OverworldScene } from './scenes/OverworldScene';
import { MOB_KINDS } from './systems/combat';
import { ITEMS } from './systems/items';

void (async () => {
  const loading = new Loading();
  try {
    // Pixel art: every texture loaded from here on is sampled with nearest-neighbour filtering.
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    extensions.add(CullerPlugin); // skips drawing `cullable` objects (map props) that are off screen

    const app = new Application();
    await app.init({
      background: '#000000',
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
    // The game content (entities, biomes, scenarios) comes first: what art to preload and which zone to start in
    // depend on it. To read it from a database instead, pass another ContentSource here.
    const content = await ContentManager.load(staticContent);
    content.install();
    const start = content.getBiomeInfo(content.startNode.biome_type);
    const [sprites, zone] = await Promise.all([
      loadSprites(),
      loadZone(start.map, (fraction) => loading.progress(fraction), start.tilesets),
    ]);

    const scenes = new SceneManager(app);
    const touch = createTouchControls(() => scenes.resize());
    const session = new Session();
    const ui = {
      hud: new Hud(),
      menu: new Menu(session, touch),
      shop: new ShopCounter(),
      trade: new TradeUi(),
      dialog: new Dialog(),
      choices: new Choices(),
      touch,
      session,
    };
    ui.menu.portrait = (kind) => {
      const look = MOB_KINDS[kind]?.look;
      return look ? sprites.wardrobe.portrait(look) : null;
    };
    const overworld = new OverworldScene(zone, sprites, ui, loadZone, unloadZone, app.renderer, content);
    scenes.change(overworld);
    scenes.start();
    loading.done();

    // Dev-only handle for playtest scripts (see .claude/skills/playtest); stripped from production builds.
    if (import.meta.env.DEV) Object.assign(window, { __game: { app, scenes, overworld, content, items: ITEMS } });
  } catch (err) {
    loading.fail(err);
    throw err;
  }
})();
