import { Application, BitmapFont, BitmapFontManager, CullerPlugin, extensions, TextureStyle } from 'pixi.js';
import { disabledCapabilities } from './systems/capabilities';
import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/crimson-text/400.css';
import '@fontsource/crimson-text/600.css';
import './ui.css';
import { initAssets, liveContent, loadSprites, loadZone, packContent, staticContent, unloadZone } from './assets';
import { chooseCampaign, DEFAULT_WORLD, LIVE, queryForTag, RANDOM } from './content/campaignChoice';
import { worldLooks } from './content/LiveSource';
import { setContentTag } from './net/session';
import { ContentManager } from './content/ContentManager';
import { SceneManager } from './core/Scene';
import { createTouchControls } from './core/touch';
import { Choices } from './hud/Choices';
import { Dialog } from './hud/Dialog';
import { Hud } from './hud/Hud';
import { Loading } from './hud/Loading';
import { installProblemBanner } from './hud/ProblemBanner';
import { Menu } from './hud/Menu';
import { ShopCounter } from './hud/ShopCounter';
import { TradeUi } from './hud/Trade';
import { Session } from './net/session';
import { wantsDmBot } from './scenes/overworld/DmBot';
import { OverworldScene } from './scenes/OverworldScene';
import { MOB_KINDS } from './systems/combat';
import { NPC_LOOKS } from './systems/looks';
import { ITEMS } from './systems/items';

/**
 * The world the game plays: campaign 1, the sandbox where new capabilities are built, unless the address
 * (`?campaign=campaign2`, `?campaign=random`, `?seed=42` for a random campaign assembled from the packs) or the build
 * (VITE_CAMPAIGN) names another. See content/campaignChoice.ts.
 */
const CHOICE = chooseCampaign(
  window.location.search,
  import.meta.env.VITE_CAMPAIGN || DEFAULT_WORLD,
  () => 1 + Math.floor(Math.random() * 999_999),
);
if (CHOICE.search !== null)
  window.history.replaceState(null, '', window.location.pathname + CHOICE.search + window.location.hash);
setContentTag(CHOICE.tag);
installProblemBanner();

void (async () => {
  const loading = new Loading();
  try {
    // Pixel art: every texture loaded from here on is sampled with nearest-neighbour filtering.
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    extensions.add(CullerPlugin); // skips drawing `cullable` objects (map props) that are off screen

    const app = new Application();
    try {
      await app.init({
        // Pixi's canvas fallback cannot draw this game (it crashes in drawImage), so never fall back to it: with no
        // WebGL or WebGPU the start fails with a message that says what to turn on (below).
        preference: ['webgl', 'webgpu'],
        background: '#000000',
        resizeTo: window,
        antialias: false,
        roundPixels: true,
        // Render at the device's pixel density so the canvas stays crisp on phones and retina screens.
        // app.screen and layout stay in CSS pixels (autoDensity).
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
    } catch (err) {
      console.error('renderer failed to start', err);
      throw new Error(
        'This browser cannot draw the game: graphics acceleration (WebGL) is off. In Chrome, open Settings > System, turn on "Use graphics acceleration when available", restart Chrome, and check that chrome://gpu says WebGL is hardware accelerated.',
        { cause: err },
      );
    }
    document.body.appendChild(app.canvas);

    // Glyph atlas for floating combat text (white + black outline, tinted per use). The world layer is
    // scaled up by the camera zoom, so the atlas is generated at a high resolution.
    // The same pixel face as the HUD (Pixelify Sans, OFL): wait for it, or the atlas would be drawn in the fallback.
    await document.fonts.load('700 10px "Pixelify Sans"').catch(() => []);
    BitmapFont.install({
      name: 'FloatText',
      resolution: 4,
      chars: BitmapFontManager.ASCII,
      textureStyle: { scaleMode: 'linear' },
      style: {
        fontFamily: '"Pixelify Sans", monospace',
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
    const live = CHOICE.campaign === LIVE ? liveContent(CHOICE.seed, CHOICE.arc) : null;
    const content = await ContentManager.load(assembled ?? live ?? staticContent(CHOICE.campaign));
    content.install();
    const world = live && (await live.world);
    if (world)
      console.info(
        `Live world ${CHOICE.seed}: "${world.arcName}" told by ${world.keeper}, from ${world.storyRegions[0]}`,
      );
    const assembly = assembled && (await assembled.assembly);
    if (assembly)
      console.info(
        `Random campaign ${assembly.seed}: "${assembly.arc}" told by ${assembly.keeper} through ${assembly.regions.join(', ')}`,
      );
    const off = disabledCapabilities();
    if (off.length) console.info(`This campaign plays without: ${off.join(', ')}`);
    const start = content.getBiomeInfo(content.startNode.biome_type);
    const [sprites, zone] = await Promise.all([
      loadSprites(undefined, world ? worldLooks(world) : []), // a live world may come to need any pack's people
      loadZone(start.map, (fraction) => loading.progress(fraction), start.tilesets),
    ]);

    const scenes = new SceneManager(app);
    const touch = createTouchControls(() => scenes.resize());
    const session = new Session();
    // A friend only needs the host's code: if the host is in another world, this page moves there and joins again.
    session.worldMismatch = (tag, code) => {
      const query = queryForTag(tag);
      if (query) window.location.assign(`${window.location.pathname}${query}#join=${code}&go=1`);
    };
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
      const look = MOB_KINDS[kind]?.look ?? NPC_LOOKS[kind]; // a monster's id, or a person's (a quest's meet)
      try {
        return look ? sprites.wardrobe.portrait(look) : null;
      } catch (err) {
        console.warn('quest picture failed', err); // a missing picture must never stop the menu from opening
        return null;
      }
    };
    const overworld = new OverworldScene(
      zone,
      sprites,
      ui,
      loadZone,
      unloadZone,
      app.renderer,
      content,
      world,
      live ? '' : CHOICE.tag,
    );
    scenes.change(overworld);
    scenes.start();
    await overworld.persistence.restore(); // a solo game picks up where this browser left off
    overworld.splash.reset(); // the saved level is not one just gained
    ui.menu.onNewGame = overworld.persistence.enabled
      ? () => {
          overworld.persistence.forget();
          window.location.reload();
        }
      : null;
    loading.done();

    // The handle an outside Dungeon Master drives this page through (tools/dm-bot), only when the address asks for it.
    if (wantsDmBot(window.location.search)) Object.assign(window, { dmBot: overworld.dmBot() });

    // Dev-only handle for playtest scripts (see .claude/skills/playtest); stripped from production builds.
    if (import.meta.env.DEV)
      Object.assign(window, {
        __game: { app, scenes, overworld, content, campaign: CHOICE, assembly, world, items: ITEMS },
      });
  } catch (err) {
    loading.fail(err);
    throw err;
  }
})();
