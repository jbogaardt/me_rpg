// Boots Towercraft: the PixiJS application, the race picker, the camera (drag to pan, wheel or pinch to zoom) and the DOM
// controls, and runs the match at a fixed step. The rules are in sim/ (Pixi-free); this file only draws a Match and turns
// taps into commands.

import '@fontsource/cinzel/700.css';
import '@fontsource/crimson-text/400.css';
import '@fontsource/crimson-text/600.css';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture, TextureStyle } from 'pixi.js';
import { icon } from './icons';
import { isMuted, playCues, setMuted, unlockAudio } from './audio';
import { playMusic, stopMusic } from './music';
import { say } from './voice';
import { SoundWatch } from './soundEvents';
import { drawnPos } from './stagger';
import type { Ai } from './sim/ai';
import { castleTrim, smithyTrim, trimKey, type Trim } from './trim';
import { hslToHex, recolor, RACE_HUE, SIDE_HUE, shadeOf, type Hsl } from './recolor';
import { Wreck } from './wreck';
import { normalizeCode } from '../../src/net/roomCode';
import { Duel, type DuelPhase } from './net/duel';
import {
  apply,
  Lockstep,
  makeAis,
  NET_VERSION,
  type Person,
  packMatch,
  unpackMatch,
  type Command,
  type Message,
  type Packed,
} from './net/lockstep';
import { BOARDS, BOARD_IDS, DEFAULT_BOARD_ID, boardIdsFor, laneOf } from './sim/board';
import {
  MAX_LEVEL,
  RACES,
  REACH_SCALE,
  roleOf as buildingRole,
  type Role,
  RACE_IDS,
  type Cost,
  type RaceId,
  type SheetKind,
  type TowerDef,
  type UnitDef,
  type UpgradeDef,
} from './sim/races';
import {
  PAY_EVERY,
  UNIT_CAP,
  boostOf,
  buildReach,
  canAfford,
  repairCost,
  repairable,
  sellValue,
  canBuild,
  canTarget,
  allied,
  canSee,
  foesOf,
  laneFor,
  nearestOnLane,
  SWITCH_NEAR,
  openLanes,
  sightsFor,
  teamOf,
  incomeOf,
  isCastleSeen,
  isSeen,
  maxPurchases,
  newMatch,
  nextUpgrade,
  soldierCost,
  step,
  towerUnlocked,
  unitUnlocked,
  upgradeCost,
  upgradeLacks,
  upgradeLevel,
  visionOf,
  type Death,
  type Match,
  type Owner,
  type Shot,
  type Tower,
  type Unit,
  type Vision,
} from './sim/sim';

const CELL = 40;
const STEP = 0.05;
/** Which player this page is: 0 alone and for the host of an online match, 1 for the one who joined. */
let YOU: Owner = 0;

/** A map's id (see `BOARDS`). */
type BoardId = string;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Everything that fights (units, towers) is drawn this many times its old size, so it stands in proportion to the roads. */
const SIZE = 2;
/** How big a unit's sprite is drawn (its frame times this): walkers scale with their hit points, flyers have their own size. */
const unitScale = (def: UnitDef) =>
  SIZE * (def.look?.scale ?? SHEETS[def.kind].scale ?? 1.1 + Math.min(0.7, Math.sqrt(def.hp) / 55));
/** A tower's picture is this wide (px), whatever its sheet; a castle's sprite is drawn at CASTLE_SCALE of its frame. */
const TOWER_PX = 50 * SIZE;
const CASTLE_SCALE = 1.4;
/** How long (s) a razed tower and a fallen castle take to sink into the ground. */
const TOWER_FALL = 2.4;
const CASTLE_FALL = 4;
/** The figure in a frame is about this tall (px), standing on the frame's anchor: where a health bar goes. */
const figureOf = (kind: SheetKind) => (kind === 'bat' ? 14 : kind === 'bigbat' ? 30 : 32);

// The unit sheets are Wyrmsun's: five directions across (up, up-right, right, down-right, down; the left ones are the right ones
// mirrored) and the game's own animation down the rows, which differ by sheet (rows are frames / 5 in Wyrmsun's animation scripts).
interface Sheet {
  frame: number;
  walk: number[];
  attack: number[];
  death: number[];
  /** Drawn at this size whatever its hit points (the walkers scale with them). */
  scale?: number;
}
const SHEETS: Record<SheetKind, Sheet> = {
  foot: { frame: 72, walk: [1, 2, 0, 3, 4, 0], attack: [5, 6, 7, 8], death: [9, 10, 11] },
  archer: { frame: 72, walk: [1, 2, 0, 3, 4, 0], attack: [5, 6, 7, 8, 9, 10], death: [11, 12, 13] },
  gryphon: { frame: 100, walk: [0, 1, 2, 3], attack: [0, 1, 2, 3, 4, 5, 6], death: [7, 8, 9, 10, 11, 12], scale: 0.8 },
  glider: { frame: 100, walk: [0, 1], attack: [0], death: [2, 3, 4], scale: 0.7 },
  // Bats and birds: rows 0-5 a wing-beat cycle, 6-8 the dive, 9-11 the fall (13 rows; 32 px frames, the big bat's 64 px).
  bat: { frame: 32, walk: [0, 1, 2, 3, 4, 5], attack: [6, 7, 8, 7], death: [9, 10, 11], scale: 2 },
  bigbat: { frame: 64, walk: [0, 1, 2, 3, 4, 5], attack: [6, 7, 8, 7], death: [9, 10, 11], scale: 1 },
  // A field engine: it rolls (row 0), throws (1-3) and falls apart (3).
  engine: { frame: 72, walk: [0], attack: [1, 2, 3, 0], death: [3] },
};
/** Where in a frame (0 = top, 1 = bottom) the figure's feet are: the sheets leave empty room under the 72 px figures. */
const feetAt = (kind: SheetKind) => (SHEETS[kind].frame === 72 ? 0.7 : 0.8);
const STRIDE = 0.9; // cells walked per stride
const FLAP = 10; // wing beats (sheet rows) a second for a flyer
const DEATH_FRAME = 0.12; // seconds per death frame
const CORPSE_LIFE = 1.6; // seconds a corpse stays (fading over the last half)
/** How high (px) an air unit is drawn above the ground it flies over. */
const FLIGHT = 26 * SIZE;
/** How long (seconds) a unit's strike animation plays after it hits (its swing, shot or dive), and how far (px) a melee blow lunges. */
const STRIKE_TIME = 0.42;
const LUNGE = 9 * SIZE;

