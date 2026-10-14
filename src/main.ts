import { Application, BitmapFont, BitmapFontManager, CullerPlugin, extensions, TextureStyle } from 'pixi.js';
import '@fontsource/cinzel/700.css';
import '@fontsource/crimson-text/400.css';
import '@fontsource/crimson-text/600.css';
import './ui.css';
import { initAssets, loadSprites, loadZone, packContent, staticContent, unloadZone } from './assets';
import { chooseCampaign, RANDOM } from './content/campaignChoice';
import { setContentTag } from './net/session';
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

/**
 * The world the game plays: a random campaign assembled from the packs (public/content/packs/) unless the address
 * (`?campaign=campaign2`, `?seed=42`) or the build (VITE_CAMPAIGN; the browser tests use campaign1, the world the engine
 * was built on) names another. See content/campaignChoice.ts.
 */
const CHOICE = chooseCampaign(
  window.location.search,
  import.meta.env.VITE_CAMPAIGN || RANDOM,
  () => 1 + Math.floor(Math.random() * 999_999),
);
if (CHOICE.search !== null)
  window.history.replaceState(null, '', window.location.pathname + CHOICE.search + window.location.hash);
setContentTag(CHOICE.tag);

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
    const assembled = CHOICE.campaign === RANDOM ? packContent(CHOICE.seed) : null;
    const content = await ContentManager.load(assembled ?? staticContent(CHOICE.campaign));
    content.install();
    const assembly = assembled && (await assembled.assembly);
    if (assembly)
      console.info(
        `Random campaign ${assembly.seed}: "${assembly.arc}" told by ${assembly.keeper} through ${assembly.regions.join(', ')}`,
      );
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
    if (import.meta.env.DEV)
      Object.assign(window, { __game: { app, scenes, overworld, content, campaign: CHOICE, assembly, items: ITEMS } });
  } catch (err) {
    loading.fail(err);
    throw err;
  }
})();
