// Boots Towercraft: the PixiJS application, the race picker and the DOM controls, and runs the match at a fixed step.
// The rules are in sim/ (Pixi-free); this file only draws a Match and turns clicks into commands.

import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, TextureStyle } from 'pixi.js';
import { createAi } from './sim/ai';
import { COLS, ROWS, headingAt, pointAt } from './sim/board';
import { RACES, RACE_IDS, type RaceId, type TowerDef, type UnitDef } from './sim/races';
import { buildTower, canBuild, laneOf, newMatch, sendUnits, step, type Death, type Match } from './sim/sim';

const CELL = 40;
const GAP = 1; // cells between the lanes
const BOARD_W = (COLS * 2 + GAP) * CELL;
const BOARD_H = ROWS * CELL;
const STEP = 0.05;
const YOU = 0;
const laneX = (lane: 0 | 1) => lane * (COLS + GAP) * CELL;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** How big a unit's sprite is drawn (its 72px frame times this): tougher units are bigger. */
const unitScale = (def: UnitDef) => 1.1 + Math.min(0.7, Math.sqrt(def.hp) / 55);
/** The figure in a frame is about this tall (px), standing on the frame's anchor: where a health bar goes. */
const FIGURE = 32;

// The unit sheets are Wyrmsun's: 72x72 frames, five directions across (up, up-right, right, down-right, down; left is right
// mirrored), and the game's own animation down the rows: 0 standing, 1-4 the walk, 5-8 an attack, 9-11 dying.
const FRAME = 72;
const WALK_ROWS = [1, 2, 0, 3, 4, 0]; // one stride, in poses
const STRIDE = 0.9; // cells walked per stride
const DEATH_ROWS = [9, 10, 11];
const DEATH_FRAME = 0.12; // seconds per death frame
const CORPSE_LIFE = 1.6; // seconds a corpse stays (fading over the last half)
const COLUMN = { up: 0, right: 2, down: 4, left: 2 } as const;

/** A unit that is dying: the sprite plays its death frames where it fell, then fades. */
interface Corpse {
  container: Container;
  sprite: Sprite;
  sheet: string;
  col: number;
  age: number;
}

