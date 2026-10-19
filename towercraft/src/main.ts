// Boots Towercraft: the PixiJS application, the race picker, the camera (drag to pan, wheel or pinch to zoom) and the DOM
// controls, and runs the match at a fixed step. The rules are in sim/ (Pixi-free); this file only draws a Match and turns
// taps into commands.

import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, TextureStyle } from 'pixi.js';
import { createAi } from './sim/ai';
import { CASTLES, COLS, ROAD_LENGTH, ROWS, headingAt } from './sim/board';
import { MAX_LEVEL, RACES, RACE_IDS, type RaceId, type SheetKind, type TowerDef, type UnitDef } from './sim/races';
import {
  QUEUE_MAX,
  setOrder,
  buildReach,
  buildTower,
  canBuild,
  newMatch,
  step,
  trainUnit,
  unitPos,
  upgradeCastle,
  upgradeCost,
  visibleTo,
  type Death,
  type Match,
  type Owner,
  type Shot,
  type Unit,
} from './sim/sim';

const CELL = 40;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;
const STEP = 0.05;
const YOU: Owner = 0;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** How big a unit's sprite is drawn (its frame times this): walkers scale with their hit points, flyers have their own size. */
const unitScale = (def: UnitDef) => SHEETS[def.kind].scale ?? 1.1 + Math.min(0.7, Math.sqrt(def.hp) / 55);
/** The figure in a frame is about this tall (px), standing on the frame's anchor: where a health bar goes. */
const FIGURE = 32;

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
};
const STRIDE = 0.9; // cells walked per stride
const DEATH_FRAME = 0.12; // seconds per death frame
const CORPSE_LIFE = 1.6; // seconds a corpse stays (fading over the last half)
const COLUMN = { up: 0, right: 2, down: 4, left: 2 } as const;
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
/** How high (px) an air unit is drawn above the ground it flies over. */
const FLIGHT = 26;