/** The sheet column (and whether to mirror it) for a unit heading along (dx, dy), screen coordinates. */
function direction(dx: number, dy: number): { col: number; flip: boolean } {
  const octant = Math.round((Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI / 45); // -2 up .. 2 down, by 45 degrees, right side only
  return { col: [0, 1, 2, 3, 4][octant + 2]!, flip: dx < 0 };
}

/** Fog texels per cell: the fog is a tiny canvas of soft round pools (the technique of Me RPG's underground darkness), scaled up smooth. */
const FOG_RES = 8;
/** How fast (cells a second) a pool of sight grows when a tower goes up and shrinks when it falls: about half a second for a tower. */
const FOG_SPEED = 14;
/** Fog colour (a warm dark), how much it dims, and how much of the dark lifts over ground that was once yours to build on. */
const FOG_COLOR = 'rgba(18, 12, 9, 0.74)';
const FOG_MEMORY = 0.3;

const ZOOM_MAX = 2.6;
const TAP_SLOP = 8; // px a finger may move and still be a tap

void (async () => {
  TextureStyle.defaultOptions.scaleMode = 'linear';
  const app = new Application();
  await app.init({
    background: 0x0e1117,
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  });
  document.body.prepend(app.canvas);
  app.canvas.style.touchAction = 'none'; // the game handles drag and pinch itself

  // --- Pictures (towercraft/public/art, CREDITS.md) -------------------------------------------------------------------
  const load = (url: string) => Assets.load<Texture>(url);
  const cut = (tex: Texture, x: number, y: number, w: number, h: number) =>
    new Texture({ source: tex.source, frame: new Rectangle(x, y, w, h) });
  /** The first, finished frame of a building sheet: a square as wide as the sheet (64, 96 or 128 px). */
  const squareFrame = (tex: Texture) => cut(tex, 0, 0, tex.width, tex.width);
  // Nothing is loaded up front: the title screen needs only its own small pictures. The art of the match is fetched while the player
  // chooses (`prefetch`), and what is still missing when a race is picked is awaited behind a progress bar (`ensureAssets`).
  const towerTextures = new Map<string, Texture>();
  const castleTextures = new Map<string, Texture>();
  const sheetTextures = new Map<string, Texture>();
  const fieldTextures = new Map<BoardId, Texture>();
  const jobs = new Map<string, Promise<void>>();
  const once = (key: string, work: () => Promise<void>) => {
    let job = jobs.get(key);
    if (!job) jobs.set(key, (job = work()));
    return job;
  };
  const getTower = (n: string) =>
    once(`t:${n}`, async () => void towerTextures.set(n, squareFrame(await load(`art/${n}.png`))));
  const getCastle = (n: string) =>
    once(`c:${n}`, async () => void castleTextures.set(n, squareFrame(await load(`art/${n}.png`))));
  const getSheet = (n: string) =>
    once(`s:${n}`, async () => void sheetTextures.set(n, await load(`art/units/${n}.png`)));
  /** The fields (art/maps/<id>.png) are drawn by Me RPG's map pipeline from its LPC terrain atlas (tools/towercraftBoard.ts). */
  const getField = (id: BoardId) =>
    once(`f:${id}`, async () => void fieldTextures.set(id, await load(`art/maps/${id}.png`)));
  /** What one race needs on the field: its buildings, castle and unit sheets. */
  const raceJobs = (race: RaceId) =>
    [...new Set(RACES[race].towers.map((t) => t.art))]
      .map((n) => () => getTower(n))
      .concat(
        [() => getCastle(RACES[race].castle.art)],
        [...new Set(RACES[race].units.map((u) => u.sheet))].map((n) => () => getSheet(n)),
      );
  /** Wait for everything a match of these races on this map needs (calling `progress` from 0 to 1 as it arrives). */
  async function ensureAssets(races: RaceId[], map: BoardId, progress?: (done: number) => void) {
    const all = [() => getField(map), ...[...new Set(races)].flatMap(raceJobs)];
    let n = 0;
    await Promise.all(
      all.map((j) =>
        j().then(() => {
          progress?.(++n / all.length);
        }),
      ),
    );
  }
  /** While the player looks at the title screen: fetch the rest, the chosen map first, a few pictures at a time. */
  async function prefetch() {
    const queue = [
      () => getField(chosenMap),
      ...RACE_IDS.flatMap(raceJobs),
      ...BOARD_IDS.map((id) => () => getField(id)),
    ];
    const lane = async () => {
      for (let j = queue.shift(); j; j = queue.shift()) {
        await j().catch(() => undefined);
        await new Promise((r) => window.setTimeout(r, 30)); // leave room for the page's own work
      }
    };
    await Promise.all([lane(), lane(), lane()]);
  }
  const frames = new Map<string, Texture>();
  /** One frame of a unit sheet (cached): row, and column = direction. */
  const unitFrame = (sheet: string, kind: SheetKind, row: number, col: number) => {
    const key = `${sheet}:${row}:${col}`;
    const size = SHEETS[kind].frame;
    let t = frames.get(key);
    if (!t) frames.set(key, (t = cut(sheetTextures.get(sheet)!, col * size, row * size, size, size)));
    return t;
  };
  // --- The scene -----------------------------------------------------------------------------------------------------
  const world = new Container();
  const field = new Sprite();
  // The fog: a canvas of shade (dark where nothing of yours sees, soft round pools cut out for every castle, tower and unit)
  // and one of tint (a cool wash where only a tower, the castle or a unit sees but you may not build), scaled up smoothly.
  const makeFogLayer = (cols: number, rows: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = cols * FOG_RES;
    canvas.height = rows * FOG_RES;
    const ctx = canvas.getContext('2d')!;
    const sprite = new Sprite(Texture.from(canvas));
    sprite.width = cols * CELL;
    sprite.height = rows * CELL;
    return { canvas, ctx, sprite };
  };
  let shade = makeFogLayer(1, 1);
  let tint = makeFogLayer(1, 1);
  const fogLayer = new Container();
  fogLayer.addChild(tint.sprite, shade.sprite);
  const areaLayer = new Graphics(); // where towers may be built
  const sortLayer = new Container(); // castles, towers and units, sorted by y so what is in front hides what is behind
  sortLayer.sortableChildren = true;
  const corpseLayer = new Container();
  const live = new Graphics(); // hover ring, attacks, health bars
  const floatLayer = new Container(); // the pay-day figures over your mills and quarries
  const ghostSprite = new Sprite(); // the tower about to be placed (a touch's first tap, or the mouse's hover)
  ghostSprite.anchor.set(0.5, 0.78);
  ghostSprite.alpha = 0.6;
  ghostSprite.visible = false;
  world.addChild(field, fogLayer, areaLayer, corpseLayer, sortLayer, live, floatLayer, ghostSprite);
  app.stage.addChild(world);

  let chosenMap: BoardId = 'frostlands'; // the menu's first pick: a meandering map (the sim's own default is the classic road)
  try {
    const saved = localStorage.getItem('towercraft:map');
    if (saved && BOARDS[saved]) chosenMap = saved;
  } catch {
    /* no storage: the default map */
  }
  let match: Match = newMatch(['legion', 'swarm'], BOARDS[chosenMap]);
  /** The castle positions of the map being played. */
  const castleAt = (o: Owner) => match.board.castles[o]!;
  /** A seat's colour (`recolor.ts`): its race's hue in a duel, its side's with more seats, and a shade of that hue for each further seat that shares it, so two of one race still tell apart. It paints the purple of its castle, towers and buildings, and rings its units. */
  const hueOf = (o: Owner) =>
    match.board.seats <= 2
      ? (RACE_HUE[match.players[o]!.race] ?? 0)
      : allied(match, o, YOU)
        ? SIDE_HUE.mine
        : SIDE_HUE.foe;
  const shadeOfSeat = (o: Owner): Hsl => {
    const hue = hueOf(o);
    const sharing = match.players.map((_, i) => i).filter((i) => hueOf(i) === hue);
    return shadeOf(hue, sharing.indexOf(o));
  };
  const colorOf = (o: Owner): number => hslToHex(shadeOfSeat(o));
  /** A building picture painted in a seat's colour (`recolor`): made once per picture and colour, from the sheet already loaded. */
  const paintedCanvas = new Map<string, HTMLCanvasElement>();
  /** `tint` (a building's `look`) multiplies the picture: the same sheet drawn another way (a Skybow is a watch tower in blue). */
  const paintedArt = (base: Texture, o: Owner, tint = 0xffffff): HTMLCanvasElement => {
    const key = `${base.source.uid}|${colorOf(o)}|${tint}`;
    let canvas = paintedCanvas.get(key);
    if (!canvas) {
      const { x, y, width: w, height: h } = base.frame;
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(base.source.resource as CanvasImageSource, x, y, w, h, 0, 0, w, h);
      const px = ctx.getImageData(0, 0, w, h);
      recolor(px.data, shadeOfSeat(o));
      if (tint !== 0xffffff) {
        const [r, g, b] = [(tint >> 16) / 255, ((tint >> 8) & 255) / 255, (tint & 255) / 255];
        for (let i = 0; i < px.data.length; i += 4) {
          px.data[i] = px.data[i]! * r;
          px.data[i + 1] = px.data[i + 1]! * g;
          px.data[i + 2] = px.data[i + 2]! * b;
        }
      }
      ctx.putImageData(px, 0, 0);
      paintedCanvas.set(key, canvas);
    }
    return canvas;
  };
  const paintedTextures = new WeakMap<HTMLCanvasElement, Texture>();
  const paintedTexture = (base: Texture, o: Owner, tint?: number): Texture => {
    const canvas = paintedArt(base, o, tint);
    let tex = paintedTextures.get(canvas);
    if (!tex) paintedTextures.set(canvas, (tex = Texture.from(canvas)));
    return tex;
  };
  const playingNow = () => !match.players[YOU]!.out && match.winner < 0;
  /** Where a seat's camp lies on the field, in words (north-west, south, middle). */
  const castleName = (o: Owner) => {
    const [x, y] = castleAt(o);
    const { cols, rows } = match.board;
    const v = y < rows * 0.4 ? 'north' : y > rows * 0.6 ? 'south' : '';
    const h = x < cols * 0.4 ? 'west' : x > cols * 0.6 ? 'east' : '';
    return [v, h].filter(Boolean).join('-') || 'middle';
  };
  /** The road chip the mouse is over: that road is lit on the field. */
  let laneHover: number | undefined;
  /** The colour of a seat's health bar and rings: green for you, teal for an ally, red for a foe. */
  const barColor = (o: Owner) => (o === YOU ? 0x6fd36f : allied(match, o, YOU) ? 0x6fc0d3 : 0xe0777b);
  const boardW = () => match.board.cols * CELL;
  const boardH = () => match.board.rows * CELL;
  /** Lay a map out: its picture and a fog canvas of its size (maps differ in size). */
  const applyBoard = () => {
    const { cols, rows, id } = match.board;
    field.texture = fieldTextures.get(id) ?? field.texture;
    field.width = cols * CELL;
    field.height = rows * CELL;
    fogLayer.removeChildren();
    shade.sprite.destroy(true);
    tint.sprite.destroy(true);
    shade = makeFogLayer(cols, rows);
    tint = makeFogLayer(cols, rows);
    fogLayer.addChild(tint.sprite, shade.sprite);
  };
  /** The computers of the match (one per seat that is not a person), and the seed they play by (the same on both pages online). */
  let ais: Ai[] = [];
  let matchSeed = 0;
  /** The online match being played, if any (net/lockstep.ts): the shared clock the commands go through. */
  let online: { lock: Lockstep } | undefined;
  /** Whether the match has two on one side against computers (the other person is a partner, not a rival). */
  const coop = () => match.board.seats > 2;
  /** What the end screen says when it is not the plain win or loss (the rival left, the games disagreed). */
  let endText: [string, string] | undefined;
  /** How long (s) the match has been stalled waiting for the rival's commands. */
  let stalled = 0;
  /** A rejoining player's match (what the host sent, applied when the art is loaded), and the host's code to give the rival. */
  let rejoinState: Packed | undefined;
  let hostCode = '';
  let selected: TowerDef | undefined;
  /** Your units picked to command (a group, by id), where the mouse is over the field (cells), and a line of news for the hint. */
  const selection = new Set<number>();
  let hoverAt: [number, number] | undefined;
  let hintNote = '';
  let hintUntil = 0;
  let sent: { x: number; y: number; at: number } | undefined;
  let hover: [number, number] | undefined;
  let acc = 0;
  let clock = 0;
  let started = false;

  /** Where (px below its cell's centre) a tower's feet stand. */
  const TOWER_FOOT = 10;
  /**
   * Embellishments that grow with upgrades (see `trim.ts`): race-coloured pennants along the roof line, standing on poles, and a
   * ring round the base at the top step. `half` is half the building's drawn width (px), `top` how far above its feet the roof is.
   */
  const drawTrim = (g: Graphics, trim: Trim, color: number, half: number, top: number) => {
    g.clear();
    if (trim.ring) g.ellipse(0, 8, half * 1.05, half * 0.36).stroke({ color, width: 2.5, alpha: 0.8 });
    const n = trim.pennants;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : (-0.8 + (1.6 * i) / (n - 1)) * half;
      const lift = top + (i % 2 ? 0 : 6);
      g.moveTo(x, -lift + 18)
        .lineTo(x, -lift - 14)
        .stroke({ color: 0x3a2a1a, width: 2 });
      g.poly([x, -lift - 14, x + 13, -lift - 9, x, -lift - 3]).fill({ color });
    }
  };
  const castleSprites: Container[] = [];
  const castleBase = (o: Owner) => CASTLE_SCALE * castleTrim(match.players[o]!.castle.level).scale;
  const buildCastles = () => {
    for (const c of castleSprites) c.destroy({ children: true });
    castleSprites.length = 0;
    for (const [o] of match.players.entries()) {
      const c = new Container();
      const color = colorOf(o);
      c.addChild(new Graphics().ellipse(0, 8, 56 * CASTLE_SCALE, 20 * CASTLE_SCALE).fill({ color, alpha: 0.45 }));
      const sprite = new Sprite(paintedTexture(castleTextures.get(RACES[match.players[o]!.race].castle.art)!, o));
      sprite.anchor.set(0.5, 0.78);
      sprite.scale.set(castleBase(o));
      c.addChild(sprite);
      c.addChild(new Graphics()); // pennants and ring that grow with the castle level (`drawTrim`)
      c.position.set(castleAt(o)[0] * CELL, castleAt(o)[1] * CELL);
      c.zIndex = castleAt(o)[1] + 1;
      sortLayer.addChild(c);
      castleSprites.push(c);
    }
  };

  // --- Camera: drag to pan, wheel or pinch to zoom ------------------------------------------------------------------
  const topBar = () => 0; // the resources are a see-through overlay: the field runs under it
  const bottomBar = () => $('dock').offsetHeight + 12;
  const viewH = () => window.innerHeight - topBar() - bottomBar();
  const fitZoom = () => Math.min(window.innerWidth / boardW(), viewH() / boardH());
  const minZoom = () => Math.min(fitZoom(), ZOOM_MAX);

  function clampCamera() {
    const z = Math.min(ZOOM_MAX, Math.max(minZoom(), world.scale.x));
    world.scale.set(z);
    const w = boardW() * z;
    const h = boardH() * z;
    const slack = 40; // a little of the dark may show past an edge
    world.x =
      w <= window.innerWidth
        ? (window.innerWidth - w) / 2
        : Math.min(slack, Math.max(window.innerWidth - w - slack, world.x));
    world.y =
      h <= viewH()
        ? topBar() + (viewH() - h) / 2
        : Math.min(topBar() + slack, Math.max(topBar() + viewH() - h - slack, world.y));
  }
  function zoomAt(sx: number, sy: number, factor: number) {
    const before = world.scale.x;
    const z = Math.min(ZOOM_MAX, Math.max(minZoom(), before * factor));
    world.x = sx - ((sx - world.x) / before) * z;
    world.y = sy - ((sy - world.y) / before) * z;
    world.scale.set(z);
    clampCamera();
  }
  /** Zoom in on a point of the field (cells) so it sits at the middle of the view. */
  function focus(cx: number, cy: number, zoom: number) {
    world.scale.set(zoom);
    world.x = window.innerWidth / 2 - cx * CELL * zoom;
    world.y = topBar() + viewH() / 2 - cy * CELL * zoom;
    clampCamera();
  }
  const home = () => focus(castleAt(YOU)[0] + 4, castleAt(YOU)[1] + 5, Math.max(minZoom(), Math.min(1.1, ZOOM_MAX)));
  window.addEventListener('resize', clampCamera);

  const cellAt = (sx: number, sy: number): [number, number] | undefined => {
    const col = Math.floor((sx - world.x) / world.scale.x / CELL);
    const row = Math.floor((sy - world.y) / world.scale.y / CELL);
    return col >= 0 && row >= 0 && col < match.board.cols && row < match.board.rows ? [col, row] : undefined;
  };

  // Input, the same ideas for a finger and a mouse. Pan: drag with a finger, or the middle button, or the arrow keys / WASD. The
  // right button does nothing (the browser's menu owns it). Zoom: pinch or wheel. Select: a mouse drag with the left button draws a
  // box; on a touch screen, press and hold a moment, then drag. Tap a unit to pick it (double-tap: every one of its kind in view),
  // tap again with Shift or Ctrl to add or drop it. Then tap a rival's tower or castle to send the group at it; Esc, or a tap on
  // bare ground, lets go.
  const pointers = new Map<number, { x: number; y: number }>();
  type Gesture = 'wait' | 'pan' | 'box' | 'pinch';
  let gesture: Gesture = 'wait';
  let pressStart = { x: 0, y: 0 };
  let pressButton = 0;
  let pressAdd = false;
  let boxTo = { x: 0, y: 0 };
  let longPress: number | undefined;
  let pinch = 0;
  const LONG_PRESS = 380;
  const marquee = $('marquee');
  const drawMarquee = () => {
    const [x0, y0] = [Math.min(pressStart.x, boxTo.x), Math.min(pressStart.y, boxTo.y)];
    marquee.hidden = false;
    marquee.style.cssText = `left:${x0}px;top:${y0}px;width:${Math.abs(boxTo.x - pressStart.x)}px;height:${Math.abs(boxTo.y - pressStart.y)}px`;
  };
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  app.canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return; // the right button is the browser's
    try {
      app.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer that is already gone */
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      pressStart = { x: e.clientX, y: e.clientY };
      pressButton = e.button;
      pressAdd = e.shiftKey || e.ctrlKey || e.metaKey;
      gesture = 'wait';
      window.clearTimeout(longPress);
      if (e.pointerType !== 'mouse')
        longPress = window.setTimeout(() => {
          if (gesture !== 'wait' || pointers.size !== 1 || !started || selected) return;
          gesture = 'box';
          boxTo = { ...pressStart };
          navigator.vibrate?.(12);
        }, LONG_PRESS);
    } else {
      window.clearTimeout(longPress);
      gesture = 'pinch';
      marquee.hidden = true;
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  });
  app.canvas.addEventListener('pointermove', (e) => {
    hover = e.pointerType === 'mouse' ? cellAt(e.clientX, e.clientY) : undefined;
    hoverAt =
      e.pointerType === 'mouse'
        ? [(e.clientX - world.x) / world.scale.x / CELL, (e.clientY - world.y) / world.scale.y / CELL]
        : undefined;
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const [dx, dy] = [e.clientX - p.x, e.clientY - p.y];
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      if (gesture === 'wait' && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > TAP_SLOP) {
        window.clearTimeout(longPress);
        // The left mouse button selects (unless a tower is being placed); everything else drags the field.
        gesture = e.pointerType === 'mouse' && pressButton === 0 && started && !selected ? 'box' : 'pan';
      }
      if (gesture === 'box') {
        boxTo = { x: e.clientX, y: e.clientY };
        drawMarquee();
      } else if (gesture === 'pan' || gesture === 'pinch') {
        world.x += dx;
        world.y += dy;
        clampCamera();
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const now = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch > 0) zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, now / pinch);
      pinch = now;
    }
  });
  const release = (e: PointerEvent) => {
    const wasOne = pointers.size === 1;
    pointers.delete(e.pointerId);
    window.clearTimeout(longPress);
    marquee.hidden = true;
    if (wasOne && e.type === 'pointerup') {
      if (gesture === 'box') finishBox();
      else if (gesture === 'wait') tap(e.clientX, e.clientY, e.pointerType !== 'mouse', { add: pressAdd });
    }
    if (pointers.size === 0) gesture = 'wait';
    pinch = 0;
  };
  app.canvas.addEventListener('pointerup', release);
  app.canvas.addEventListener('pointercancel', release);
  app.canvas.addEventListener('pointerleave', () => {
    hover = undefined;
    hoverAt = undefined;
  });
  app.canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );
  $('cam-all').onclick = () => started && selectAll();
  $('cam-home').onclick = home;
  $('cam-fit').onclick = () => focus(match.board.cols / 2, match.board.rows / 2, minZoom());

  /** The touch's pending tower: the first tap on a valid cell leaves a ghost here; Confirm (or a second tap) places it. */
  let ghost: [number, number] | undefined;
  /** The last cell tapped, so its caption stays up on a touch screen (no hover). */
  let lastTap: [number, number] | undefined;
  const ghostBar = $('ghost');
  const setGhost = (cell: [number, number] | undefined) => {
    ghost = cell;
    ghostBar.hidden = !cell;
  };
  /** Do something to your side of the match: at once alone, or on the same tick on both pages online (net/lockstep.ts). */
  const cmd = (c: Command) => {
    if (online) online.lock.issue(c);
    else apply(match, YOU, c);
  };
  const place = (cell: [number, number]) => {
    if (selected && canBuild(match, YOU, selected, cell[0], cell[1]) === 'ok') {
      cmd({ k: 'build', id: selected.id, col: cell[0], row: cell[1] });
      // Keep the tower selected while the player can pay for another (a row of towers is the usual use).
      if (!canAfford(match.players[YOU]!, selected.cost) || towerUnlocked(match, YOU, selected) !== 'ok')
        selected = undefined;
      refresh();
    }
    setGhost(undefined);
  };
  $('ghost-ok').onclick = () => ghost && place(ghost);
  $('ghost-no').onclick = () => setGhost(undefined);

  const myBunkerAt = (wx: number, wy: number) =>
    match.towers.find(
      (t) => t.owner === YOU && t.def.bunker && Math.hypot(wx - (t.col + 0.5), wy - (t.row - 0.3)) <= 1.2,
    );

  /** A tower under a point (cells), yours or the rival's (the rival's only while you can see it): the nearest. */
  const towerAt = (wx: number, wy: number, mine: boolean) => {
    const vision = visionOf(match);
    let best: Tower | undefined;
    let bestD = Infinity;
    for (const t of match.towers) {
      if (t.hp <= 0 || (t.owner === YOU) !== mine || (!mine && !isSeen(match, YOU, t, vision))) continue;
      const d = Math.hypot(wx - (t.col + 0.5), wy - (t.row - 0.4));
      if (d <= 1.5 && d < bestD) [best, bestD] = [t, d];
    }
    return best;
  };

  /** One of your units under a point (cells; a unit's middle is above its feet, higher still for a flyer): the nearest. */
  const unitMid = (u: Unit): [number, number] => {
    const [x, y] = drawnPos(u, match.board);
    return [x, y - (figureOf(u.def.kind) * unitScale(u.def)) / 2 / CELL - (u.def.air ? FLIGHT / CELL : 0)];
  };
  const myUnitAt = (wx: number, wy: number) => {
    let best: Unit | undefined;
    let bestD = Infinity;
    for (const u of match.units) {
      if (u.owner !== YOU || u.hp <= 0 || u.spent) continue;
      const [x, y] = unitMid(u);
      const d = Math.hypot(wx - x, wy - y);
      if (d <= Math.max(0.9, (figureOf(u.def.kind) * unitScale(u.def)) / CELL / 1.8) && d < bestD)
        [best, bestD] = [u, d];
    }
    return best;
  };
  /** A tower of the rival's that you can see, under a point (a tower is a tall sprite too). */
  const foeTowerAt = (wx: number, wy: number) => {
    const vision = visionOf(match);
    let best: Tower | undefined;
    let bestD = Infinity;
    for (const t of match.towers) {
      if (allied(match, t.owner, YOU) || t.hp <= 0 || !isSeen(match, YOU, t, vision)) continue;
      const d = Math.hypot(wx - (t.col + 0.5), wy - (t.row - 0.4));
      if (d <= 1.5 && d < bestD) [best, bestD] = [t, d];
    }
    return best;
  };
  /** The seat of a rival castle, if you can see it and the point is on it. */
  const foeCastleAt = (wx: number, wy: number): Owner | undefined =>
    foesOf(match, YOU).find(
      (o) => isCastleSeen(match, YOU, o) && Math.hypot(wx - castleAt(o)[0], wy - (castleAt(o)[1] - 1.6)) <= 3,
    );

  /** The units you have picked that are still alive. */
  const picked = () => match.units.filter((u) => selection.has(u.id) && u.owner === YOU && u.hp > 0 && !u.spent);
  /** One of the picked units says a line (the first of the group). */
  const speak = (line: 'pick' | 'go') => {
    const first = picked()[0];
    if (first) say(match, first, line);
  };
  const select = (units: Unit[], add = false) => {
    if (add && units.length === 1 && selection.has(units[0]!.id))
      selection.delete(units[0]!.id); // a second tap drops it
    else {
      if (!add) selection.clear();
      for (const u of units) selection.add(u.id);
    }
    if (selection.size) {
      selected = undefined;
      setGhost(undefined);
      showCard({ kind: 'sel' });
      speak('pick');
    } else if (cardOf?.kind === 'sel') closeCard();
  };
  const selectAll = () => select(match.units.filter((u) => u.owner === YOU && u.hp > 0 && !u.spent));
  const note = (text: string) => {
    hintNote = text;
    hintUntil = clock + 2.6;
  };
  /** Send the group at the rival's tower or castle at a point (cells); false if there is neither there. */
  function command(wx: number, wy: number): boolean {
    const units = picked();
    if (!units.length) return false;
    const ids = units.map((u) => u.id);
    const tower = foeTowerAt(wx, wy);
    if (tower) {
      const res = units.some((u) => canTarget(match, u, tower)) ? 'ok' : 'unreachable';
      if (res === 'ok') cmd({ k: 'focus', ids, at: { kind: 'tower', id: tower.id } });
      if (res === 'ok') speak('go');
      note(
        res === 'ok' ? `${units.length} → ${tower.def.name}` : 'Out of reach: they cannot step that far off the road.',
      );
      if (res === 'ok') sent = { x: (tower.col + 0.5) * CELL, y: (tower.row + 0.5) * CELL, at: clock };
      return true;
    }
    const seat = foeCastleAt(wx, wy);
    if (seat !== undefined) {
      cmd({ k: 'focus', ids, at: { kind: 'castle', owner: seat } });
      speak('go');
      note(
        match.board.seats > 2
          ? `${units.length} → their castle (where the roads meet)`
          : `${units.length} → the castle`,
      );
      sent = { x: castleAt(seat)[0] * CELL, y: castleAt(seat)[1] * CELL, at: clock };
      return true;
    }
    return false;
  }
  /** Finish a box drag: pick the units whose middle is inside it (Shift or Ctrl adds to the group). */
  function finishBox() {
    const [x0, x1] = [Math.min(pressStart.x, boxTo.x), Math.max(pressStart.x, boxTo.x)];
    const [y0, y1] = [Math.min(pressStart.y, boxTo.y), Math.max(pressStart.y, boxTo.y)];
    if (x1 - x0 < TAP_SLOP && y1 - y0 < TAP_SLOP) return tap(pressStart.x, pressStart.y, true, { add: pressAdd });
    const inside = match.units.filter((u) => {
      if (u.owner !== YOU || u.hp <= 0 || u.spent) return false;
      const [x, y] = unitMid(u);
      const [sx, sy] = [world.x + x * CELL * world.scale.x, world.y + y * CELL * world.scale.y];
      return sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1;
    });
    if (inside.length || !pressAdd) select(inside, pressAdd);
  }
  let lastUnitTap = { kind: '', at: 0 };

  function tap(sx: number, sy: number, touch: boolean, how = { add: false }) {
    if (!started) return;
    const [wx, wy] = [(sx - world.x) / world.scale.x / CELL, (sy - world.y) / world.scale.y / CELL];
    if (!selected) {
      if (selection.size && command(wx, wy)) return;
      // One of your units: pick it (a second tap in a moment: every one of its kind in view).
      const mine = myUnitAt(wx, wy);
      if (mine) {
        setGhost(undefined);
        const now = performance.now();
        if (!how.add && lastUnitTap.kind === mine.def.id && now - lastUnitTap.at < 420) {
          const view = (u: Unit) => {
            const [x, y] = unitMid(u);
            const [px, py] = [world.x + x * CELL * world.scale.x, world.y + y * CELL * world.scale.y];
            return px >= 0 && px <= window.innerWidth && py >= 0 && py <= window.innerHeight;
          };
          select(
            match.units.filter((u) => u.owner === YOU && u.hp > 0 && !u.spent && u.def.id === mine.def.id && view(u)),
          );
          lastUnitTap = { kind: '', at: 0 };
        } else {
          select([mine], how.add);
          lastUnitTap = { kind: mine.def.id, at: now };
        }
        return;
      }
      // One of your bunkers (a tall sprite: its middle is above its feet): tap it to load soldiers into it.
      const bunker = myBunkerAt(wx, wy);
      if (bunker) {
        setGhost(undefined);
        showCard({ kind: 'bunker', id: bunker.id });
        return;
      }
      // Any other building of yours: what it does. One of the rival's you can see: its health.
      const ownT = towerAt(wx, wy, true);
      const foeT = ownT ? undefined : towerAt(wx, wy, false);
      if (ownT || foeT) {
        setGhost(undefined);
        showCard({ kind: ownT ? 'built' : 'foe', id: (ownT ?? foeT)!.id });
        return;
      }
    }
    // The castle (a tall sprite, so its middle is above its feet): tap it for its panel, anywhere else to close the panel.
    if (Math.hypot(wx - castleAt(YOU)[0], wy - (castleAt(YOU)[1] - 1.6)) <= 3) {
      selected = undefined;
      setGhost(undefined);
      showCard({ kind: 'castle' });
      refresh();
      return;
    }
    if (!selected && !how.add && selection.size) selection.clear();
    if (cardOf && !selected) closeCard();
    const cell = cellAt(sx, sy);
    if (!cell || !selected) return;
    lastTap = cell;
    if (canBuild(match, YOU, selected, cell[0], cell[1]) !== 'ok') return setGhost(undefined); // the hint says why
    if (!touch || (ghost && ghost[0] === cell[0] && ghost[1] === cell[1])) place(cell);
    else setGhost(cell); // a touch: show what it would do first
  }
  // Keys: Esc lets go; Ctrl+A picks every unit; C sends the group at the castle, X back to the general orders; arrows and
  // WASD pan the field.
  const held = new Set<string>();
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      selection.clear();
      if (cardOf) closeCard();
      selected = undefined;
      setGhost(undefined);
      refresh();
    } else if (started && k === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      selectAll();
    } else if (started && (k === 'c' || k === 'x') && selection.size) {
      cmd(
        k === 'c' ? { k: 'focus', ids: [...selection], at: { kind: 'castle' } } : { k: 'focus', ids: [...selection] },
      );
      note(k === 'c' ? `${selection.size} → the castle` : 'Back to the general orders');
    } else if (
      ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k) &&
      !e.ctrlKey &&
      !e.metaKey
    )
      held.add(k);
  });
  window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
  // Sound: browsers start audio only after a click or key press, so the first one loads it; M or the speaker button mutes.
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  const soundButton = $('cam-sound');
  const showMuted = () => {
    soundButton.textContent = isMuted() ? '🔇' : '🔊';
    soundButton.title = isMuted() ? 'Sound is off (M)' : 'Sound is on (M)';
  };
  const toggleSound = () => {
    setMuted(!isMuted());
    showMuted();
  };
  soundButton.onclick = toggleSound;
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName !== 'INPUT' && e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey)
      toggleSound();
  });
  showMuted();
  window.addEventListener('blur', () => held.clear());

  // --- Drawing a match ----------------------------------------------------------------------------------------------
  /** One sprite per tower / unit, kept while it lives. */
  const towerSprites = new Map<number, Container>();
  const unitSprites = new Map<number, Container>();
  const sync = <T extends { id: number }>(
    sprites: Map<number, Container>,
    items: T[],
    make: (item: T) => Container,
    place: (item: T, c: Container) => void,
    gone?: (c: Container) => boolean, // takes over a container whose item has gone (a falling ruin) instead of destroying it
  ) => {
    const alive = new Set<number>();
    for (const item of items) {
      alive.add(item.id);
      let c = sprites.get(item.id);
      if (!c) {
        c = make(item);
        sprites.set(item.id, c);
        sortLayer.addChild(c);
      }
      place(item, c);
    }
    for (const [id, c] of sprites) {
      if (alive.has(id)) continue;
      if (!gone?.(c)) c.destroy({ children: true });
      sprites.delete(id);
    }
  };

  interface Corpse {
    container: Container;
    sprite: Sprite;
    def: UnitDef;
    col: number;
    age: number;
    owner: Owner;
    at: [number, number];
  }
  const corpses: Corpse[] = [];
  /** The sheet column and mirroring for a unit walking its lane: along its tangent (flyers follow the road too). */
  const heading = (u: { owner: Owner; lane?: number; s: number }) => {
    const [hx, hy] = laneOf(match.board, u).directionAt(u.s);
    return direction(hx, hy);
  };
  const addCorpse = (d: Death) => {
    const dir = heading(d);
    const sheet = SHEETS[d.def.kind];
    const container = new Container();
    const sprite = new Sprite(unitFrame(d.def.sheet, d.def.kind, sheet.death[0]!, dir.col));
    sprite.anchor.set(0.5, feetAt(d.def.kind));
    sprite.scale.set((dir.flip ? -1 : 1) * unitScale(d.def), unitScale(d.def));
    container.addChild(sprite);
    container.position.set(d.at[0] * CELL, d.at[1] * CELL - (d.def.air ? FLIGHT : 0));
    corpseLayer.addChild(container);
    corpses.push({ container, sprite, def: d.def, col: dir.col, age: 0, owner: d.owner, at: d.at });
  };
  const ageCorpses = (dt: number) => {
    for (let i = corpses.length - 1; i >= 0; i--) {
      const k = corpses[i]!;
      k.age += dt;
      if (k.age >= CORPSE_LIFE) {
        k.container.destroy({ children: true });
        corpses.splice(i, 1);
        continue;
      }
      const rows = SHEETS[k.def.kind].death;
      k.sprite.texture = unitFrame(
        k.def.sheet,
        k.def.kind,
        rows[Math.min(rows.length - 1, Math.floor(k.age / DEATH_FRAME))]!,
        k.col,
      );
      k.container.alpha = Math.min(1, (CORPSE_LIFE - k.age) / (CORPSE_LIFE / 2));
    }
  };

  /** Attacks stay on screen a moment: a step lasts only 50 ms. */
  const effects: { shot: Shot; age: number }[] = [];
  const EFFECT_LIFE = 0.26;
  /** Each unit's last drawn spot, how far it has walked in all (the stride follows it, sideways steps too) and when it last moved. */
  const tracks = new Map<number, { x: number; y: number; odo: number; movedAt: number; d: number; out: boolean }>();
  /** Blasts (a suicide unit going off) and the pay-day figures floating up over your mills and quarries. */
  const booms: { at: [number, number]; r: number; air: boolean; age: number }[] = [];
  const BOOM_LIFE = 0.35;
  /** When (clock seconds) each unit last struck and what it struck at, for its swing; the same for towers (and castles, at -1 - owner), for their kick. */
  const strikes = new Map<number, { at: number; to: [number, number]; melee: boolean }>();
  const kicks = new Map<number, { at: number; to: [number, number] }>();

  /** A soft white glow (a radial gradient, scaled and tinted): the lamps, halos and muzzle flashes of the towers. */
  const glowTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.45, 'rgba(255, 255, 255, 0.35)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return Texture.from(canvas);
  })();
  /** Smoke and flames on hurt buildings, and the ruins of fallen ones (`wreck.ts`). */
  const wreck = new Wreck(glowTexture);
  world.addChildAt(wreck.ground, world.getChildIndex(sortLayer));
  world.addChildAt(wreck.air, world.getChildIndex(live));
  /** Seconds until the end screen, while the castle that lost is still coming down. */
  let finale: number | undefined;
  const glow = (color: number) => {
    const g = new Sprite(glowTexture);
    g.anchor.set(0.5);
    g.tint = color;
    g.blendMode = 'add';
    return g;
  };

  /**
   * A tower's own small animation, drawn over its picture and kept quiet: an attacker has a lamp that flickers and flares when it
   * fires, a healing or power tower a halo that breathes on the ground round it, a detector a slow violet sweep. Every tower also
   * breathes a little and kicks back when it shoots (`animateTower`).
   */
  const makeTowerFx = (def: TowerDef) => {
    const fx = new Container();
    if (def.aura) {
      const halo = glow(def.aura.kind === 'heal' ? 0x6fd36f : 0xffb13f);
      fx.addChild(halo);
      fx.scale.y = 0.5;
      fx.y = 4;
    } else if (def.detect) {
      const sweep = new Graphics()
        .moveTo(0, 0)
        .arc(0, 0, Math.min(def.detect, 6 * REACH_SCALE) * CELL, -0.32, 0.32)
        .closePath()
        .fill({ color: 0xb48cff, alpha: 0.2 });
      fx.addChild(sweep);
      fx.scale.y = 0.5;
      fx.y = 4;
    } else {
      const lamp = glow(0xffb13f);
      lamp.position.set(0, -TOWER_PX * 0.6);
      fx.addChild(lamp);
    }
    return fx;
  };
  const animateTower = (t: Tower, c: Container) => {
    const sprite = c.children[1] as Sprite;
    const fx = c.children[2] as Container;
    const base = TOWER_PX / sprite.texture.width;
    const ph = clock + t.id * 1.7;
    const kick = kicks.get(t.id);
    const r = kick ? Math.max(0, 1 - (clock - kick.at) / 0.28) : 0;
    const r2 = r * r;
    const side = kick ? Math.sign(kick.to[0] - (t.col + 0.5)) : 0;
    sprite.scale.set(
      base * (1 + 0.007 * Math.sin(ph * 1.8 + 1) + 0.025 * r2),
      base * (1 + 0.012 * Math.sin(ph * 1.8) - 0.05 * r2),
    );
    sprite.rotation = 0.01 * Math.sin(ph * 0.9) - side * 0.03 * r2;
    sprite.y = 3 * r2;
    const part = fx.children[0]!;
    if (t.def.aura) {
      const pulse = Math.sin(ph * 1.6);
      part.scale.set(((TOWER_PX * 1.5) / 64) * (0.94 + 0.06 * pulse));
      part.alpha = 0.26 + 0.1 * pulse;
    } else if (t.def.detect) part.rotation = ph * 0.9;
    else {
      part.alpha = Math.min(1, 0.2 + 0.08 * Math.sin(ph * 3.1) * Math.sin(ph * 1.3) + 0.9 * r);
      part.scale.set(0.5 + 0.7 * r);
    }
  };

  /**
   * A small quiet mark under a building's feet so towers that share a picture can be told apart: a filled disc for a mill (wood
   * brown) or quarry (stone grey), a gold ring for a producer, a blue triangle for an anti-air tower, a diamond for a smithy, and
   * for a bunker a row of its slots (a filled gold dot for each soldier inside, a steel ring for an empty one).
   */
  const drawBadge = (g: Graphics, t: Tower) => {
    const d = t.def;
    g.clear();
    const [x, y, r] = [0, 28, 5];
    const plate = (w: number) => g.roundRect(x - w / 2, y - 8, w, 16, 8).fill({ color: 0x1a120a, alpha: 0.62 });
    if (d.bunker) {
      const n = d.bunker.slots;
      plate(n * 12 + 6);
      for (let i = 0; i < n; i++) {
        const dx = (i - (n - 1) / 2) * 12;
        if (i < t.garrison.length) g.circle(dx, y, 4).fill(0xf2d38a);
        else g.circle(dx, y, 3.6).stroke({ color: 0xa7b6c7, width: 1.5 });
      }
    } else if (d.econ) {
      plate(26);
      g.circle(x, y, r + 1).fill(d.econ.wood ? 0xd49a5a : 0xcdd4dc);
    } else if (d.trains) {
      plate(26);
      g.circle(x, y, r + 0.5).stroke({ color: 0xf2d38a, width: 2.5 });
    } else if (d.damage > 0 && d.hits === 'air') {
      plate(26);
      g.poly([x, y - r - 1, x + r + 1, y + r - 1, x - r - 1, y + r - 1]).fill(0x7fc0ff);
    } else if (!d.damage && !d.aura && !d.detect) {
      plate(26);
      g.poly([x, y - r - 1, x + r + 1, y, x, y + r + 1, x - r - 1, y]).fill(0xe8946a);
    }
  };

  /** Pay-day figures: a small "+6" (wood brown) or "+8" (stone grey) rising over each of your mills and quarries. */
  const floaters: { text: Text; age: number; y: number }[] = [];
  const FLOAT_LIFE = 1.5;
  function payDay() {
    for (const t of match.towers) {
      if (t.owner !== YOU || !t.def.econ) continue;
      const wood = t.def.econ.wood ?? 0;
      const amount = Math.round(wood || (t.def.econ.stone ?? 0));
      if (!amount) continue;
      const text = new Text({
        text: `+${amount}`,
        style: {
          fontFamily: 'Crimson Text',
          fontWeight: '600',
          fontSize: 22,
          fill: wood ? 0xe0a566 : 0xd2d8df,
          stroke: { color: 0x1a120a, width: 4, join: 'round' },
        },
      });
      text.anchor.set(0.5, 1);
      const y = (t.row + 0.5) * CELL + TOWER_FOOT - TOWER_PX * 0.78 - 6;
      text.position.set((t.col + 0.5) * CELL, y);
      floatLayer.addChild(text);
      floaters.push({ text, age: 0, y });
    }
  }
  function floatMoney(dt: number) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]!;
      f.age += dt;
      if (f.age >= FLOAT_LIFE) {
        f.text.destroy();
        floaters.splice(i, 1);
        continue;
      }
      const p = f.age / FLOAT_LIFE;
      f.text.y = f.y - 34 * (1 - (1 - p) * (1 - p));
      f.text.alpha = Math.min(1, (1 - p) / 0.4);
    }
  }

  const bar = (x: number, y: number, w: number, frac: number, color: number) => {
    live.rect(x - w / 2, y, w, 4).fill(0x0e1117);
    live.rect(x - w / 2 + 0.5, y + 0.5, (w - 1) * Math.max(0, Math.min(1, frac)), 3).fill(color);
  };

  /** One animated pool of sight: it grows to its circle when the source appears and shrinks away when it is gone. */
  interface Pool {
    x: number;
    y: number;
    r: number;
    target: number;
    peak: number;
    build: boolean;
  }
  const pools = new Map<string, Pool>();
  /** Where a fallen tower's build area was: faintly lifted for good (never for unit sight). */
  const remembered: { x: number; y: number; r: number }[] = [];
  let fogSnap = true;

  /** Cut one soft round pool: clear to near its edge, fading out just past it (so what is inside the sight is in the clear). */
  const cutPool = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    if (r <= 0.02) return;
    const [cx, cy, outer] = [x * FOG_RES, y * FOG_RES, (r + 0.7) * FOG_RES];
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer);
    g.addColorStop(0, 'rgba(0, 0, 0, 1)');
    g.addColorStop(Math.max(0, (r - 0.5) / (r + 0.7)), 'rgba(0, 0, 0, 1)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - outer, cy - outer, outer * 2, outer * 2);
  };

  /** Redraw the fog from what `YOU` sees, growing and shrinking each pool toward it. */
  function drawFog(vision: Vision, dt: number) {
    const live = new Set<string>();
    for (const c of sightsFor(match, YOU, vision)) {
      live.add(c.key);
      let p = pools.get(c.key);
      // Ground an ally may build on is revealed, not yours to build on: only your own pools are build ground.
      const build = c.build && c.owner === YOU;
      if (!p) pools.set(c.key, (p = { x: c.x, y: c.y, r: fogSnap ? c.r : 0, target: c.r, peak: 0, build }));
      Object.assign(p, { x: c.x, y: c.y, target: c.r });
    }
    fogSnap = false;
    for (const [key, p] of pools) {
      if (!live.has(key)) p.target = 0;
      const dr = FOG_SPEED * dt;
      p.r = p.r < p.target ? Math.min(p.target, p.r + dr) : Math.max(p.target, p.r - dr);
      p.peak = Math.max(p.peak, p.r);
      if (p.r <= 0 && p.target === 0) {
        if (p.build && !/^c\d+:build$/.test(key)) remembered.push({ x: p.x, y: p.y, r: p.peak });
        pools.delete(key);
      }
    }
    const [w, h] = [shade.canvas.width, shade.canvas.height];
    const { ctx } = shade;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = FOG_COLOR;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = FOG_MEMORY;
    for (const m of remembered) cutPool(ctx, m.x, m.y, m.r);
    ctx.globalAlpha = 1;
    for (const p of pools.values()) cutPool(ctx, p.x, p.y, p.r);

    // The tint: a cool wash over every pool that is not build ground, with the build ground cut back out of it.
    const t = tint.ctx;
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, w, h);
    for (const p of pools.values()) {
      if (p.build || p.r <= 0.02) continue;
      const [cx, cy, outer] = [p.x * FOG_RES, p.y * FOG_RES, (p.r + 0.7) * FOG_RES];
      const g = t.createRadialGradient(cx, cy, 0, cx, cy, outer);
      g.addColorStop(0, 'rgba(120, 160, 230, 0.16)');
      g.addColorStop(Math.max(0, (p.r - 0.5) / (p.r + 0.7)), 'rgba(120, 160, 230, 0.16)');
      g.addColorStop(1, 'rgba(120, 160, 230, 0)');
      t.fillStyle = g;
      t.fillRect(cx - outer, cy - outer, outer * 2, outer * 2);
    }
    t.globalCompositeOperation = 'destination-out';
    for (const p of pools.values()) if (p.build) cutPool(t, p.x, p.y, p.r);
    for (const layer of [shade, tint]) layer.sprite.texture.source.update();
  }

  function drawLive(dt: number) {
    live.clear();
    areaLayer.clear();
    const vision = visionOf(match); // once a frame: everything below asks it what the player can see
    drawFog(vision, dt);
    const aim = selected && started ? (ghost ?? hover) : undefined; // the cell being previewed: the ghost, or the mouse
    const spotted = (at: readonly [number, number]) => canSee(match, YOU, at, 0, vision);
    for (const [o, cs] of castleSprites.entries()) {
      cs.visible = wreck.has(cs) || isCastleSeen(match, YOU, o, vision);
      const castle = match.players[o]!.castle;
      const pic = cs.children[1] as Sprite;
      if (cs.visible && castle.hp > 0)
        wreck.smoulder(-1 - o, cs.x, cs.y - pic.height * 0.78, cs.y, pic.width * 0.3, 1 - castle.hp / castle.maxHp, dt);
    }
    for (const k of corpses) k.container.visible = allied(match, k.owner, YOU) || spotted(k.at);

    // Where a tower of the selected kind can go (and, with the mouse, its range at the cell under it).
    if (selected && started) {
      for (let row = 0; row < match.board.rows; row++)
        for (let col = 0; col < match.board.cols; col++)
          if (canBuild(match, YOU, selected, col, row) === 'ok')
            areaLayer.rect(col * CELL, row * CELL, CELL, CELL).fill({ color: 0x6fd36f, alpha: 0.2 });
      if (aim) {
        const ok = canBuild(match, YOU, selected, aim[0], aim[1]) === 'ok';
        const cx = (aim[0] + 0.5) * CELL;
        const cy = (aim[1] + 0.5) * CELL;
        // Before it is placed: what it shoots (white), the ground its reach would open to build on (amber) and the fog its
        // sight would push back (blue ring).
        live.circle(cx, cy, selected.range * CELL).fill({ color: ok ? 0xffffff : 0xb82024, alpha: 0.12 });
        if (ok) {
          if (selected.reach > 0)
            live
              .circle(cx, cy, selected.reach * CELL)
              .fill({ color: 0xffb13f, alpha: 0.1 })
              .stroke({ color: 0xffb13f, width: 2, alpha: 0.75 });
          live.circle(cx, cy, selected.sight * CELL).stroke({ color: 0x9fc4ff, width: 2, alpha: 0.8 });
        }
        live.rect(cx - CELL / 2, cy - CELL / 2, CELL, CELL).stroke({ color: ok ? 0xffb13f : 0xb82024, width: 2 });
      }
    }
    ghostSprite.visible = !!aim && canBuild(match, YOU, selected!, aim[0], aim[1]) === 'ok';
    if (ghostSprite.visible && aim && selected) {
      const tex = paintedTexture(towerTextures.get(selected.art)!, YOU, selected.look?.tint);
      ghostSprite.texture = tex;
      ghostSprite.scale.set(TOWER_PX / tex.width);
      ghostSprite.position.set((aim[0] + 0.5) * CELL, (aim[1] + 0.5) * CELL + TOWER_FOOT);
    }
    updateHint(aim);
    // A map with forks: the road your new units march down is lit (the one under the mouse, on the road chips, more).
    if (started && match.board.seats > 2 && playingNow()) {
      const lit = (id: number | undefined, width: number, alpha: number) => {
        const lane = id === undefined ? undefined : match.board.lanes[id];
        if (!lane) return;
        lane.points.forEach(([x, y], i) => {
          if (i === 0) live.moveTo(x * CELL, y * CELL);
          else if (i % 2 === 0 || i === lane.points.length - 1) live.lineTo(x * CELL, y * CELL);
        });
        live.stroke({ color: 0xf2d38a, width, alpha, cap: 'round', join: 'round' });
      };
      lit(laneFor(match, YOU), 7, laneHover === undefined ? 0.28 : 0.14);
      lit(laneHover, 9, 0.55);
    }
    if (started) {
      const [cx, cy] = castleAt(YOU);
      areaLayer
        .circle(cx * CELL, cy * CELL, buildReach(match, YOU) * CELL)
        .stroke({ color: 0xffb13f, width: 2, alpha: selected ? 0.5 : 0.2 });
      for (const t of match.towers)
        if (t.owner === YOU && t.def.reach > 0)
          areaLayer
            .circle((t.col + 0.5) * CELL, (t.row + 0.5) * CELL, t.def.reach * CELL)
            .stroke({ color: 0xffb13f, width: 1.5, alpha: selected ? 0.4 : 0.15 });
    }

    // Support towers show what they cover: an aura (green heal, orange power) and a detector (violet).
    for (const t of match.towers) {
      if (!isSeen(match, YOU, t, vision)) continue;
      const cx = (t.col + 0.5) * CELL;
      const cy = (t.row + 0.5) * CELL;
      const mine = allied(match, t.owner, YOU);
      if (t.def.aura)
        areaLayer
          .circle(cx, cy, t.def.aura.radius * CELL)
          .stroke({ color: t.def.aura.kind === 'heal' ? 0x6fd36f : 0xffb13f, width: 1.5, alpha: mine ? 0.45 : 0.25 });
      if (t.def.detect)
        areaLayer.circle(cx, cy, t.def.detect * CELL).stroke({ color: 0xb48cff, width: 1.5, alpha: mine ? 0.45 : 0.2 });
    }
    if (selected && aim) {
      const cx = (aim[0] + 0.5) * CELL;
      const cy = (aim[1] + 0.5) * CELL;
      if (selected.aura)
        live
          .circle(cx, cy, selected.aura.radius * CELL)
          .stroke({ color: selected.aura.kind === 'heal' ? 0x6fd36f : 0xffb13f, width: 2 });
      if (selected.detect) live.circle(cx, cy, selected.detect * CELL).stroke({ color: 0xb48cff, width: 2 });
    }

    sync(
      towerSprites,
      match.towers,
      (t) => {
        const c = new Container();
        const color = colorOf(t.owner);
        c.addChild(new Graphics().ellipse(0, 4, 19 * SIZE, 9 * SIZE).fill({ color, alpha: 0.55 })); // the owner's colour under the tower
        const tex = paintedTexture(towerTextures.get(t.def.art)!, t.owner, t.def.look?.tint);
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5, 0.78);
        sprite.scale.set(TOWER_PX / tex.width); // a tower is about two and a half cells wide, whatever its sheet
        c.addChild(sprite);
        c.addChild(makeTowerFx(t.def)); // the tower's own small animation: lamp, halo or sweep (see `animateTower`)
        c.addChild(new Graphics()); // the role badge (and a bunker's slots) under its feet
        c.addChild(new Graphics()); // a smithy's pennants and ring, which grow as its owner buys upgrades (`drawTrim`)
        return c;
      },
      (t, c) => {
        c.position.set((t.col + 0.5) * CELL, (t.row + 0.5) * CELL + TOWER_FOOT);
        c.zIndex = t.row + 0.5;
        c.visible = isSeen(match, YOU, t, vision);
        if (c.visible) {
          animateTower(t, c);
          const pic = c.children[1] as Sprite;
          wreck.smoulder(t.id, c.x, c.y - pic.height * 0.78, c.y, TOWER_PX * 0.3, 1 - t.hp / t.def.hp, dt);
          const key = `${t.garrison.length}`;
          if (c.label !== key) {
            c.label = key;
            drawBadge(c.children[3] as Graphics, t);
          }
          if (buildingRole(t.def) === 'smithy') {
            const bought = Object.values(match.players[t.owner]!.upgrades).reduce((a, b) => a + b, 0);
            const trim = smithyTrim(bought);
            const tkey = trimKey(trim);
            const g = c.children[4] as Graphics;
            if (g.label !== tkey) {
              g.label = tkey;
              drawTrim(g, trim, colorOf(t.owner), TOWER_PX * 0.3 * trim.scale, TOWER_PX * 0.55 * trim.scale);
            }
            c.scale.set(trim.scale);
          }
        }
      },
      (c) => {
        wreck.collapse(c, c.children[1] as Sprite, TOWER_FALL, false, true);
        return true;
      },
    );
    sync(
      unitSprites,
      match.units,
      (u) => {
        const c = new Container();
        const color = colorOf(u.owner);
        c.addChild(new Graphics().ellipse(0, 0, 8 * unitScale(u.def), 4 * SIZE).fill({ color, alpha: 0.6 })); // under the feet (on the ground, below a flyer)
        const body = new Sprite(unitFrame(u.def.sheet, u.def.kind, 0, 4));
        body.anchor.set(0.5, feetAt(u.def.kind));
        body.scale.set(unitScale(u.def));
        c.addChild(body);
        return c;
      },
      (u: Unit, c) => {
        const [x, y] = drawnPos(u, match.board);
        c.position.set(x * CELL, y * CELL);
        c.zIndex = u.def.air ? 1000 + y : y; // flyers pass over everything
        const sheet = SHEETS[u.def.kind];
        // Motion is read from where it is drawn (a unit stepping off the road changes its offset, not its `s`).
        let trk = tracks.get(u.id);
        if (!trk) tracks.set(u.id, (trk = { x, y, odo: 0, movedAt: -9, d: u.off?.d ?? 0, out: true }));
        const walked = Math.hypot(x - trk.x, y - trk.y);
        if (walked > 1e-4) {
          trk.odo += walked;
          trk.movedAt = clock;
          if (u.off && u.off.d !== trk.d) trk.out = u.off.d > trk.d;
        }
        [trk.x, trk.y, trk.d] = [x, y, u.off?.d ?? 0];
        const moved = clock - trk.movedAt < 0.12;
        const body = c.children[1] as Sprite;
        // Strike: for STRIKE_TIME after a blow it faces its target and plays its attack frames (a lunge for a melee blow, a
        // recoil for a shot); otherwise it walks (frames follow the distance walked), flaps if it flies, or stands.
        const strike = strikes.get(u.id);
        const since = strike ? clock - strike.at : Infinity;
        const striking = since < STRIKE_TIME;
        const along = u.off
          ? trk.out
            ? direction(u.off.dir[0], u.off.dir[1])
            : direction(-u.off.dir[0], -u.off.dir[1])
          : heading(u);
        const dir = striking ? direction(strike!.to[0] - x, strike!.to[1] - y) : along;
        let pose: number;
        let [bx, by] = [0, 0];
        if (striking) {
          const p = since / STRIKE_TIME;
          pose = sheet.attack[Math.min(sheet.attack.length - 1, Math.floor(p * sheet.attack.length))]!;
          const [dx, dy] = [strike!.to[0] - x, strike!.to[1] - y];
          const len = Math.hypot(dx, dy) || 1;
          const push = Math.sin(Math.PI * Math.min(1, p * 1.2)) * (strike!.melee ? LUNGE : -LUNGE * 0.3);
          [bx, by] = [(dx / len) * push, (dy / len) * push * 0.6];
        } else if (u.def.air) pose = sheet.walk[Math.floor(clock * FLAP + u.id) % sheet.walk.length]!;
        else if (moved) {
          const phase = trk.odo / (STRIDE / sheet.walk.length);
          pose = sheet.walk[Math.floor(phase) % sheet.walk.length]!;
          by = -Math.abs(Math.sin((phase * Math.PI) / sheet.walk.length)) * 1.6 * SIZE; // a step's small bob
        } else {
          pose = 0;
          by = Math.sin(clock * 2.2 + u.id) * 0.6 * SIZE; // breathing while it waits
        }
        if (u.def.air) by += -FLIGHT + Math.sin(clock * 3 + u.id) * 2.5 * SIZE; // a flyer hovers
        body.texture = unitFrame(u.def.sheet, u.def.kind, pose, dir.col);
        body.scale.x = (dir.flip ? -1 : 1) * unitScale(u.def);
        body.position.set(bx, by);
        // An enemy is drawn only in sight (a cloaked one also needs a detector); cloaked is faint to its own side; poison tints green.
        c.visible = isSeen(match, YOU, u, vision);
        body.alpha = u.def.cloak ? (allied(match, u.owner, YOU) ? 0.5 : 0.75) : 1;
        body.tint = u.dot ? 0x9be37a : (u.def.look?.tint ?? 0xffffff);
      },
    );
    for (const id of tracks.keys()) if (!unitSprites.has(id)) tracks.delete(id);
    for (const id of strikes.keys()) if (!unitSprites.has(id)) strikes.delete(id);
    for (const id of kicks.keys()) if (id >= 0 && !towerSprites.has(id)) kicks.delete(id);
    // The castles answer a shot with a small swell.
    for (const [o] of castleSprites.entries()) {
      const r = Math.max(0, 1 - (clock - (kicks.get(-1 - o)?.at ?? -9)) / 0.3);
      const cs = castleSprites[o]!;
      cs.children[1]!.scale.set(castleBase(o) * (1 + 0.03 * r * r));
      const trim = castleTrim(match.players[o]!.castle.level);
      const key = trimKey(trim);
      if (cs.label !== key) {
        cs.label = key;
        const half = 56 * CASTLE_SCALE * trim.scale;
        drawTrim(cs.children[2] as Graphics, trim, colorOf(o), half * 0.7, 70 * trim.scale);
      }
    }

    // The group you picked: a ring at each one's feet and a line to what it is sent after. While there is a group, what it can be
    // sent at (the rival's towers and castle you can see) is ringed, brighter under the mouse; a command flashes where it landed.
    const group = started ? picked() : [];
    if (group.length) {
      const pulse = 0.6 + 0.4 * Math.sin(clock * 5);
      const foes = match.towers.filter(
        (t) => !allied(match, t.owner, YOU) && t.hp > 0 && isSeen(match, YOU, t, vision),
      );
      const castleHover = hoverAt ? foeCastleAt(hoverAt[0], hoverAt[1]) : undefined;
      const hoverFoe = hoverAt
        ? (foeTowerAt(hoverAt[0], hoverAt[1])?.id ?? (castleHover !== undefined ? -1 - castleHover : undefined))
        : undefined;
      app.canvas.style.cursor = hoverFoe !== undefined ? 'crosshair' : '';
      for (const t of foes)
        live.circle((t.col + 0.5) * CELL, (t.row + 0.5) * CELL + 4, 40).stroke({
          color: 0xe0777b,
          width: hoverFoe === t.id ? 4 : 2,
          alpha: hoverFoe === t.id ? 1 : 0.4 + 0.2 * Math.sin(clock * 4),
        });
      for (const o of foesOf(match, YOU))
        if (isCastleSeen(match, YOU, o, vision))
          live.ellipse(castleAt(o)[0] * CELL, castleAt(o)[1] * CELL + 6, 78, 30).stroke({
            color: 0xe0777b,
            width: hoverFoe === -1 - o ? 4 : 2,
            alpha: hoverFoe === -1 - o ? 1 : 0.4 + 0.2 * Math.sin(clock * 4),
          });
      for (const u of group) {
        const [ux, uy] = drawnPos(u, match.board);
        live
          .ellipse(ux * CELL, uy * CELL + 2, 22 * SIZE * 0.6, 8 * SIZE * 0.6)
          .stroke({ color: 0xf2d38a, width: 2.5, alpha: pulse });
        if (u.def.range > 1.5)
          // the reach of its shot (melee units have none worth drawing)
          live.circle(ux * CELL, uy * CELL, u.def.range * CELL).stroke({ color: 0xf2d38a, width: 1.5, alpha: 0.5 });
        let goal: [number, number] | undefined;
        if (u.focus?.kind === 'tower') {
          const t = match.towers.find((x) => x.id === (u.focus as { id: number }).id);
          if (t) goal = [(t.col + 0.5) * CELL, (t.row + 0.5) * CELL];
        } else if (u.focus?.kind === 'castle') {
          const seat = u.focus.owner ?? laneOf(match.board, u).to;
          if (isCastleSeen(match, YOU, seat, vision)) goal = [castleAt(seat)[0] * CELL, castleAt(seat)[1] * CELL];
        }
        if (goal)
          live
            .moveTo(ux * CELL, uy * CELL - (u.def.air ? FLIGHT : 0) - 24)
            .lineTo(goal[0], goal[1])
            .stroke({ color: 0xe0777b, width: 2, alpha: 0.45 });
      }
    } else app.canvas.style.cursor = '';
    if (cardOf?.kind === 'built' || cardOf?.kind === 'foe') {
      const t = match.towers.find((x) => x.id === (cardOf as { id: number }).id);
      if (t && t.hp > 0 && t.def.damage > 0)
        live
          .circle((t.col + 0.5) * CELL, (t.row + 0.5) * CELL, t.def.range * CELL)
          .fill({ color: 0xffffff, alpha: 0.08 })
          .stroke({ color: cardOf.kind === 'built' ? 0xf2d38a : 0xe0777b, width: 1.5, alpha: 0.5 });
      if (t && t.hp > 0)
        live.ellipse((t.col + 0.5) * CELL, (t.row + 0.5) * CELL + 8, 30 * SIZE * 0.7, 11 * SIZE * 0.7).stroke({
          color: cardOf.kind === 'built' ? 0xf2d38a : 0xe0777b,
          width: 2.5,
          alpha: 0.6 + 0.4 * Math.sin(clock * 5),
        });
    }
    if (sent && clock - sent.at < 0.55) {
      const k = (clock - sent.at) / 0.55;
      live.circle(sent.x, sent.y + 4, 30 + 60 * k).stroke({ color: 0xffffff, width: 3, alpha: 1 - k });
    }

    // Health bars: castles always, the rest once hurt.
    for (const [o, p] of match.players.entries()) {
      if (p.out || !isCastleSeen(match, YOU, o, vision) || p.castle.hp <= 0) continue;
      bar(castleAt(o)[0] * CELL, castleAt(o)[1] * CELL - 150, 120, p.castle.hp / p.castle.maxHp, barColor(o));
    }
    for (const t of match.towers)
      if (t.hp < t.def.hp && isSeen(match, YOU, t, vision))
        bar(
          (t.col + 0.5) * CELL,
          (t.row + 0.5) * CELL + TOWER_FOOT - TOWER_PX * 0.78 - 8,
          44,
          t.hp / t.def.hp,
          0xffb13f,
        );
    for (const u of match.units) {
      if (u.hp >= u.maxHp || !isSeen(match, YOU, u, vision)) continue;
      const [x, y] = drawnPos(u, match.board);
      bar(
        x * CELL,
        y * CELL - figureOf(u.def.kind) * unitScale(u.def) - 6 - (u.def.air ? FLIGHT : 0),
        14 + figureOf(u.def.kind) * unitScale(u.def) * 0.4,
        u.hp / u.maxHp,
        0x6fd36f,
      );
    }

    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]!;
      e.age += dt;
      if (e.age > EFFECT_LIFE) {
        effects.splice(i, 1);
        continue;
      }
      if (!spotted(e.shot.from) && !spotted(e.shot.to)) continue; // an attack nobody of yours sees
      const a = 1 - e.age / EFFECT_LIFE;
      const [x0, y0, x1, y1] = [e.shot.from[0] * CELL, e.shot.from[1] * CELL, e.shot.to[0] * CELL, e.shot.to[1] * CELL];
      const lift = e.shot.by.kind === 'tower' ? 44 : e.shot.by.kind === 'castle' ? 90 : 22;
      if (e.shot.melee) live.circle(x1, y1 - 22, 14).fill({ color: 0xffffff, alpha: 0.5 * a });
      else if (e.shot.multi) {
        // One of several struck at once (a flame, a sweeping blade): a short soft arc that bows from the attacker to the target.
        const f = Math.min(1, e.age / (EFFECT_LIFE * 0.6));
        const [sx, sy, ex, ey] = [x0, y0 - lift, x1, y1 - 22];
        const [nx, ny] = [-(ey - sy) * 0.3, (ex - sx) * 0.3];
        const [mx, my] = [(sx + ex) / 2 + nx, (sy + ey) / 2 + ny];
        const at = (t: number): [number, number] => [
          (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex,
          (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey,
        ];
        const [t0, t1] = [Math.max(0, f - 0.6), f];
        for (const [w, al] of [
          [14, 0.22],
          [5, 0.65],
        ] as const) {
          const [px, py] = at(t0);
          live.moveTo(px, py);
          for (let i = 1; i <= 6; i++) live.lineTo(...at(t0 + ((t1 - t0) * i) / 6));
          live.stroke({ color: 0xff9a3c, width: w, alpha: al * a, cap: 'round', join: 'round' });
        }
      } else {
        // A missile flying from the shooter to the target over the effect's life, with a short fading trail.
        const f = Math.min(1, e.age / (EFFECT_LIFE * 0.8));
        const [hx, hy] = [x0 + (x1 - x0) * f, y0 - lift + (y1 - 22 - (y0 - lift)) * f];
        const [tx, ty] = [
          x0 + (x1 - x0) * Math.max(0, f - 0.35),
          y0 - lift + (y1 - 22 - (y0 - lift)) * Math.max(0, f - 0.35),
        ];
        live
          .moveTo(tx, ty)
          .lineTo(hx, hy)
          .stroke({ color: 0xffb13f, width: 3, alpha: 0.9 * a });
        live.circle(hx, hy, 3).fill({ color: 0xfff1c9, alpha: a });
      }
      if (e.shot.splash > 0) live.circle(x1, y1, e.shot.splash * CELL).fill({ color: 0xffb13f, alpha: 0.2 * a });
    }

    // A blast: one soft ring and glow spreading to the blast's radius, over a third of a second.
    for (let i = booms.length - 1; i >= 0; i--) {
      const k = booms[i]!;
      k.age += dt;
      if (k.age > BOOM_LIFE) {
        booms.splice(i, 1);
        continue;
      }
      if (!spotted(k.at)) continue;
      const f = k.age / BOOM_LIFE;
      const r = k.r * CELL * (0.3 + 0.7 * (1 - (1 - f) * (1 - f)));
      const [x, y] = [k.at[0] * CELL, k.at[1] * CELL - (k.air ? FLIGHT : 0) - 8];
      live.circle(x, y, r).fill({ color: 0xffa24a, alpha: 0.24 * (1 - f) });
      live.circle(x, y, r).stroke({ color: 0xffd9a0, width: 3, alpha: 0.7 * (1 - f) });
    }
    floatMoney(dt);
    wreck.update(dt);
  }

  // --- The page: top bar, the dock of thumbnails, the card, the title screen -----------------------------------------------
  /** A price as coloured numbers (wood brown, stone grey); `words` spells them out, for the cards. */
  const shown = (n: number) => String(Math.round(n)); // whole numbers only: an income is a fraction of a coin per pay day
  const money = (c: Cost) =>
    [
      c.wood > 0 && `<i class="w" title="wood">${shown(c.wood)}</i>`,
      c.stone > 0 && `<i class="s" title="stone">${shown(c.stone)}</i>`,
    ]
      .filter(Boolean)
      .join(' ') || '<i>free</i>';
  /** What the player is short of for a price ('' when they can pay). */
  const lacking = (c: Cost) => {
    const p = match.players[YOU]!;
    const short = [
      c.wood > p.wood && `${Math.ceil(c.wood - p.wood)} more wood`,
      c.stone > p.stone && `${Math.ceil(c.stone - p.stone)} more stone`,
    ].filter(Boolean);
    return short.length ? `Need ${short.join(' and ')}` : '';
  };
  const towerName = (id: string) => RACES[match.players[YOU]!.race].towers.find((t) => t.id === id)?.name ?? id;

  /** Your wood and stone: two numbers beside their icons (the income you feel in how they change; the mills show their own pay-day figures). */
  const lastRes = { w: -1, s: -1 };
  function resources() {
    const p = match.players[YOU]!;
    const [w, st] = [Math.floor(p.wood), Math.floor(p.stone)];
    if (lastRes.w !== w) $('wood').textContent = String((lastRes.w = w));
    if (lastRes.s !== st) $('stone').textContent = String((lastRes.s = st));
  }

  /** A building's picture for the page (its owner's colour, from the sheet once loaded). */
  const thumbUrls = new WeakMap<HTMLCanvasElement, string>();
  const towerThumb = (art: string, px: number, o: Owner = YOU, tint?: number) => {
    const base = towerTextures.get(art) ?? castleTextures.get(art);
    let url = `art/${art}.png`;
    if (base) {
      const canvas = paintedArt(base, o, tint);
      if (!thumbUrls.has(canvas)) thumbUrls.set(canvas, canvas.toDataURL());
      url = thumbUrls.get(canvas)!;
    }
    return `<i class="thumb art" style="width:${px}px;height:${px}px;background-image:url(${url});background-size:${px}px auto"></i>`;
  };
  /** A unit's picture where it has no portrait of its own: its front-facing standing frame, cropped to the figure and scaled up. */
  const portraits = new Map<string, string>();
  const portrait = (d: UnitDef) => {
    let url = portraits.get(d.sheet);
    if (url) return url;
    const size = SHEETS[d.kind].frame;
    const frame = document.createElement('canvas');
    frame.width = frame.height = size;
    const fx = frame.getContext('2d', { willReadFrequently: true })!;
    fx.drawImage(
      sheetTextures.get(d.sheet)!.source.resource as CanvasImageSource,
      4 * size,
      0,
      size,
      size,
      0,
      0,
      size,
      size,
    );
    const px = fx.getImageData(0, 0, size, size).data;
    let [x0, y0, x1, y1] = [size, size, -1, -1];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (px[(y * size + x) * 4 + 3]! > 24)
          [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    if (x1 < 0) [x0, y0, x1, y1] = [0, 0, size - 1, size - 1];
    const [w, h] = [x1 - x0 + 1, y1 - y0 + 1];
    const k = Math.max(1, Math.floor(88 / Math.max(w, h))); // a whole number of times up, so it stays crisp
    const out = document.createElement('canvas');
    out.width = w * k;
    out.height = h * k;
    const ox = out.getContext('2d')!;
    ox.imageSmoothingEnabled = false;
    ox.drawImage(frame, x0, y0, w, h, 0, 0, w * k, h * k);
    portraits.set(d.sheet, (url = out.toDataURL()));
    return url;
  };
  const unitThumb = (d: UnitDef, px: number) =>
    d.art
      ? `<img class="thumb art" src="art/${d.art}.png" alt="" width="${px}" height="${Math.round((px * 38) / 46)}" />`
      : `<img class="thumb art gen" src="${portrait(d)}" alt="" style="width:${px}px;height:${Math.round((px * 38) / 46)}px" />`;

  const row = (k: string, v: string | number) => `<li><span>${k}</span><b>${v}</b></li>`;
  const per = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const pct = (n: number) => `+${Math.round(n * 100)}%`;

  // The stat cards are pictures: a heart, a sword and a running man with a bar each (against the best of any race, so a bar says how
  // tough, hard-hitting or quick it is next to the rest), and an icon for each way it fights. Hover for the words.
  const best = (list: number[]) => Math.max(...list, 1e-9);
  const allUnits = RACE_IDS.flatMap((r) => RACES[r].units);
  const allTowers = RACE_IDS.flatMap((r) => RACES[r].towers);
  const dpsOf = (d: UnitDef) => (d.damage * (d.multi ?? 1)) / d.cooldown;
  const MOST = {
    hp: best(allUnits.map((u) => u.hp)),
    dps: best(allUnits.map(dpsOf)),
    speed: best(allUnits.map((u) => u.speed)),
    towerHp: best(allTowers.map((t) => t.hp)),
    towerDps: best(allTowers.map((t) => t.damage / t.cooldown)),
    range: best(allTowers.map((t) => t.range)),
  };
  /** One stat: its icon and a bar (`value` of `most`; `extra` is what upgrades add, drawn in gold). */
  const meter = (ico: string, color: string, title: string, value: number, most: number, extra = 0, id = '') => {
    // The length is the stat, on a square-root scale so a frail unit is still a visible bar next to the giants.
    const at = (v: number) => Math.min(100, Math.sqrt(Math.max(0, v) / most) * 100);
    const w = Math.max(6, at(value));
    const x = Math.max(0, Math.min(100 - w, at(value + extra) - w));
    return (
      `<div class="st" style="--c:${color}" title="${title}">${icon(ico, title)}<div class="meter">` +
      `<i${id ? ` id="${id}"` : ''} style="width:${w}%"></i>${x > 0.5 ? `<b style="left:${w}%;width:${x}%"></b>` : ''}</div></div>`
    );
  };
  const RED = '#b82024';
  const ORANGE = '#e7682f';
  const BLUE = '#406181';
  const badges = (...b: (readonly [string, string] | false | undefined)[]) => {
    const list = b.filter((x): x is readonly [string, string] => !!x);
    return list.length
      ? `<div class="badges">${list.map(([ico, t]) => `<span class="bd" title="${t}">${icon(ico, t)}</span>`).join('')}</div>`
      : '';
  };
  /** The ways a unit fights, as icons. */
  const unitBadges = (d: UnitDef) =>
    badges(
      d.air && (['wing', 'Flies'] as const),
      d.cloak && (['ghost', 'Cloaked: unseen without a detector'] as const),
      d.range > 1.5 && (['bow', `Ranged (${per(d.range)} cells)`] as const),
      d.hitsAir && (['skyhit', 'Can hit flyers'] as const),
      !!d.splash && (['area', 'Area damage'] as const),
      !!d.multi && (['multi', `Hits ${d.multi} at once`] as const),
      !!d.siege && d.siege > 1 && (['siege', 'Strong against buildings'] as const),
      d.suicide && (['bomb', 'Blows itself up'] as const),
      d.garrison && (['shield', 'Can man a bunker'] as const),
    );
  /** A unit's three bars (your upgrades are the gold tail). `live` gives its current health instead of the full, as its bar. */
  const unitBars = (d: UnitDef) => {
    const dmg = boostOf(match, YOU, d, 'damage');
    const hp = boostOf(match, YOU, d, 'hp');
    return (
      meter('heart', RED, `Health ${Math.round(d.hp * hp)}`, d.hp, MOST.hp, d.hp * (hp - 1)) +
      meter('sword', ORANGE, `Damage ${per(dpsOf(d) * dmg)} a second`, dpsOf(d), MOST.dps, dpsOf(d) * (dmg - 1)) +
      meter('runner', BLUE, `Speed ${d.speed}`, d.speed, MOST.speed)
    );
  };

  /** A unit's card: its picture, how it fights (icons) and three bars. The price is on the button. */
  const unitCard = (d: UnitDef) =>
    `<header><div class="pic">${unitThumb(d, 46)}</div><div><h3>${d.name}</h3>` +
    `<div class="sub">${d.count > 1 ? `× ${d.count} ` : ''}${d.needs ? `${icon('unlock', 'Comes from')} ${towerName(d.needs)}` : ''}</div></div></header>` +
    unitBadges(d) +
    `<div class="stats">${unitBars(d)}</div>`;

  /** What a building does, as pictures: how it fights, what it makes or unlocks, and bars for health, damage and range. */
  const towerCard = (d: TowerDef, live = false) => {
    const race = RACES[match.players[YOU]!.race];
    const hosted = race.upgrades.filter((u) => u.needs === d.id).map((u) => u.name);
    const built = match.towers.filter((t) => t.owner === YOU && t.def.id === d.id).length;
    const unlocks = (d.trains ?? [])
      .map((id) => race.units.find((u) => u.id === id))
      .filter((u): u is UnitDef => !!u)
      .map((u) => `<span title="${u.name}">${unitThumb(u, 34)}</span>`)
      .join('');
    return (
      `<header><div class="pic">${towerThumb(d.art, 50, YOU, d.look?.tint)}</div><div><h3>${d.name}</h3>` +
      `<div class="sub">${d.limit ? `${built} of ${d.limit} built` : ''}${d.needs ? ` ${icon('unlock', 'Needs')} ${towerName(d.needs)}` : ''}</div></div></header>` +
      badges(
        d.damage > 0 && (d.hits !== 'air' ? (['ground', 'Hits the ground'] as const) : false),
        d.damage > 0 && (d.hits !== 'ground' ? (['wing', 'Hits flyers'] as const) : false),
        d.splash > 0 && (['area', 'Area damage'] as const),
        !!d.dot && (['drop', 'Poison'] as const),
        !!d.bunker && (['shield', `Bunker: ${d.bunker.slots} soldiers, +${d.bunker.rangeBonus} range`] as const),
        d.aura && (d.aura.kind === 'heal' ? ['heal', 'Heals those near'] : ['power', 'Boosts damage of those near']),
        !!d.detect && (['eye', 'Sees cloaked units'] as const),
        d.reach > 0 && (['reach', `Extends your build area by ${d.reach}`] as const),
      ) +
      (d.econ
        ? `<div class="pays">${money({ wood: d.econ.wood ?? 0, stone: d.econ.stone ?? 0 })}<small>every ${PAY_EVERY} s</small></div>`
        : '') +
      (unlocks ? `<div class="unlocks">${icon('unlock', 'Unlocks')}${unlocks}</div>` : '') +
      (hosted.length ? `<p class="note">${hosted.join(' · ')}</p>` : '') +
      `<div class="stats">${meter('heart', RED, `Health ${d.hp}`, d.hp, MOST.towerHp, 0, live ? 'lv-hp' : '')}${
        d.damage > 0
          ? meter(
              'sword',
              ORANGE,
              `Damage ${per(d.damage / d.cooldown)} a second`,
              d.damage / d.cooldown,
              MOST.towerDps,
            ) + meter('range', BLUE, `Range ${d.range} cells`, d.range, MOST.range)
          : ''
      }</div>`
    );
  };

  const trainButtons: [HTMLButtonElement, UnitDef][] = [];
  const buildButtons: [HTMLButtonElement, TowerDef][] = [];
  const upgradeButtons: [HTMLButtonElement, UpgradeDef][] = [];
  let castleButton: HTMLButtonElement;
  const orderButtons: [HTMLButtonElement, 'towers' | 'units'][] = [];
  /** The road chips of a map with forks (a unit you buy walks the road picked), by the lane each one is. */
  const laneButtons: [HTMLButtonElement, number][] = [];

  /** One thumbnail in the dock: a wooden square with the picture, its price under it and a ribbon over it if it is locked. */
  /** The hover caption of a dock thumbnail (its name, and why it cannot be bought now): a mouse hovering shows it above the picture. */
  const tip = $('tip');
  let hovered: HTMLElement | undefined;
  const showTip = (b: HTMLElement) => {
    const r = b.getBoundingClientRect();
    hovered = b;
    tip.textContent = b.dataset.tip ?? '';
    tip.style.left = `${r.left + r.width / 2}px`;
    tip.style.top = `${r.top - 4}px`;
    tip.hidden = !tip.textContent;
  };
  const hideTip = (b: HTMLElement) => {
    if (hovered === b) hovered = undefined;
    tip.hidden = true;
  };
  const thumb = (art: string, cost: string, title: string, onclick: () => void) => {
    const b = document.createElement('button');
    b.className = 'tb wbtn';
    b.dataset.tip = title;
    b.innerHTML = `${art}<em>${cost}</em><span class="lv"></span>`;
    b.onclick = onclick;
    b.onpointerenter = (e) => e.pointerType === 'mouse' && showTip(b);
    b.onpointerleave = () => hideTip(b);
    return b;
  };
  const setChip = (b: HTMLElement, text: string, title: string) => {
    const chip = b.querySelector('.lv')!;
    if (chip.textContent !== text) chip.textContent = text;
    b.dataset.tip = title;
    if (hovered === b) tip.textContent = title;
  };

  // The card: what a thumbnail is (and, for the castle, its health, income and the next upgrade), with the purchase button.
  type CardOf =
    | { kind: 'unit'; def: UnitDef }
    | { kind: 'tower'; def: TowerDef }
    | { kind: 'castle' }
    | { kind: 'bunker'; id: number }
    | { kind: 'sel' }
    | { kind: 'built'; id: number }
    | { kind: 'foe'; id: number };
  let cardOf: CardOf | undefined;
  /**
   * Upgrades spend a lot on one click, so the first click only arms the button ("Confirm?") and a second one within
   * `CONFIRM_MS` buys. Anything else, or waiting, disarms it.
   */
  const CONFIRM_MS = 3000;
  let armedKey: string | undefined;
  let armedTimer: ReturnType<typeof setTimeout> | undefined;
  const isArmed = (key: string) => armedKey === key;
  const disarm = () => {
    armedKey = undefined;
    clearTimeout(armedTimer);
  };
  /** True when this click is the confirming one; otherwise arms `key` and repaints. */
  function confirmed(key: string): boolean {
    if (armedKey === key) {
      disarm();
      return true;
    }
    disarm();
    armedKey = key;
    armedTimer = setTimeout(() => {
      disarm();
      if (cardOf) renderCard();
      refresh();
    }, CONFIRM_MS);
    return false;
  }
  const act = $<HTMLButtonElement>('card-act');
  let cardBody = '';
  const sameCard = (a: CardOf, b: CardOf) =>
    a.kind === b.kind &&
    (a.kind === 'castle' ||
      a.kind === 'sel' ||
      (a as { def?: unknown; id?: number }).def === (b as { def?: unknown }).def) &&
    ((a.kind !== 'bunker' && a.kind !== 'built' && a.kind !== 'foe') || a.id === (b as { id: number }).id);
  function showCard(c: CardOf, toggle = false) {
    if (toggle && cardOf && sameCard(cardOf, c)) return closeCard();
    if (!cardOf || !sameCard(cardOf, c)) disarm();
    cardOf = c;
    if (selected && !(c.kind === 'tower' && c.def === selected)) {
      selected = undefined; // looking at something else drops the tower being placed
      setGhost(undefined);
    }
    $('card').hidden = false;
    renderCard();
    refresh();
  }
  function closeCard() {
    if (cardOf?.kind === 'sel') selection.clear();
    disarm();
    cardOf = undefined;
    $('card').hidden = true;
    selected = undefined;
    setGhost(undefined);
    refresh();
  }
  $('card-x').onclick = closeCard;
  // The bunker card's own buttons (its body is rebuilt as the money and the slots change, so one listener catches them).
  $('card-body').addEventListener('click', (e) => {
    const aim = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-aim]');
    if (aim && cardOf?.kind === 'sel') {
      cmd(
        aim.dataset.aim?.startsWith('castle')
          ? {
              k: 'focus',
              ids: [...selection],
              at: aim.dataset.seat ? { kind: 'castle', owner: Number(aim.dataset.seat) } : { kind: 'castle' },
            }
          : { k: 'focus', ids: [...selection] },
      );
      renderCard();
      return;
    }
    const route = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-route]');
    if (route && cardOf?.kind === 'sel') {
      if (route.disabled) return;
      cmd({ k: 'route', ids: [...selection], lane: Number(route.dataset.route) });
      note(`${selection.size} → ${route.title}`);
      renderCard();
      return;
    }
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-load]');
    if (b) {
      if (!cardOf || cardOf.kind !== 'bunker' || b.disabled) return;
      cmd({ k: 'bunker', tower: cardOf.id, unit: b.dataset.load! });
      renderCard();
      refresh();
      return;
    }
    // Selling a building: the first tap arms it (the button says so), a second within a few seconds sells it.
    const sell = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-sell]');
    if (!sell || !cardOf || (cardOf.kind !== 'built' && cardOf.kind !== 'bunker')) return;
    const id = cardOf.id;
    if (!confirmed(`sell:${id}`)) return renderCard();
    cmd({ k: 'sell', tower: id });
    closeCard();
    refresh();
  });
  /** A building's sell button: half its price back, after a second tap. */
  const sellButton = (t: Tower) => {
    const armed = isArmed(`sell:${t.id}`);
    return (
      `<button class="sell${armed ? ' armed' : ''}" data-sell="${t.id}" title="Sell it: half its price back, and it is gone">` +
      `${armed ? 'Tap again to sell' : `Sell for ${money(sellValue(t))}`}</button>`
    );
  };

  /** Why a unit cannot be bought now ('' when it can). */
  const unitReason = (d: UnitDef) => {
    const open = unitUnlocked(match, YOU, d);
    if (open === 'tier') return `Needs castle level ${d.tier}`;
    if (open === 'needs') return `Needs ${towerName(d.needs!)}`;
    if (match.units.filter((u) => u.owner === YOU).length + d.count > UNIT_CAP)
      return `Unit limit of ${UNIT_CAP} reached`;
    return lacking(d.cost);
  };
  const towerReason = (d: TowerDef) => {
    const open = towerUnlocked(match, YOU, d);
    if (open === 'tier') return `Needs castle level ${d.tier}`;
    if (open === 'needs') return `Needs ${towerName(d.needs!)}`;
    if (open === 'limit') return `Only ${d.limit} allowed`;
    return lacking(d.cost);
  };

  /**
   * The card of the group you picked: one unit's stats, or what the group is made of, with its health and who it is sent after.
   * The main way to command is on the field (tap a rival's tower or castle); the buttons are only there to take the order back.
   */
  function renderSel() {
    const units = picked();
    if (!units.length) return closeCard(); // all fell, or were let go
    const kinds = new Map<string, { def: UnitDef; n: number }>();
    for (const u of units) kinds.set(u.def.id, { def: u.def, n: (kinds.get(u.def.id)?.n ?? 0) + 1 });
    const list = [...kinds.values()].sort((a, b) => b.n - a.n);
    const first = list[0]!.def;
    const on = (b: boolean) => (b ? ' class="on"' : '');
    const where = new Map<string, number>();
    for (const u of units) {
      const f = u.focus;
      const name = !f
        ? ''
        : f.kind === 'castle'
          ? 'the castle'
          : (match.towers.find((t) => t.id === f.id)?.def.name ?? '');
      if (name) where.set(name, (where.get(name) ?? 0) + 1);
    }
    const sent = [...where].map(([name, n]) => `${n} → ${name}`).join(' · ');
    const dmg = boostOf(match, YOU, first, 'damage');
    const title = units.length === 1 ? first.name : `${units.length} units`;
    const crowd = list
      .map((k) => `<span class="kind" title="${k.def.name}">${unitThumb(k.def, 30)}<b>${k.n}</b></span>`)
      .join('');
    const single = units.length === 1;
    const body =
      `<header><div class="pic">${unitThumb(first, 46)}</div><div><h3>${title}</h3>` +
      `<div class="sub">${single ? '' : list.length === 1 ? first.name : ''}</div></div></header>` +
      (!single && list.length > 1 ? `<div class="crowd">${crowd}</div>` : '') +
      (single ? unitBadges(first) : '') +
      `<div class="stats">${meter('heart', RED, 'Health', 100, 100, 0, 'lv-hp')}${
        single
          ? meter(
              'sword',
              ORANGE,
              `Damage ${per(dpsOf(first) * dmg)} a second`,
              dpsOf(first),
              MOST.dps,
              dpsOf(first) * (dmg - 1),
            ) + meter('runner', BLUE, `Speed ${first.speed}`, first.speed, MOST.speed)
          : ''
      }</div>` +
      `<div class="targets">` +
      `<button data-aim="none"${on(!sent)} title="Follow the general orders (X)">Orders</button>` +
      (coop()
        ? foesOf(match, YOU)
            .map(
              (o) =>
                `<button data-aim="castle" data-seat="${o}"${on(units.every((u) => u.focus?.kind === 'castle' && (u.focus.owner ?? laneOf(match.board, u).to) === o))} title="Walk past everything to the ${castleName(o)} castle">${castleName(o)} castle</button>`,
            )
            .join('')
        : `<button data-aim="castle"${on(units.every((u) => u.focus?.kind === 'castle'))} title="Walk past everything to the castle (C)">Castle</button>`) +
      `</div>` +
      (coop()
        ? `<p class="note">Road (before the fork):</p><div class="targets">${openLanes(match, YOU)
            .map((l) => {
              const reach = units.some((u) => (nearestOnLane(match, u, l.id)?.d ?? Infinity) <= SWITCH_NEAR);
              const here = units.every((u) => (u.lane ?? match.board.homeLane[YOU]) === l.id);
              return `<button data-route="${l.id}"${on(here)}${reach ? '' : ' disabled'} title="${l.name} to the ${castleName(l.to)} camp${reach ? '' : ' (too late: they are past the fork)'}">${l.name}<small>${castleName(l.to)}</small></button>`;
            })
            .join('')}</div>`
        : '') +
      (sent ? `<p class="note">${sent}</p>` : '');
    if (body !== cardBody) {
      $('card-body').innerHTML = body;
      cardBody = body;
    }
    const [hp, max] = units.reduce<[number, number]>(([a, b], u) => [a + u.hp, b + u.maxHp], [0, 0]);
    const lv = $('lv-hp');
    lv.style.width = `${Math.max(2, (hp / max) * 100)}%`;
    lv.parentElement!.parentElement!.title = `Health ${Math.max(0, Math.ceil(hp))} / ${Math.ceil(max)}`;
    act.hidden = true;
  }

  /** A building that stands: yours (what it does, with its health) or the rival's (its picture and health). */
  function renderTower(id: number, mine: boolean) {
    const t = match.towers.find((x) => x.id === id && x.hp > 0);
    if (!t || (!mine && !isSeen(match, YOU, t))) return closeCard(); // it fell, or slipped out of sight
    const body = mine
      ? towerCard(t.def, true) + sellButton(t)
      : `<header><div class="pic">${towerThumb(t.def.art, 50, t.owner, t.def.look?.tint)}</div><div><h3>${t.def.name}</h3></div></header>` +
        `<div class="stats">${meter('heart', RED, 'Health', t.def.hp, MOST.towerHp, 0, 'lv-hp')}</div>`;
    if (body !== cardBody) {
      $('card-body').innerHTML = body;
      cardBody = body;
    }
    const lv = $('lv-hp');
    lv.style.width = `${Math.max(6, Math.min(100, Math.sqrt(Math.max(0, t.hp) / MOST.towerHp) * 100))}%`;
    lv.parentElement!.parentElement!.title = `Health ${Math.ceil(t.hp)} / ${t.def.hp}`;
    // Your own damaged tower can be repaired for resources; the health comes back over time.
    act.hidden = !mine || t.def.hp - t.hp < 1;
    if (!act.hidden) {
      const mending = repairable(t) < 1;
      const cost = repairCost(t);
      const said = mending ? 'Mending…' : `Repair ${money(cost)}`;
      if (act.innerHTML !== said) act.innerHTML = said;
      act.disabled = mending || !canAfford(match.players[YOU]!, cost);
      act.title = mending ? 'Already being repaired' : act.disabled ? 'Not enough wood or stone' : '';
      act.onclick = () => {
        cmd({ k: 'repair', tower: t.id });
        renderCard();
        refresh();
      };
    }
  }

  function renderCard() {
    if (!cardOf) return;
    const me = match.players[YOU]!;
    const race = RACES[me.race];
    const { level } = me.castle;
    const card = $('card');
    card.classList.toggle('placing', cardOf.kind === 'tower' && selected === cardOf.def);
    card.classList.toggle('group', cardOf.kind === 'sel');
    if (cardOf.kind === 'sel') return renderSel();
    if (cardOf.kind === 'built' || cardOf.kind === 'foe') return renderTower(cardOf.id, cardOf.kind === 'built');
    let body: string;
    let label = '';
    let reason = '';
    let go: () => void = () => undefined;
    const bunker =
      cardOf.kind === 'bunker' ? match.towers.find((t) => t.id === (cardOf as { id: number }).id) : undefined;
    if (cardOf.kind === 'bunker' && !bunker) return closeCard(); // it fell
    if (cardOf.kind === 'unit') {
      const d = cardOf.def;
      body = unitCard(d);
      // One purchase a click (they can click fast): the card says what it brings, and why it cannot be bought.
      label = money(d.cost);
      reason = maxPurchases(match, YOU, d) > 0 ? '' : unitReason(d);
      go = () => cmd({ k: 'train', id: d.id, n: 1 });
    } else if (cardOf.kind === 'tower') {
      const d = cardOf.def;
      body = towerCard(d);
      if (selected === d) {
        label = '✕';
        go = () => {
          selected = undefined;
          setGhost(undefined);
        };
      } else {
        label = money(d.cost);
        reason = towerReason(d);
        go = () => {
          selected = d;
        };
      }
    } else if (bunker) {
      const b = bunker.def.bunker!;
      const dots = Array.from(
        { length: b.slots },
        (_, i) => `<i class="${i < bunker.garrison.length ? 'on' : ''}"></i>`,
      ).join('');
      const full = bunker.garrison.length >= b.slots;
      const loads = race.units
        .filter((u) => u.garrison)
        .map((u) => {
          const cost = soldierCost(u);
          const why = full ? 'Full' : unitUnlocked(match, YOU, u) !== 'ok' ? unitReason(u) : lacking(cost);
          return (
            `<button class="load" data-load="${u.id}"${why ? ' disabled' : ''}>${unitThumb(u, 34)}` +
            `<span><b>${u.name}</b><small>${why || `${u.damage} dmg · range ${per(u.range + b.rangeBonus)}${u.hitsAir ? ' · hits air' : ''}`}</small></span>` +
            `<em>${money(cost)}</em></button>`
          );
        })
        .join('');
      body =
        `<header><div class="pic">${towerThumb(bunker.def.art, 50, bunker.owner, bunker.def.look?.tint)}</div><div><h3>${bunker.def.name}</h3><div class="sub">${bunker.garrison.length} of ${b.slots} soldiers inside</div></div></header>` +
        `<div class="slots">${dots}</div>` +
        `<div class="hp"><i style="width:${Math.max(0, (bunker.hp / bunker.def.hp) * 100)}%"></i><span>${Math.max(0, Math.ceil(bunker.hp))} / ${bunker.def.hp}</span></div>` +
        `<p class="note">Soldiers loaded here shoot from the walls with +${b.rangeBonus} range, and fall with it. Tap one to load it.</p>` +
        `<div class="loads">${loads || '<p class="note">None of your units fit a bunker.</p>'}</div>` +
        sellButton(bunker);
    } else {
      const cost = upgradeCost(match, YOU);
      const inc = incomeOf(match, YOU);
      const base = race.castle.income[level - 1]!;
      const nextInc = race.castle.income[level];
      const names = (items: { name: string; tier: number }[]) =>
        items
          .filter((i) => i.tier === level + 1)
          .map((i) => i.name)
          .join(', ');
      const lacks = upgradeLacks(match, YOU);
      const ROLE_NAMES: Record<Role, string> = {
        econ: 'mill or quarry',
        producer: 'unit building',
        smithy: 'smithy',
        defence: 'tower',
      };
      const asks = (race.castle.needs[level - 1] ?? [])
        .map((n) => {
          const have = lacks.find((l) => l.need === n)?.have ?? n.count;
          const name = `${ROLE_NAMES[n.role]}${n.count > 1 ? 's' : ''}${n.tier && n.tier > 1 ? ` (level ${n.tier}+)` : ''}`;
          return `<li class="${have >= n.count ? 'ok' : 'no'}">${have} / ${n.count} ${name}</li>`;
        })
        .join('');
      body =
        `<header><div class="pic">${towerThumb(race.castle.art, 50)}</div><div><h3>${race.name} castle</h3><div class="sub">Level ${level} of ${MAX_LEVEL}</div></div></header>` +
        `<div class="hp"><i style="width:${Math.max(0, (me.castle.hp / me.castle.maxHp) * 100)}%"></i><span>${Math.max(0, Math.ceil(me.castle.hp))} / ${me.castle.maxHp}</span></div>` +
        `<ul>${row('Castle pays', `${money(base)} every ${PAY_EVERY} s`)}${row('With mills and quarries', money(inc))}${row('Build reach', `${race.castle.reach[level - 1]} cells`)}${row('Units out', `${match.units.filter((u) => u.owner === YOU).length} of ${UNIT_CAP}`)}</ul>` +
        (cost === undefined || !nextInc
          ? '<p class="note">The castle has every upgrade.</p>'
          : `<p class="note"><b>Level ${level + 1}</b> costs ${money(cost)}: build reach ${race.castle.reach[level - 1]} → ${race.castle.reach[level]} cells, pays ${money(nextInc)}, castle health +${race.castle.hpPerLevel}. Unlocks units: ${names(race.units) || 'none'}; buildings: ${names(race.towers) || 'none'}.</p>` +
            (asks ? `<p class="note">First build:</p><ul class="needs">${asks}</ul>` : ''));
      label =
        cost === undefined
          ? icon('power', 'Fully upgraded')
          : `${icon('power', `Upgrade to level ${level + 1}`)}${money(cost)}`;
      reason = cost === undefined ? 'max' : lacks.length > 0 ? 'Build what it asks for first' : lacking(cost);
      if (cost !== undefined && !reason && isArmed('castle')) label = icon('power', 'Confirm upgrade?') + money(cost);
      go = () => {
        if (confirmed('castle')) cmd({ k: 'castle' });
      };
    }
    if (body !== cardBody) {
      $('card-body').innerHTML = body;
      cardBody = body;
    }
    act.hidden = cardOf.kind === 'bunker';
    const said = `${label}${reason && reason !== 'max' ? `<small>${reason}</small>` : ''}`;
    if (act.innerHTML !== said) act.innerHTML = said;
    act.disabled = !!reason;
    act.title = reason === 'max' ? '' : reason;
    act.onclick = () => {
      go();
      renderCard();
      refresh();
    };
  }

  /** The dock's three shelves (units, buildings, upgrades). */
  let tab: 'units' | 'build' | 'upgrades' = 'units';
  const shelves = { units: 'train', build: 'build', upgrades: 'upgrades' } as const;
  function setTab(t: typeof tab) {
    tab = t;
    for (const [k, id] of Object.entries(shelves)) $(id).hidden = k !== t;
    for (const b of document.querySelectorAll<HTMLButtonElement>('#tabs button'))
      b.classList.toggle('on', b.dataset.tab === t);
    document.documentElement.style.setProperty('--dock-h', `${$('dock').offsetHeight}px`);
    clampCamera();
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('#tabs button'))
    b.onclick = () => setTab(b.dataset.tab as typeof tab);
  window.addEventListener('resize', () =>
    document.documentElement.style.setProperty('--dock-h', `${$('dock').offsetHeight}px`),
  );

  /** Buildings by what they are for, so fifteen of them stay easy to find. */
  const roleOf = (d: TowerDef) =>
    d.econ ? 'Economy' : d.damage > 0 || d.bunker ? 'Defence' : d.aura || d.detect ? 'Support' : 'Production';
  const ROLES = ['Economy', 'Production', 'Defence', 'Support'];

  const upgradeText = (up: UpgradeDef) => `${pct(up.perLevel)} ${up.applies} ${up.stat === 'hp' ? 'health' : 'damage'}`;

  function makeControls(race: RaceId) {
    for (const id of ['train', 'build', 'upgrades', 'castle']) $(id).innerHTML = '';
    trainButtons.length = 0;
    buildButtons.length = 0;
    upgradeButtons.length = 0;
    orderButtons.length = 0;
    laneButtons.length = 0;
    const r = RACES[race];
    // A map with roads that fork: which road the units you buy take (their castle's gate leads to every one of them).
    const roads = match.board.lanes.filter((l) => l.from === YOU);
    if (roads.length > 1) {
      const sec = document.createElement('div');
      sec.className = 'sec';
      sec.innerHTML = '<h4>March by</h4><div class="thumbs"></div>';
      for (const lane of roads) {
        const b = document.createElement('button');
        b.className = 'tb lane wbtn';
        b.innerHTML = `<span>${lane.name}</span>`;
        b.onclick = () => {
          cmd({ k: 'lane', lane: lane.id });
          refresh();
        };
        b.onmouseenter = () => (laneHover = lane.id);
        b.onmouseleave = () => (laneHover = undefined);
        sec.lastElementChild!.append(b);
        laneButtons.push([b, lane.id]);
      }
      $('train').append(sec);
    }
    for (const def of r.units) {
      const b = thumb(unitThumb(def, 36), money(def.cost), def.name, () => showCard({ kind: 'unit', def }, true));
      $('train').append(b);
      trainButtons.push([b, def]);
    }
    for (const role of ROLES) {
      const defs = r.towers.filter((d) => roleOf(d) === role);
      if (!defs.length) continue;
      const sec = document.createElement('div');
      sec.className = 'sec';
      sec.innerHTML = `<h4>${role}</h4><div class="thumbs"></div>`;
      for (const def of defs) {
        const b = thumb(towerThumb(def.art, 36, YOU, def.look?.tint), money(def.cost), def.name, () =>
          showCard({ kind: 'tower', def }, true),
        );
        sec.lastElementChild!.append(b);
        buildButtons.push([b, def]);
      }
      $('build').append(sec);
    }
    for (const up of r.upgrades) {
      const b = document.createElement('button');
      b.className = 'up wbtn';
      b.innerHTML = `<b>${up.name}</b><small>${upgradeText(up)}</small><span class="foot"><span class="pips"><i></i><i></i><i></i></span><em></em></span>`;
      b.onclick = () => {
        if (confirmed(`up:${up.id}`)) cmd({ k: 'upgrade', id: up.id });
        refresh();
      };
      $('upgrades').append(b);
      upgradeButtons.push([b, up]);
    }
    castleButton = thumb(towerThumb(r.castle.art, 40), '', 'Your castle: upgrade it', () =>
      showCard({ kind: 'castle' }, true),
    );
    $('castle').append(castleButton);
    for (const what of ['towers', 'units'] as const) {
      const b = document.createElement('button');
      b.className = 'tb orders wbtn';
      b.onclick = () => {
        const o = match.players[YOU]!.orders;
        cmd({ k: 'order', what, to: o[what] === 'attack' ? 'bypass' : 'attack' });
        refresh();
      };
      $('castle').append(b);
      orderButtons.push([b, what]);
    }
    setTab(tab);
  }

  function refresh() {
    const me = match.players[YOU]!;
    const { level } = me.castle;
    for (const [b, def] of trainButtons) {
      const open = unitUnlocked(match, YOU, def);
      const why = unitReason(def);
      b.hidden = open !== 'ok'; // only what you can train now (a unit needs its building and a castle level)
      b.classList.toggle('lock', open !== 'ok');
      b.classList.toggle('poor', open === 'ok' && !!why);
      b.classList.toggle('open', cardOf?.kind === 'unit' && cardOf.def === def);
      setChip(
        b,
        open === 'tier' ? `L${def.tier}` : open === 'needs' ? towerName(def.needs!) : '',
        `${def.name}${why ? `: ${why}` : ''}`,
      );
    }
    for (const [b, def] of buildButtons) {
      const open = towerUnlocked(match, YOU, def);
      const why = towerReason(def);
      b.hidden = open !== 'ok'; // only what you can build now: its castle level and the building it needs are there
      b.classList.toggle('lock', open !== 'ok');
      b.classList.toggle('poor', open === 'ok' && !!why);
      b.classList.toggle('open', cardOf?.kind === 'tower' && cardOf.def === def && selected !== def);
      b.classList.toggle('arm', selected === def);
      setChip(
        b,
        open === 'tier' ? `L${def.tier}` : open === 'needs' ? towerName(def.needs!) : open === 'limit' ? 'built' : '',
        `${def.name}${why ? `: ${why}` : ''}`,
      );
    }
    for (const [b, up] of upgradeButtons) {
      const lvl = upgradeLevel(match, YOU, up.id);
      const next = nextUpgrade(match, YOU, up);
      let why = '';
      if (!next) why = 'Fully upgraded';
      else if (next.tier > level) why = `Needs castle level ${next.tier}`;
      else if (!match.towers.some((t) => t.owner === YOU && t.def.id === up.needs))
        why = `Needs ${towerName(up.needs)}`;
      const poor = !!next && !why && !canAfford(me, next.cost);
      const pips = b.querySelectorAll('.pips i');
      pips.forEach((p, i) => p.classList.toggle('on', i < lvl));
      const line = b.querySelector('em')!;
      const text = !next ? 'max' : why ? '' : isArmed(`up:${up.id}`) ? 'Confirm?' : money(next.cost);
      if (line.innerHTML !== text) line.innerHTML = text;
      const effect = b.querySelector('small')!;
      const said = why && next ? why : upgradeText(up);
      if (effect.textContent !== said) effect.textContent = said;
      b.hidden = !next || !!why; // only an upgrade you can buy now
      b.classList.toggle('lock', !!why);
      b.classList.toggle('poor', poor);
      b.classList.toggle('armed', isArmed(`up:${up.id}`));
      b.title = why || (poor ? lacking(next.cost) : `Buy level ${lvl + 1}`);
      b.disabled = !next || !!why;
    }
    // A section or a tab with nothing in it is not shown; if the open tab empties, go back to the units.
    for (const sec of document.querySelectorAll<HTMLElement>('#build .sec'))
      sec.hidden = !sec.querySelector('.tb:not([hidden])');
    for (const tabButton of document.querySelectorAll<HTMLButtonElement>('#tabs button')) {
      const shelf = $(shelves[tabButton.dataset.tab as keyof typeof shelves]);
      tabButton.hidden = !shelf.querySelector('.tb:not([hidden]), .up:not([hidden])');
    }
    if (tab !== 'units' && $(shelves[tab]).querySelector('.tb:not([hidden]), .up:not([hidden])') === null)
      setTab('units');
    const upCost = upgradeCost(match, YOU);
    castleButton.classList.toggle('open', cardOf?.kind === 'castle');
    castleButton.classList.toggle('poor', upCost === undefined || !canAfford(me, upCost));
    castleButton.querySelector('em')!.textContent = `Lv ${level}`;
    const march = laneFor(match, YOU);
    const open = new Set(openLanes(match, YOU).map((l) => l.id));
    for (const [b, id] of laneButtons) {
      const lane = match.board.lanes[id]!;
      b.hidden = !open.has(id); // a road to a castle that has fallen is no road
      b.classList.toggle('on', id === march);
      b.title = `New units march: ${lane.name}, to the ${castleName(lane.to)} camp`;
    }
    for (const [b, what] of orderButtons) {
      const attack = me.orders[what] === 'attack';
      const label = what === 'towers' ? ['Attack towers', 'Pass towers'] : ['Fight units', 'Pass units'];
      const text = `<span>${attack ? label[0] : label[1]}</span>`;
      if (b.innerHTML !== text) b.innerHTML = text;
      b.title = `All your units: tap to ${attack ? 'walk past' : 'attack'}`;
      b.classList.toggle('bypass', !attack);
    }
    renderCard();
    if (!selected) setGhost(undefined);
  }

  /** The caption under the top bar: what the selected tower needs, and why the cell being looked at cannot take it. */
  function updateHint(aim: readonly [number, number] | undefined) {
    let text = '';
    if (selected && started) {
      const cell = aim ?? lastTap;
      const why = cell ? canBuild(match, YOU, selected, cell[0], cell[1]) : 'ok';
      const reasons: Record<string, string> = {
        area: 'Fogged ground: build only where your castle or a tower sees.',
        foe: 'Too close to the rival castle.',
        road: 'That is the road: build beside it.',
        scenery: 'Trees, rocks or water are in the way.',
        taken: 'Something is already built there.',
        castle: 'Too close to a castle.',
        gold: `Not enough wood or stone for a ${selected.name}.`,
        tier: `A ${selected.name} needs a higher castle level.`,
        needs: `A ${selected.name} needs the ${selected.needs ? towerName(selected.needs) : 'building'} first.`,
        limit: `You can only have ${selected.limit ?? 'so many'} ${selected.name}.`,
      };
      text =
        cell && why !== 'ok'
          ? (reasons[why] ?? '')
          : ghost
            ? `Confirm to build the ${selected.name}, or tap another cell. Esc to cancel.`
            : `Tap a clear cell to build a ${selected.name}. Esc to cancel.`;
    }
    if (started && !selected && clock < hintUntil) text = hintNote;
    if ($('hint').textContent !== text) $('hint').textContent = text;
  }

  let loading = false;
  /** Pick the rivals (and an ally of a co-op match who is not a friend: a computer), wait for the art the match needs, then begin. */
  async function start(race: RaceId, chosen?: RaceId, map: BoardId = chosenMap) {
    if (loading) return;
    loading = true;
    const seats = BOARDS[map]?.seats ?? 2;
    const others = RACE_IDS.filter((r) => r !== race);
    const any = () => RACE_IDS[Math.floor(Math.random() * RACE_IDS.length)]!;
    // A duel's rival is another race than yours; allies and the computers of a bigger match are any.
    const races: RaceId[] =
      seats === 2
        ? [race, chosen ?? others[Math.floor(Math.random() * others.length)]!]
        : [race, ...Array.from({ length: seats - 1 }, any)];
    try {
      await loadArt(races, map);
    } finally {
      loading = false;
    }
    begin(races, map, 0, (Math.random() * 2 ** 31) | 0, 1);
  }
  /** Wait for the art a match needs, behind a progress bar. */
  async function loadArt(races: RaceId[], map: BoardId) {
    const bar = $('loading-bar');
    bar.style.width = '4%';
    $('loading').hidden = false;
    try {
      await ensureAssets(races, map, (done) => (bar.style.width = `${Math.max(4, done * 100)}%`));
    } finally {
      $('loading').hidden = true;
    }
  }
  /** An online match: both pages load the art, then begin on the same lockstep clock (`lock` was made for this match). */
  async function startOnline(lock: Lockstep, races: RaceId[], map: BoardId, you: Person, seed: number) {
    if (loading) return;
    loading = true;
    try {
      await loadArt(races, map);
    } finally {
      loading = false;
    }
    if (online?.lock !== lock) return; // the connection ended while the art loaded
    begin(races, map, you, seed, 2);
  }
  /** What changed since the last tick, for the sounds (`soundEvents.ts`); made at the start of each match. */
  let sounds: SoundWatch | undefined;
  /** What a solo duel's computer earns against you, as a multiple (`Player.pace`). The difficulty knob: `tools/towercraftBalance.ts` plays the computers against each other, so this is tuned by play. */
  const SOLO_COMPUTER_PACE = 1.25;
  /** Start a match: one race per seat of the map, you in seat `you`, the computers (every seat past `people`) playing by `seed`. */
  function begin(races: RaceId[], map: BoardId, you: Owner, seed: number, people: number) {
    YOU = you;
    wreck.clear();
    finale = undefined;
    endText = undefined;
    stalled = 0;
    const board = BOARDS[map] ?? BOARDS[DEFAULT_BOARD_ID];
    if (!board) throw new Error(`no map ${map}`);
    // A solo duel's computer earns a little more than you (the difficulty; co-op computers keep their board's pace).
    match = rejoinState
      ? unpackMatch(rejoinState)
      : newMatch(races, board, undefined, people === 1 && board.seats === 2 ? [1, SOLO_COMPUTER_PACE] : board.pace);
    matchSeed = rejoinState?.seed ?? seed;
    ais = makeAis(match, matchSeed, people);
    sounds = new SoundWatch(match);
    // A page that comes back in mid-match carries on from what the computers remembered, not from a fresh start.
    rejoinState?.ai.forEach((state, i) => ais[i]?.load(state));
    rejoinState = undefined;
    applyBoard();
    selected = undefined;
    acc = 0;
    started = true;
    playMusic();
    document.body.classList.add('playing');
    for (const c of [...towerSprites.values(), ...unitSprites.values()]) c.destroy({ children: true });
    for (const f of floaters) f.text.destroy();
    floaters.length = 0;
    towerSprites.clear();
    unitSprites.clear();
    tracks.clear();
    booms.length = 0;
    strikes.clear();
    kicks.clear();
    effects.length = 0;
    fogSnap = true;
    pools.clear();
    remembered.length = 0;
    ghost = undefined;
    lastTap = undefined;
    buildCastles();
    makeControls(match.players[you]!.race);
    cardOf = undefined;
    $('card').hidden = true;
    $('menu').hidden = true;
    $('end').hidden = true;
    refresh();
    home();
    if (rejoinWanted) bringBack();
  }

  // The title screen: how to play (solo, host, join), the format (a duel, or two on a side against computers), the battlefield (a picture
  // of each map that fits the format, kept for next time), then the race that starts the match.
  type Format = 'duel' | 'two-v-one' | 'two-v-two';
  /** A format's seats (one castle each), and what the title screen says it is: alone (a computer takes the other seats) or online (a friend does). */
  const FORMATS: Record<Format, { seats: number; solo: string; online: string }> = {
    duel: { seats: 2, solo: 'You against a computer.', online: 'You against your friend.' },
    'two-v-one': {
      seats: 3,
      solo: 'You and a computer ally against one computer. Its roads fork: send your units down the one you choose.',
      online:
        'You and your friend, each with your own camp, against one computer. It is paid more to make up for being alone.',
    },
    'two-v-two': {
      seats: 4,
      solo: 'You and a computer ally against two computers. Roads fork and cross: hold the forks, or split your armies.',
      online:
        'You and your friend, each with your own camp, against two computers. Roads fork and cross between camps.',
    },
  };
  let format: Format = 'duel';
  const mapKey = (seats: number) => (seats === 2 ? 'towercraft:map' : `towercraft:map:${seats}`);
  /** The map last picked for this many seats, or the first that fits. */
  const rememberedMap = (seats: number): BoardId => {
    try {
      const saved = localStorage.getItem(mapKey(seats));
      if (saved && BOARDS[saved]?.seats === seats) return saved;
    } catch {
      /* no storage: the first map */
    }
    return seats === 2 ? 'frostlands' : boardIdsFor(seats)[0]!;
  };
  const mapButtons = new Map<BoardId, HTMLButtonElement>();
  const pickMap = (id: BoardId) => {
    chosenMap = id;
    try {
      localStorage.setItem(mapKey(BOARDS[id]!.seats), id);
    } catch {
      /* no storage: the choice lasts this visit */
    }
    for (const [k, b] of mapButtons) b.classList.toggle('on', k === id);
    void getField(id); // its picture, in case the player is quick
  };
  /** The maps that fit the format, as pictures to pick from (a co-op map says its name: its roads are the point). */
  const buildMaps = () => {
    $('maps').replaceChildren();
    mapButtons.clear();
    for (const id of boardIdsFor(FORMATS[format].seats)) {
      const board = BOARDS[id]!;
      const b = document.createElement('button');
      b.className = 'map';
      b.title = board.blurb ? `${board.name}: ${board.blurb}` : board.name;
      b.innerHTML = `<span class="shot" style="background-image:url(art/maps/thumbs/${id}.png);aspect-ratio:${board.cols} / ${board.rows}"></span>${board.seats > 2 ? `<b>${board.name.replace(/ \(.*\)/, '')}</b>` : ''}`;
      b.onclick = () => pickMap(id);
      $('maps').append(b);
      mapButtons.set(id, b);
    }
    pickMap(rememberedMap(FORMATS[format].seats));
  };

  for (const id of RACE_IDS) {
    const race = RACES[id];
    const b = document.createElement('button');
    b.className = 'race';
    b.style.setProperty('--c', '#' + race.color.toString(16).padStart(6, '0'));
    b.innerHTML = `<span class="face">${unitThumb(race.units[0]!, 72)}</span><b>${race.name}</b>`;
    b.onclick = () => pickRace(id);
    $('races').append(b);
  }
  // How to play: alone, hosting a game (the map, the format and a game code to give), or joining one (the host's code). Online is
  // lockstep over a direct connection set up through the matchmaking relay (net/duel.ts, net/lockstep.ts). A friend is the rival of
  // a duel and the partner of a co-op match; the computers hold every other seat on both pages.
  type Mode = 'solo' | 'host' | 'join';
  let mode: Mode = 'solo';
  /** The race picked for an online match, and whether a connection is being made (the race buttons wait). */
  let myRace: RaceId = RACE_IDS[0]!;
  let connecting = false;
  /** The other person came back while the host's art was still loading: let them in as soon as the match begins. */
  let rejoinWanted = false;
  const raceOk = (r: string): r is RaceId => (RACE_IDS as readonly string[]).includes(r);
  const netText = (text: string, bad = false, code?: string) => {
    $('net').hidden = !text && !code;
    $('net-text').textContent = text;
    $('net-text').classList.toggle('bad', bad);
    $('net-code').hidden = !code;
    $('net-code').textContent = code ?? '';
    $('net-cancel').hidden = !connecting;
  };
  const describe = () => {
    $('format-pick').hidden = mode === 'join';
    $('format-note').textContent = mode === 'solo' ? FORMATS[format].solo : FORMATS[format].online;
    const co = format !== 'duel';
    $('race-h').textContent =
      mode === 'solo'
        ? 'Choose your race'
        : mode === 'host'
          ? `Choose your race, then host${co ? ' (your friend is your partner)' : ''}`
          : 'Choose your race, then join';
  };
  const setFormat = (f: Format) => {
    format = f;
    for (const b of $('formats').querySelectorAll<HTMLButtonElement>('button'))
      b.classList.toggle('on', b.dataset.format === f);
    buildMaps();
    describe();
  };
  const setMode = (m: Mode) => {
    duel.close();
    connecting = false;
    mode = m;
    for (const b of $('modes').querySelectorAll<HTMLButtonElement>('button'))
      b.classList.toggle('on', b.dataset.mode === m);
    $('map-pick').hidden = m === 'join';
    $('join-row').hidden = m !== 'join';
    describe();
    $('races').classList.remove('busy');
    netText(m === 'join' ? 'The host picks the map and the format.' : '');
  };
  const pickRace = (id: RaceId) => {
    if (mode === 'solo') return void start(id);
    if (connecting) return;
    myRace = id;
    if (mode === 'join' && !normalizeCode($<HTMLInputElement>('code').value)) {
      netText('Type the two-word code your host shows, then pick your race.', true);
      return;
    }
    connecting = true;
    $('races').classList.add('busy');
    netText('Starting…');
    void (mode === 'host' ? duel.host() : duel.join($<HTMLInputElement>('code').value));
  };
  const onPhase = (phase: DuelPhase, text: string, code?: string) => {
    if (code) hostCode = code;
    if (phase === 'connected') {
      netText('Connected. Starting…');
      if (mode === 'join') duel.send({ t: 'hi', v: NET_VERSION, race: myRace });
      return;
    }
    connecting = phase === 'working' || phase === 'waiting';
    $('races').classList.toggle('busy', connecting);
    netText(text, phase === 'failed', code);
  };
  /** Both pages start the same match: a clock for the two people, then the art, then the first tick. */
  const startDuel = (you: Person, races: RaceId[], map: BoardId, seed: number) => {
    const lock = new Lockstep(you, { send: (m: Message) => void duel.send(m) });
    online = { lock };
    void startOnline(lock, races, map, you, seed);
    return lock;
  };
  const versionMismatch = (text: string) => {
    duel.close();
    connecting = false;
    $('races').classList.remove('busy');
    netText(text, true);
  };
  const onMessage = (m: Message) => {
    if (m.t === 'hi' && mode === 'host' && online) {
      // The other person's connection dropped and they are back on the same code: bring them in.
      if (m.v !== NET_VERSION || !online.lock.away) return;
      if (started) bringBack();
      else rejoinWanted = true;
    } else if (m.t === 'hi' && mode === 'host' && !online) {
      if (m.v !== NET_VERSION || !raceOk(m.race))
        return versionMismatch('That player has a different version of the game. Reload both pages and try again.');
      // A race for every seat: yours, your friend's, and the computers' (any), the same on both pages from the `go` message.
      const seats = BOARDS[chosenMap]?.seats ?? 2;
      const races: RaceId[] = [
        myRace,
        m.race,
        ...Array.from({ length: seats - 2 }, () => RACE_IDS[Math.floor(Math.random() * RACE_IDS.length)]!),
      ];
      const seed = (Math.random() * 2 ** 31) | 0;
      duel.send({ t: 'go', v: NET_VERSION, map: chosenMap, races, seed });
      startDuel(0, races, chosenMap, seed);
    } else if (m.t === 'go' && mode === 'join' && !online) {
      if (m.v !== NET_VERSION || BOARDS[m.map]?.seats !== m.races.length || !m.races.every(raceOk))
        return versionMismatch('The host is on a different version of the game. Reload both pages and try again.');
      startDuel(1, m.races, m.map, m.seed);
    } else if (m.t === 'snap' && mode === 'join' && !online) {
      // Coming back to a match in progress: the snapshot alone starts it (the match, the computers' memory, the clock and who you are), so the page cannot begin without it.
      const { board, players } = m.state;
      const races = players.map((p) => p.race);
      if (BOARDS[board]?.seats !== players.length || !races.every(raceOk))
        return versionMismatch('The host is on a different version of the game. Reload both pages and try again.');
      myRace = races[1] as RaceId;
      rejoinState = m.state;
      startDuel(1, races, board, m.state.seed).resume(m.n, m.c, m.mine);
    } else if (m.t === 'tick') online?.lock.receive(m.n, m.c);
    else if (m.t === 'sum') online?.lock.receiveSum(m.n, m.h);
  };
  /** The other person is back: send them the match as it stands (the clock resumes together), and stop treating them as away. */
  function bringBack() {
    if (!online || match.winner >= 0) return;
    rejoinWanted = false;
    duel.send({ t: 'snap', ...online.lock.snapshot(), state: packMatch(match, matchSeed, ais) });
    online.lock.rejoin();
  }
  const onClosed = (reason: string) => {
    if (online && mode === 'host') {
      // The other person dropped: their side plays on by itself (their units march, their towers shoot) and the same code lets them back in.
      online.lock.setAway(true);
    } else if (online && started && match.winner < 0) {
      // The host is gone: the match cannot go on without them.
      endText = ['Disconnected', `${reason} If the host is still there, join again with the same code to carry on.`];
      match.winner = 2;
      showEnd();
    } else if (!started) {
      online = undefined;
      connecting = false;
      $('races').classList.remove('busy');
      netText(reason, true);
    }
  };
  const duel = new Duel({ phase: onPhase, message: onMessage, closed: onClosed });
  for (const b of $('modes').querySelectorAll<HTMLButtonElement>('button'))
    b.onclick = () => setMode(b.dataset.mode as Mode);
  for (const b of $('formats').querySelectorAll<HTMLButtonElement>('button'))
    b.onclick = () => setFormat(b.dataset.format as Format);
  $('net-cancel').onclick = () => setMode(mode);
  setFormat('duel');
  setMode('solo');
  window.addEventListener('pagehide', () => duel.close());

  $('credits-btn').onclick = () => ($('credits').hidden = false);
  $('credits-x').onclick = () => ($('credits').hidden = true);
  $('again').onclick = () => {
    duel.close();
    online = undefined;
    rejoinState = undefined;
    rejoinWanted = false;
    setMode(mode);
    started = false;
    document.body.classList.remove('playing');
    $('end').hidden = true;
    $('menu').hidden = false;
  };

  // For playtest scripts (`?debug`): where a cell is on screen, and the match itself.
  if (new URLSearchParams(window.location.search).has('debug'))
    Object.assign(window, {
      towercraft: {
        screenOf: (col: number, row: number) => [
          world.x + (col + 0.5) * CELL * world.scale.x,
          world.y + (row + 0.5) * CELL * world.scale.y,
        ],
        match: () => match,
        picked: () => [...selection],
        app,
        races: RACES,
        startMatch: (a: RaceId, b: RaceId, map?: BoardId) => start(a, b, map),
        focus: (col: number, row: number, zoom: number) => focus(col, row, zoom),
      },
    });

  clampCamera();
  resources();
  void prefetch(); // the rest of the art, while the player chooses

  function showEnd() {
    stopMusic();
    const won = match.winner === teamOf(match, YOU);
    const [title, sub] = endText ?? [
      won ? 'Victory' : match.winner === 2 ? 'Draw' : 'Defeat',
      `${Math.floor(match.time)} seconds. ${
        won
          ? coop()
            ? 'Every castle of the other side has fallen.'
            : "The rival's castle has fallen."
          : match.winner === 2
            ? 'Neither side won.'
            : coop()
              ? 'Both your castles have fallen.'
              : 'Your castle has fallen.'
      }`,
    ];
    $('end-title').textContent = title;
    $('end-sub').textContent = sub;
    $('end').hidden = false;
  }

  /** The castles that fell come down (the end screen waits for them); the seconds until it should show. A draw on time shows at once. */
  function fallCastles() {
    let seconds = 0;
    for (const o of [0, 1] as const) {
      const cs = castleSprites[o]!;
      if (match.players[o].castle.hp > 0 || wreck.has(cs)) continue;
      wreck.collapse(cs, cs.children[1] as Sprite, CASTLE_FALL, true, false);
      seconds = CASTLE_FALL + 0.8;
    }
    return seconds;
  }

  /** One tick of the match: the foe's brain (alone), the rules, then what the tick looks like. */
  function advance() {
    for (const ai of ais) ai(match, STEP); // the same computers on both pages online: they read only the match
    const pay = match.payTimer;
    step(match, STEP);
    if (match.payTimer < pay) payDay();
    for (const d of match.deaths) {
      addCorpse(d);
      if (d.boom) booms.push({ at: d.at, r: d.boom, air: !!d.def.air, age: 0 });
    }
    for (const shot of match.shots) {
      effects.push({ shot, age: 0 });
      // A unit that hits several at once faces the first (the main target): its spray shots follow in the same step.
      if (shot.by.kind === 'unit') {
        if (!(shot.multi && strikes.get(shot.by.id)?.at === clock))
          strikes.set(shot.by.id, { at: clock, to: shot.to, melee: shot.melee });
      } else kicks.set(shot.by.kind === 'tower' ? shot.by.id : -1 - shot.by.id, { at: clock, to: shot.to });
    }
    if (sounds) playCues(sounds.collect(match, YOU), soundView());
  }

  /** The part of the field on screen, in cells: sounds are louder the nearer they are to its middle, and lean to the side they come from. */
  function soundView() {
    const cell = CELL * world.scale.x;
    return {
      cx: (window.innerWidth / 2 - world.x) / cell,
      cy: (topBar() + viewH() / 2 - world.y) / cell,
      halfW: window.innerWidth / 2 / cell,
      halfH: viewH() / 2 / cell,
    };
  }

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    clock += dt;
    ageCorpses(dt);
    if (started && match.winner < 0) {
      acc += Math.min(dt, 0.25);
      while (acc >= STEP && match.winner < 0) {
        if (online) {
          if (!online.lock.run(match, advance)) {
            // The rival's commands for this tick have not come: hold, and do not pile up time to race through afterwards.
            acc = Math.min(acc, STEP * 4);
            stalled += dt;
            break;
          }
          stalled = 0;
        } else advance();
        acc -= STEP;
      }
      if (online?.lock.desync && match.winner < 0) {
        endText = ['Out of sync', 'The two games stopped agreeing, so the match was stopped. Reload both pages.'];
        match.winner = 2;
        duel.close();
      }
      refresh();
      if (match.winner >= 0) finale = fallCastles();
    }
    if (finale !== undefined && (finale -= dt) <= 0) {
      finale = undefined;
      showEnd();
    }
    const away = !!online?.lock.away;
    const fallen = started && match.winner < 0 && match.players[YOU]!.out;
    $('wait').hidden = !(fallen || (online && started && match.winner < 0 && (away || stalled > 0.8)));
    if (!$('wait').hidden) {
      const other = coop() ? 'partner' : 'rival';
      const text = fallen
        ? 'Your castle has fallen. Your side fights on: watch it through.'
        : away
          ? `Your ${other} is away. The match goes on; they can rejoin with ${hostCode}.`
          : `Waiting for your ${other}…`;
      if ($('wait').textContent !== text) $('wait').textContent = text;
    }
    resources();
    if (held.size) {
      const go = 640 * dt;
      const [h, v] = [
        (held.has('arrowleft') || held.has('a') ? 1 : 0) - (held.has('arrowright') || held.has('d') ? 1 : 0),
        (held.has('arrowup') || held.has('w') ? 1 : 0) - (held.has('arrowdown') || held.has('s') ? 1 : 0),
      ];
      world.x += h * go;
      world.y += v * go;
      clampCamera();
    }
    if (started) drawLive(dt);
  });
})();