/** How each race tints its lane's grass: goblins sicklier, dwarves cooler, the Germanic as it is. */
const TINT: Record<RaceId, number> = { swarm: 0xc8d88c, titan: 0xb4c4d8, legion: 0xffffff };

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

  // Every picture a race uses (towercraft/public/art, CREDITS.md): unit portraits whole, towers cut to their first frame.
  const arts = new Set(RACE_IDS.flatMap((r) => [...RACES[r].units, ...RACES[r].towers].map((d) => d.art)));
  const loaded = await Promise.all([...arts].map((name) => Assets.load<Texture>(`art/${name}.png`)));
  const textures = new Map<string, Texture>([...arts].map((name, i) => [name, loaded[i]!]));
  const towerFrames = new Map<string, Texture>();
  const towerTexture = (def: TowerDef) => {
    let t = towerFrames.get(def.art);
    if (!t)
      towerFrames.set(
        def.art,
        (t = new Texture({ source: textures.get(def.art)!.source, frame: new Rectangle(0, 0, 64, 64) })),
      );
    return t;
  };

  const sheets = new Set(RACE_IDS.flatMap((r) => RACES[r].units.map((u) => u.sheet)));
  const sheetTextures = new Map<string, Texture>(
    await Promise.all(
      [...sheets].map(async (name) => [name, await Assets.load<Texture>(`art/units/${name}.png`)] as const),
    ),
  );
  const frames = new Map<string, Texture>();
  /** One 72x72 frame of a unit sheet (cached). */
  const unitFrame = (sheet: string, row: number, col: number) => {
    const key = `${sheet}:${row}:${col}`;
    let t = frames.get(key);
    if (!t)
      frames.set(
        key,
        (t = new Texture({
          source: sheetTextures.get(sheet)!.source,
          frame: new Rectangle(col * FRAME, row * FRAME, FRAME, FRAME),
        })),
      );
    return t;
  };

  // The lane (art/lane.png) is drawn by Me RPG's map pipeline from its LPC terrain atlas (tools/towercraftBoard.ts), so its road
  // has the real blended edges and bends. Both lanes are the same road.
  const laneTexture = await Assets.load<Texture>('art/lane.png');

  const world = new Container();
  const board = new Container();
  const towerLayer = new Container(); // sorted by y so a tall tower hides the one behind it
  towerLayer.sortableChildren = true;
  const corpseLayer = new Container();
  const unitLayer = new Container();
  const live = new Graphics(); // hover, shots, health bars
  world.addChild(board, towerLayer, corpseLayer, unitLayer, live);

  const corpses: Corpse[] = [];
  const addCorpse = (d: Death) => {
    const [x, y] = pointAt(d.dist);
    const heading = headingAt(d.dist);
    const container = new Container();
    const sprite = new Sprite(unitFrame(d.def.sheet, DEATH_ROWS[0]!, COLUMN[heading]));
    sprite.anchor.set(0.5, 0.82);
    sprite.scale.set((heading === 'left' ? -1 : 1) * unitScale(d.def), unitScale(d.def));
    container.addChild(sprite);
    container.position.set(laneX(d.lane) + x * CELL, y * CELL);
    corpseLayer.addChild(container);
    corpses.push({ container, sprite, sheet: d.def.sheet, col: COLUMN[heading], age: 0 });
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
      k.sprite.texture = unitFrame(
        k.sheet,
        DEATH_ROWS[Math.min(DEATH_ROWS.length - 1, Math.floor(k.age / DEATH_FRAME))]!,
        k.col,
      );
      k.container.alpha = Math.min(1, (CORPSE_LIFE - k.age) / (CORPSE_LIFE / 2));
    }
  };

  /** One sprite per tower / unit, kept while it lives. */
  const towerSprites = new Map<number, Container>();
  const unitSprites = new Map<number, Container>();
  const sync = <T extends { id: number }>(
    sprites: Map<number, Container>,
    layer: Container,
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
        layer.addChild(c);
      }
      place(item, c);
    }
    for (const [id, c] of sprites) {
      if (alive.has(id)) continue;
      c.destroy({ children: true });
      sprites.delete(id);
    }
  };
  app.stage.addChild(world);

  let match: Match = newMatch(['legion', 'swarm']);
  let ai = createAi(1, 1);
  let selected: TowerDef | undefined;
  let hover: [number, number] | undefined;
  let acc = 0;
  let started = false;

  function layout() {
    const top = 46;
    const bottom = $('bottom').offsetHeight;
    const scale = Math.min(window.innerWidth / (BOARD_W + 24), (window.innerHeight - top - bottom - 24) / BOARD_H);
    world.scale.set(scale);
    world.position.set(
      (window.innerWidth - BOARD_W * scale) / 2,
      top + (window.innerHeight - top - bottom - BOARD_H * scale) / 2,
    );
  }
  window.addEventListener('resize', layout);

  /** Both lanes, each tinted a little by its owner's race. */
  function drawBoard() {
    for (const c of board.removeChildren()) c.destroy({ children: true });
    for (const lane of [0, 1] as const) {
      const x0 = laneX(lane);
      board.addChild(new Graphics().roundRect(x0 - 6, -6, COLS * CELL + 12, BOARD_H + 12, 10).fill(0x131925));
      const sprite = new Sprite(laneTexture);
      sprite.tint = TINT[match.players[lane].race];
      sprite.position.set(x0, 0);
      sprite.width = COLS * CELL;
      sprite.height = BOARD_H;
      board.addChild(sprite);
    }
  }

  function drawLive() {
    live.clear();
    if (selected && hover && !(hover[0] < 0)) {
      const ok = canBuild(match, YOU, selected, hover[0], hover[1]) === 'ok';
      const cx = laneX(YOU) + (hover[0] + 0.5) * CELL;
      const cy = (hover[1] + 0.5) * CELL;
      live.circle(cx, cy, selected.range * CELL).fill({ color: ok ? 0xffffff : 0xb82024, alpha: 0.1 });
      live.rect(cx - CELL / 2, cy - CELL / 2, CELL, CELL).stroke({ color: ok ? 0xffb13f : 0xb82024, width: 2 });
    }
    sync(
      towerSprites,
      towerLayer,
      match.towers,
      (t) => {
        const c = new Container();
        const color = RACES[match.players[t.owner].race].color;
        c.addChild(new Graphics().ellipse(0, 4, 19, 9).fill({ color, alpha: 0.55 })); // the owner's colour under the tower
        const sprite = new Sprite(towerTexture(t.def));
        sprite.anchor.set(0.5, 0.78);
        sprite.scale.set(0.78);
        c.addChild(sprite);
        return c;
      },
      (t, c) => {
        c.position.set(laneX(t.owner) + (t.col + 0.5) * CELL, (t.row + 0.5) * CELL + 8);
        c.zIndex = t.row;
      },
    );
    for (const s of match.shots) {
      const x0 = laneX(s.lane);
      live
        .moveTo(x0 + s.from[0] * CELL, s.from[1] * CELL)
        .lineTo(x0 + s.to[0] * CELL, s.to[1] * CELL)
        .stroke({ color: 0xffb13f, width: 2, alpha: 0.8 });
      if (s.splash > 0)
        live.circle(x0 + s.to[0] * CELL, s.to[1] * CELL, s.splash * CELL).fill({ color: 0xffb13f, alpha: 0.18 });
    }
    sync(
      unitSprites,
      unitLayer,
      match.units,
      (u) => {
        const c = new Container();
        const color = RACES[match.players[u.owner].race].color;
        c.addChild(new Graphics().ellipse(0, 0, 8 * unitScale(u.def), 4).fill({ color, alpha: 0.6 })); // under the feet
        const body = new Sprite(unitFrame(u.def.sheet, 0, 4));
        body.anchor.set(0.5, 0.82);
        body.scale.set(unitScale(u.def));
        c.addChild(body);
        return c;
      },
      (u, c) => {
        const [x, y] = pointAt(u.dist);
        c.position.set(laneX(laneOf(u)) + x * CELL, y * CELL);
        c.visible = u.dist >= 0; // waiting its turn to step out
        const heading = headingAt(u.dist);
        const body = c.children[1] as Sprite;
        const pose = WALK_ROWS[Math.floor(Math.max(0, u.dist) / (STRIDE / WALK_ROWS.length)) % WALK_ROWS.length]!;
        body.texture = unitFrame(u.def.sheet, pose, COLUMN[heading]);
        body.scale.x = (heading === 'left' ? -1 : 1) * unitScale(u.def);
      },
    );
    for (const u of match.units) {
      if (u.dist < 0) continue;
      const [x, y] = pointAt(u.dist);
      const w = 14 + FIGURE * unitScale(u.def) * 0.4;
      const cx = laneX(laneOf(u)) + x * CELL;
      const top = y * CELL - FIGURE * unitScale(u.def) - 6;
      live.rect(cx - w / 2, top, w, 3).fill(0x0e1117);
      live.rect(cx - w / 2, top, w * Math.max(0, u.hp / u.def.hp), 3).fill(0x6fd36f);
    }
  }

  function side(id: string, label: string, p: Match['players'][number]) {
    $(id).innerHTML =
      `<span>${label} · ${RACES[p.race].name}</span><b>${Math.floor(p.gold)} gold</b><span>+${10 + p.income}/pay</span><b>${p.lives} lives</b>`;
  }

  const towerThumb = (art: string, px: number) =>
    `<i class="thumb" style="width:${px}px;height:${px}px;background-image:url(art/${art}.png);background-size:${px}px auto"></i>`;
  const unitThumb = (art: string, px: number) =>
    `<img class="thumb" src="art/${art}.png" alt="" width="${px}" height="${Math.round((px * 38) / 46)}" />`;

  const buildButtons: [HTMLButtonElement, TowerDef][] = [];
  const sendButtons: [HTMLButtonElement, { id: string; cost: number }][] = [];

  function makeControls(race: RaceId) {
    $('build').innerHTML = '<span>Build</span>';
    $('send').innerHTML = '<span>Send</span>';
    buildButtons.length = 0;
    sendButtons.length = 0;
    for (const def of RACES[race].towers) {
      const b = document.createElement('button');
      b.innerHTML = `${towerThumb(def.art, 36)}<span>${def.name}<small>${def.cost}g · range ${def.range} · ${def.damage} dmg${def.splash ? ' · splash' : ''}</small></span>`;
      b.onclick = () => {
        selected = selected === def ? undefined : def;
        refresh();
      };
      $('build').append(b);
      buildButtons.push([b, def]);
    }
    for (const def of RACES[race].units) {
      const b = document.createElement('button');
      b.innerHTML = `${unitThumb(def.art, 34)}<span>${def.count > 1 ? def.count + '× ' : ''}${def.name}<small>${def.cost}g · ${def.hp} hp · +${def.income} pay</small></span>`;
      b.onclick = () => {
        sendUnits(match, YOU, def.id);
        refresh();
      };
      $('send').append(b);
      sendButtons.push([b, def]);
    }
  }

  function refresh() {
    const gold = match.players[YOU].gold;
    for (const [b, def] of buildButtons) {
      b.disabled = def.cost > gold;
      b.classList.toggle('on', selected === def);
    }
    for (const [b, def] of sendButtons) b.disabled = def.cost > gold;
    $('hint').textContent = selected
      ? `Click a free cell on your side (left) to place a ${selected.name}. Esc to cancel.`
      : '';
  }

  function cellAt(clientX: number, clientY: number): [number, number] | undefined {
    const x = (clientX - world.x) / world.scale.x - laneX(YOU);
    const y = (clientY - world.y) / world.scale.y;
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    return x >= 0 && y >= 0 && col < COLS && row < ROWS ? [col, row] : undefined;
  }

  app.canvas.addEventListener('pointermove', (e) => {
    hover = cellAt(e.clientX, e.clientY);
  });
  app.canvas.addEventListener('pointerleave', () => {
    hover = undefined;
  });
  app.canvas.addEventListener('pointerdown', (e) => {
    const cell = cellAt(e.clientX, e.clientY);
    hover = cell;
    if (!cell || !started) return;
    if (selected && buildTower(match, YOU, selected.id, cell[0], cell[1]) === 'ok' && !e.shiftKey) selected = undefined; // shift keeps the tower for more
    refresh();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      selected = undefined;
      refresh();
    }
  });

  function start(race: RaceId) {
    const rivals = RACE_IDS.filter((r) => r !== race);
    const rival = rivals[Math.floor(Math.random() * rivals.length)]!;
    match = newMatch([race, rival]);
    ai = createAi(1, (Math.random() * 2 ** 31) | 0);
    selected = undefined;
    acc = 0;
    started = true;
    makeControls(race);
    drawBoard(); // the lanes are tinted by race
    $('menu').hidden = true;
    $('end').hidden = true;
    refresh();
    layout(); // the bar's height depends on its buttons
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

  drawBoard();
  makeControls('legion');
  layout();
  side('you', 'You', match.players[0]);
  side('rival', 'Rival', match.players[1]);

  app.ticker.add((ticker) => {
    ageCorpses(ticker.deltaMS / 1000);
    if (started && match.winner < 0) {
      acc += Math.min(ticker.deltaMS / 1000, 0.25);
      while (acc >= STEP && match.winner < 0) {
        acc -= STEP;
        ai(match, STEP);
        step(match, STEP);
        for (const d of match.deaths) addCorpse(d);
      }
      refresh();
      if (match.winner >= 0) {
        $('end-title').textContent = match.winner === YOU ? 'Victory' : match.winner === 2 ? 'Draw' : 'Defeat';
        $('end-sub').textContent =
          `${Math.floor(match.time)} seconds. Lives ${match.players[0].lives} to ${match.players[1].lives}.`;
        $('end').hidden = false;
      }
    }
    side('you', 'You', match.players[0]);
    side('rival', 'Rival', match.players[1]);
    drawLive();
  });
})();