/** The sheet column (and whether to mirror it) for a unit heading along (dx, dy), screen coordinates. */
function direction(dx: number, dy: number): { col: number; flip: boolean } {
  const octant = Math.round((Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI / 45); // -2 up .. 2 down, by 45 degrees, right side only
  return { col: [0, 1, 2, 3, 4][octant + 2]!, flip: dx < 0 };
}

/** Which way a unit faces: along the road, or back up it for the player whose castle is at the road's end. */
function facing(owner: Owner, s: number) {
  const h = headingAt(owner === 0 ? s : ROAD_LENGTH - s);
  return owner === 0 ? h : OPPOSITE[h];
}

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
  const names = (pick: (r: (typeof RACES)[RaceId]) => string[]) => [
    ...new Set(RACE_IDS.flatMap((r) => pick(RACES[r]))),
  ];
  const towerTextures = new Map<string, Texture>(
    await Promise.all(
      names((r) => r.towers.map((t) => t.art)).map(async (n) => [n, squareFrame(await load(`art/${n}.png`))] as const),
    ),
  );
  const castleTextures = new Map<string, Texture>(
    await Promise.all(
      names((r) => [r.castle.art]).map(async (n) => [n, squareFrame(await load(`art/${n}.png`))] as const),
    ),
  );
  const sheetTextures = new Map<string, Texture>(
    await Promise.all(
      names((r) => r.units.map((u) => u.sheet)).map(async (n) => [n, await load(`art/units/${n}.png`)] as const),
    ),
  );
  const frames = new Map<string, Texture>();
  /** One frame of a unit sheet (cached): row, and column = direction. */
  const unitFrame = (sheet: string, kind: SheetKind, row: number, col: number) => {
    const key = `${sheet}:${row}:${col}`;
    const size = SHEETS[kind].frame;
    let t = frames.get(key);
    if (!t) frames.set(key, (t = cut(sheetTextures.get(sheet)!, col * size, row * size, size, size)));
    return t;
  };
  // The field (art/lane.png) is drawn by Me RPG's map pipeline from its LPC terrain atlas (tools/towercraftBoard.ts).
  const fieldTexture = await load('art/lane.png');

  // --- The scene -----------------------------------------------------------------------------------------------------
  const world = new Container();
  const field = new Sprite(fieldTexture);
  field.width = BOARD_W;
  field.height = BOARD_H;
  const areaLayer = new Graphics(); // where towers may be built
  const sortLayer = new Container(); // castles, towers and units, sorted by y so what is in front hides what is behind
  sortLayer.sortableChildren = true;
  const corpseLayer = new Container();
  const live = new Graphics(); // hover ring, attacks, health bars
  world.addChild(field, areaLayer, corpseLayer, sortLayer, live);
  app.stage.addChild(world);

  let match: Match = newMatch(['legion', 'swarm']);
  let ai = createAi(1, 1);
  let selected: TowerDef | undefined;
  let hover: [number, number] | undefined;
  let acc = 0;
  let clock = 0;
  let started = false;

  const castleSprites: Container[] = [];
  const buildCastles = () => {
    for (const c of castleSprites) c.destroy({ children: true });
    castleSprites.length = 0;
    for (const o of [0, 1] as const) {
      const c = new Container();
      const color = RACES[match.players[o].race].color;
      c.addChild(new Graphics().ellipse(0, 6, 56, 20).fill({ color, alpha: 0.45 }));
      const sprite = new Sprite(castleTextures.get(RACES[match.players[o].race].castle.art));
      sprite.anchor.set(0.5, 0.78);
      sprite.scale.set(0.9);
      c.addChild(sprite);
      c.position.set(CASTLES[o][0] * CELL, CASTLES[o][1] * CELL);
      c.zIndex = CASTLES[o][1] + 1;
      sortLayer.addChild(c);
      castleSprites.push(c);
    }
  };

  // --- Camera: drag to pan, wheel or pinch to zoom ------------------------------------------------------------------
  const topBar = () => $('top').offsetHeight;
  const bottomBar = () => $('bottom').offsetHeight;
  const viewH = () => window.innerHeight - topBar() - bottomBar();
  const fitZoom = () => Math.min(window.innerWidth / BOARD_W, viewH() / BOARD_H);
  const minZoom = () => Math.min(fitZoom(), ZOOM_MAX);

  function clampCamera() {
    const z = Math.min(ZOOM_MAX, Math.max(minZoom(), world.scale.x));
    world.scale.set(z);
    const w = BOARD_W * z;
    const h = BOARD_H * z;
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
  const home = () => focus(CASTLES[YOU][0] + 3, CASTLES[YOU][1] + 7, Math.max(minZoom(), Math.min(1.1, ZOOM_MAX)));
  window.addEventListener('resize', clampCamera);

  const cellAt = (sx: number, sy: number): [number, number] | undefined => {
    const col = Math.floor((sx - world.x) / world.scale.x / CELL);
    const row = Math.floor((sy - world.y) / world.scale.y / CELL);
    return col >= 0 && row >= 0 && col < COLS && row < ROWS ? [col, row] : undefined;
  };

  const pointers = new Map<number, { x: number; y: number }>();
  let pressStart: { x: number; y: number } | undefined;
  let dragged = false;
  let pinch = 0;
  app.canvas.addEventListener('pointerdown', (e) => {
    app.canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      pressStart = { x: e.clientX, y: e.clientY };
      dragged = false;
    } else {
      dragged = true;
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  });
  app.canvas.addEventListener('pointermove', (e) => {
    hover = e.pointerType === 'mouse' ? cellAt(e.clientX, e.clientY) : undefined;
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const [dx, dy] = [e.clientX - p.x, e.clientY - p.y];
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      if (!dragged && pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > TAP_SLOP)
        dragged = true;
      if (dragged) {
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
    if (wasOne && !dragged && e.type === 'pointerup') tap(e.clientX, e.clientY);
    pinch = 0;
  };
  app.canvas.addEventListener('pointerup', release);
  app.canvas.addEventListener('pointercancel', release);
  app.canvas.addEventListener('pointerleave', () => (hover = undefined));
  app.canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );
  $('cam-home').onclick = home;
  $('cam-fit').onclick = () => focus(COLS / 2, ROWS / 2, minZoom());

  function tap(sx: number, sy: number) {
    const cell = cellAt(sx, sy);
    if (!cell || !started || !selected) return;
    if (buildTower(match, YOU, selected.id, cell[0], cell[1]) === 'ok') {
      // Keep the tower selected while the player can pay for another (a row of towers is the usual use).
      if (match.players[YOU].gold < selected.cost) selected = undefined;
      refresh();
    }
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      selected = undefined;
      refresh();
    }
  });

  // --- Drawing a match ----------------------------------------------------------------------------------------------
  /** One sprite per tower / unit, kept while it lives. */
  const towerSprites = new Map<number, Container>();
  const unitSprites = new Map<number, Container>();
  const sync = <T extends { id: number }>(
    sprites: Map<number, Container>,
    items: T[],
    make: (item: T) => Container,
    place: (item: T, c: Container) => void,
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
      c.destroy({ children: true });
      sprites.delete(id);
    }
  };

  interface Corpse {
    container: Container;
    sprite: Sprite;
    def: UnitDef;
    col: number;
    age: number;
  }
  const corpses: Corpse[] = [];
  /** The sheet column and mirroring for a unit: along the road for walkers, along the flight line for flyers. */
  const heading = (owner: Owner, s: number, air: boolean) =>
    air
      ? direction(
          (CASTLES[owner === 0 ? 1 : 0][0] - CASTLES[owner][0]) * 1,
          (CASTLES[owner === 0 ? 1 : 0][1] - CASTLES[owner][1]) * 1,
        )
      : (() => {
          const h = facing(owner, s);
          return { col: COLUMN[h], flip: h === 'left' };
        })();
  const addCorpse = (d: Death) => {
    const dir = heading(d.owner, d.s, !!d.def.air);
    const sheet = SHEETS[d.def.kind];
    const container = new Container();
    const sprite = new Sprite(unitFrame(d.def.sheet, d.def.kind, sheet.death[0]!, dir.col));
    sprite.anchor.set(0.5, 0.82);
    sprite.scale.set((dir.flip ? -1 : 1) * unitScale(d.def), unitScale(d.def));
    container.addChild(sprite);
    container.position.set(d.at[0] * CELL, d.at[1] * CELL - (d.def.air ? FLIGHT : 0));
    corpseLayer.addChild(container);
    corpses.push({ container, sprite, def: d.def, col: dir.col, age: 0 });
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
  const EFFECT_LIFE = 0.18;
  const lastS = new Map<number, number>();

  const bar = (x: number, y: number, w: number, frac: number, color: number) => {
    live.rect(x - w / 2, y, w, 4).fill(0x0e1117);
    live.rect(x - w / 2 + 0.5, y + 0.5, (w - 1) * Math.max(0, Math.min(1, frac)), 3).fill(color);
  };

  function drawLive(dt: number) {
    live.clear();
    areaLayer.clear();

    // Where a tower of the selected kind can go (and, with the mouse, its range at the cell under it).
    if (selected && started) {
      for (let row = 0; row < ROWS; row++)
        for (let col = 0; col < COLS; col++)
          if (canBuild(match, YOU, selected, col, row) === 'ok')
            areaLayer.rect(col * CELL, row * CELL, CELL, CELL).fill({ color: 0x6fd36f, alpha: 0.2 });
      if (hover) {
        const ok = canBuild(match, YOU, selected, hover[0], hover[1]) === 'ok';
        const cx = (hover[0] + 0.5) * CELL;
        const cy = (hover[1] + 0.5) * CELL;
        live.circle(cx, cy, selected.range * CELL).fill({ color: ok ? 0xffffff : 0xb82024, alpha: 0.12 });
        live.rect(cx - CELL / 2, cy - CELL / 2, CELL, CELL).stroke({ color: ok ? 0xffb13f : 0xb82024, width: 2 });
      }
    }
    if (started) {
      const [cx, cy] = CASTLES[YOU];
      areaLayer
        .circle(cx * CELL, cy * CELL, buildReach(match, YOU) * CELL)
        .stroke({ color: 0xffb13f, width: 2, alpha: selected ? 0.5 : 0.2 });
    }

    // Support towers show what they cover: an aura (green heal, orange power) and a detector (violet).
    for (const t of match.towers) {
      const cx = (t.col + 0.5) * CELL;
      const cy = (t.row + 0.5) * CELL;
      const mine = t.owner === YOU;
      if (t.def.aura)
        areaLayer
          .circle(cx, cy, t.def.aura.radius * CELL)
          .stroke({ color: t.def.aura.kind === 'heal' ? 0x6fd36f : 0xffb13f, width: 1.5, alpha: mine ? 0.45 : 0.25 });
      if (t.def.detect)
        areaLayer.circle(cx, cy, t.def.detect * CELL).stroke({ color: 0xb48cff, width: 1.5, alpha: mine ? 0.45 : 0.2 });
    }
    if (selected && hover) {
      const cx = (hover[0] + 0.5) * CELL;
      const cy = (hover[1] + 0.5) * CELL;
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
        const color = RACES[match.players[t.owner].race].color;
        c.addChild(new Graphics().ellipse(0, 4, 19, 9).fill({ color, alpha: 0.55 })); // the owner's colour under the tower
        const tex = towerTextures.get(t.def.art)!;
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5, 0.78);
        sprite.scale.set(50 / tex.width); // a tower is about a cell and a quarter wide, whatever its sheet
        c.addChild(sprite);
        return c;
      },
      (t, c) => {
        c.position.set((t.col + 0.5) * CELL, (t.row + 0.5) * CELL + 8);
        c.zIndex = t.row + 0.5;
      },
    );
    sync(
      unitSprites,
      match.units,
      (u) => {
        const c = new Container();
        const color = RACES[match.players[u.owner].race].color;
        c.addChild(new Graphics().ellipse(0, 0, 8 * unitScale(u.def), 4).fill({ color, alpha: 0.6 })); // under the feet (on the ground, below a flyer)
        const body = new Sprite(unitFrame(u.def.sheet, u.def.kind, 0, 4));
        body.anchor.set(0.5, 0.82);
        body.scale.set(unitScale(u.def));
        c.addChild(body);
        return c;
      },
      (u: Unit, c) => {
        const [x, y] = unitPos(u);
        c.position.set(x * CELL, y * CELL);
        c.zIndex = u.def.air ? 1000 + y : y; // flyers pass over everything
        const dir = heading(u.owner, u.s, !!u.def.air);
        const sheet = SHEETS[u.def.kind];
        const moved = lastS.get(u.id) !== u.s;
        lastS.set(u.id, u.s);
        const body = c.children[1] as Sprite;
        const pose = moved
          ? sheet.walk[Math.floor(u.s / (STRIDE / sheet.walk.length)) % sheet.walk.length]!
          : sheet.attack[Math.floor(clock * 8) % sheet.attack.length]!;
        body.texture = unitFrame(u.def.sheet, u.def.kind, pose, dir.col);
        body.scale.x = (dir.flip ? -1 : 1) * unitScale(u.def);
        body.y = u.def.air ? -FLIGHT : 0;
        // A cloaked unit is faint to its own side and invisible to the other until a detector finds it; poison tints green.
        const seen = visibleTo(match, u, YOU);
        c.visible = seen;
        body.alpha = u.def.cloak ? (u.owner === YOU ? 0.5 : 0.75) : 1;
        body.tint = u.dot ? 0x9be37a : 0xffffff;
      },
    );

    // Health bars: castles always, the rest once hurt.
    for (const o of [0, 1] as const) {
      const c = match.players[o].castle;
      bar(CASTLES[o][0] * CELL, CASTLES[o][1] * CELL - 78, 84, c.hp / c.maxHp, o === YOU ? 0x6fd36f : 0xe0777b);
    }
    for (const t of match.towers)
      if (t.hp < t.def.hp) bar((t.col + 0.5) * CELL, (t.row + 0.5) * CELL - 34, 30, t.hp / t.def.hp, 0xffb13f);
    for (const u of match.units) {
      if (u.hp >= u.def.hp || !visibleTo(match, u, YOU)) continue;
      const [x, y] = unitPos(u);
      bar(
        x * CELL,
        y * CELL - FIGURE * unitScale(u.def) - 6 - (u.def.air ? FLIGHT : 0),
        14 + FIGURE * unitScale(u.def) * 0.4,
        u.hp / u.def.hp,
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
      const a = 1 - e.age / EFFECT_LIFE;
      const [x0, y0, x1, y1] = [e.shot.from[0] * CELL, e.shot.from[1] * CELL, e.shot.to[0] * CELL, e.shot.to[1] * CELL];
      if (e.shot.melee) live.circle(x1, y1 - 12, 7).fill({ color: 0xffffff, alpha: 0.5 * a });
      else
        live
          .moveTo(x0, y0 - 12)
          .lineTo(x1, y1 - 12)
          .stroke({ color: 0xffb13f, width: 2, alpha: 0.9 * a });
      if (e.shot.splash > 0) live.circle(x1, y1, e.shot.splash * CELL).fill({ color: 0xffb13f, alpha: 0.2 * a });
    }
  }

  // --- The page: top bar, controls, race picker ---------------------------------------------------------------------
  const side = (id: string, label: string, o: Owner) => {
    const p = match.players[o];
    $(id).innerHTML =
      `<span>${label} · ${RACES[p.race].name}</span><b>${Math.floor(p.gold)} gold</b>` +
      `<span>castle ${p.castle.level} · ${Math.max(0, Math.ceil(p.castle.hp))}/${p.castle.maxHp}</span>`;
  };

  const towerThumb = (art: string, px: number) =>
    `<i class="thumb" style="width:${px}px;height:${px}px;background-image:url(art/${art}.png);background-size:${px}px auto"></i>`;
  const unitThumb = (art: string, px: number) =>
    `<img class="thumb" src="art/${art}.png" alt="" width="${px}" height="${Math.round((px * 38) / 46)}" />`;

  /** What a tower is for, in a few words (the button's small print and its tooltip). */
  const towerTags = (d: TowerDef) => {
    const tags: string[] = [];
    if (d.damage > 0) {
      tags.push(d.hits === 'both' ? 'ground + air' : `${d.hits} only`, `range ${d.range}`, `${d.damage} dmg`);
      if (d.splash) tags.push(`area ${d.splash}`);
      if (d.dot) tags.push(`poison ${d.dot.dps}/s`);
    }
    if (d.aura)
      tags.push(
        d.aura.kind === 'heal'
          ? `heals ${d.aura.amount}/s, ${d.aura.radius} around`
          : `+${Math.round(d.aura.amount * 100)}% damage, ${d.aura.radius} around`,
      );
    if (d.detect) tags.push(`sees cloaked, ${d.detect} around`);
    if (d.reach) tags.push(`build reach ${d.reach}`);
    return tags.join(' · ');
  };
  const unitTags = (d: UnitDef) =>
    [
      `${d.hp} hp`,
      `${d.damage} dmg`,
      d.range > 1.5 ? `range ${d.range}` : '',
      d.air ? 'flies' : '',
      d.cloak ? 'cloaked' : '',
      d.hitsAir ? 'hits air' : '',
    ]
      .filter(Boolean)
      .join(' · ');

  const trainButtons: [HTMLButtonElement, UnitDef][] = [];
  const buildButtons: [HTMLButtonElement, TowerDef][] = [];
  let upgradeButton: HTMLButtonElement;
  const orderButtons: [HTMLButtonElement, 'towers' | 'units'][] = [];

  function makeControls(race: RaceId) {
    $('train').innerHTML = '<span>Train</span>';
    $('castle').innerHTML = '';
    $('build').innerHTML = '<span>Build</span>';
    trainButtons.length = 0;
    buildButtons.length = 0;
    for (const def of RACES[race].units) {
      const b = document.createElement('button');
      b.innerHTML = `${unitThumb(def.art, 34)}<span>${def.count > 1 ? def.count + '× ' : ''}${def.name}<small>${def.cost}g · ${def.train}s · ${unitTags(def)}</small></span>`;
      b.title = unitTags(def);
      b.onclick = () => {
        trainUnit(match, YOU, def.id);
        refresh();
      };
      $('train').append(b);
      trainButtons.push([b, def]);
    }
    upgradeButton = document.createElement('button');
    upgradeButton.onclick = () => {
      upgradeCastle(match, YOU);
      refresh();
    };
    $('castle').append(upgradeButton);
    orderButtons.length = 0;
    for (const what of ['towers', 'units'] as const) {
      const b = document.createElement('button');
      b.onclick = () => {
        const o = match.players[YOU].orders;
        setOrder(match, YOU, what, o[what] === 'attack' ? 'bypass' : 'attack');
        refresh();
      };
      $('castle').append(b);
      orderButtons.push([b, what]);
    }
    for (const def of RACES[race].towers) {
      const b = document.createElement('button');
      b.innerHTML = `${towerThumb(def.art, 36)}<span>${def.name}<small>${def.cost}g · ${towerTags(def)}</small></span>`;
      b.title = towerTags(def);
      b.onclick = () => {
        selected = selected === def ? undefined : def;
        refresh();
      };
      $('build').append(b);
      buildButtons.push([b, def]);
    }
  }

  function refresh() {
    const me = match.players[YOU];
    const { level } = me.castle;
    const full = me.queue.length >= QUEUE_MAX;
    for (const [b, def] of trainButtons) {
      b.disabled = def.tier > level || def.cost > me.gold || full;
      b.title = def.tier > level ? `Needs castle level ${def.tier}` : full ? 'The queue is full' : unitTags(def);
    }
    for (const [b, def] of buildButtons) {
      b.disabled = def.tier > level || def.cost > me.gold;
      b.title = def.tier > level ? `Needs castle level ${def.tier}` : towerTags(def);
      b.classList.toggle('on', selected === def);
    }
    const cost = upgradeCost(match, YOU);
    if (level >= MAX_LEVEL || cost === undefined) {
      upgradeButton.disabled = true;
      upgradeButton.innerHTML = `<span>Castle at its highest<small>level ${level}</small></span>`;
    } else {
      upgradeButton.disabled = cost > me.gold;
      const next = RACES[me.race].castle.reach[level]!;
      upgradeButton.innerHTML = `<span>Upgrade castle to ${level + 1}<small>${cost}g · build reach ${next} · tier ${level + 1} units and towers</small></span>`;
    }
    for (const [b, what] of orderButtons) {
      const attack = me.orders[what] === 'attack';
      const label = what === 'towers' ? ['Attack towers', 'Walk past towers'] : ['Fight units', 'Walk past units'];
      b.innerHTML = `<span>${attack ? label[0] : label[1]}<small>all your units · tap to ${attack ? 'walk past' : 'attack'}</small></span>`;
      b.classList.toggle('on', !attack);
    }
    const queue = me.queue.map((q) => q.def.name).join(', ');
    $('queue').textContent = queue ? `Training: ${queue}` : '';
    $('hint').textContent = selected
      ? `Tap a green cell to build a ${selected.name}. Esc to cancel.`
      : level < MAX_LEVEL && !started
        ? ''
        : '';
  }

  function start(race: RaceId, chosen?: RaceId) {
    const rivals = RACE_IDS.filter((r) => r !== race);
    const rival = chosen ?? rivals[Math.floor(Math.random() * rivals.length)]!;
    match = newMatch([race, rival]);
    ai = createAi(1, (Math.random() * 2 ** 31) | 0);
    selected = undefined;
    acc = 0;
    started = true;
    for (const c of [...towerSprites.values(), ...unitSprites.values()]) c.destroy({ children: true });
    towerSprites.clear();
    unitSprites.clear();
    lastS.clear();
    effects.length = 0;
    buildCastles();
    makeControls(race);
    $('menu').hidden = true;
    $('end').hidden = true;
    refresh();
    home();
  }

  for (const id of RACE_IDS) {
    const race = RACES[id];
    const b = document.createElement('button');
    b.className = 'race';
    b.style.setProperty('--c', '#' + race.color.toString(16).padStart(6, '0'));
    b.innerHTML = `<b>${race.name}</b><span>${race.blurb}</span><div class="look">${race.units.map((u) => unitThumb(u.art, 44)).join('')}${race.towers.map((t) => towerThumb(t.art, 44)).join('')}</div>`;
    b.onclick = () => start(id);
    $('races').append(b);
  }
  $('again').onclick = () => {
    started = false;
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
        app,
        races: RACES,
        startMatch: (a: RaceId, b: RaceId) => start(a, b),
        focus: (col: number, row: number, zoom: number) => focus(col, row, zoom),
      },
    });

  buildCastles();
  makeControls('legion');
  refresh();
  clampCamera();
  focus(COLS / 2, ROWS / 2, minZoom());
  side('you', 'You', 0);
  side('rival', 'Rival', 1);

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    clock += dt;
    ageCorpses(dt);
    if (started && match.winner < 0) {
      acc += Math.min(dt, 0.25);
      while (acc >= STEP && match.winner < 0) {
        acc -= STEP;
        ai(match, STEP);
        step(match, STEP);
        for (const d of match.deaths) addCorpse(d);
        for (const shot of match.shots) effects.push({ shot, age: 0 });
      }
      refresh();
      if (match.winner >= 0) {
        $('end-title').textContent = match.winner === YOU ? 'Victory' : match.winner === 2 ? 'Draw' : 'Defeat';
        $('end-sub').textContent = `${Math.floor(match.time)} seconds. ${
          match.winner === YOU
            ? "The rival's castle has fallen."
            : match.winner === 2
              ? 'Neither castle fell.'
              : 'Your castle has fallen.'
        }`;
        $('end').hidden = false;
      }
    }
    side('you', 'You', 0);
    side('rival', 'Rival', 1);
    drawLive(dt);
  });
})();
