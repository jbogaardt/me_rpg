// Boots Towercraft: the PixiJS application, the race picker and the DOM controls, and runs the match at a fixed step.
// The rules are in sim/ (Pixi-free); this file only draws a Match and turns clicks into commands.

import { Application, Container, Graphics } from 'pixi.js';
import { TextureStyle } from 'pixi.js';
import { createAi } from './sim/ai';
import { COLS, ROAD_CELLS, ROWS, cellIndex, pointAt } from './sim/board';
import { RACES, RACE_IDS, type RaceId, type TowerDef } from './sim/races';
import { buildTower, canBuild, laneOf, newMatch, sendUnits, step, type Match } from './sim/sim';

const CELL = 40;
const GAP = 1; // cells between the lanes
const BOARD_W = (COLS * 2 + GAP) * CELL;
const BOARD_H = ROWS * CELL;
const STEP = 0.05;
const YOU = 0;
const laneX = (lane: 0 | 1) => lane * (COLS + GAP) * CELL;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ROAD = 0x3a3f4b;
const GROUND = [0x1b2230, 0x1e2634];

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

  const world = new Container();
  const board = new Graphics();
  const live = new Graphics();
  world.addChild(board, live);
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

  function drawBoard() {
    board.clear();
    for (const lane of [0, 1] as const) {
      const x0 = laneX(lane);
      board.roundRect(x0 - 6, -6, COLS * CELL + 12, BOARD_H + 12, 10).fill(0x131925);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const road = ROAD_CELLS.has(cellIndex(c, r));
          board.rect(x0 + c * CELL, r * CELL, CELL, CELL).fill(road ? ROAD : GROUND[(c + r) % 2]!);
        }
      }
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
    for (const t of match.towers) {
      const color = RACES[match.players[t.owner].race].color;
      const cx = laneX(t.owner) + (t.col + 0.5) * CELL;
      const cy = (t.row + 0.5) * CELL;
      const size = t.def.splash > 0 ? 15 : 12;
      live
        .roundRect(cx - size, cy - size, size * 2, size * 2, 5)
        .fill(color)
        .stroke({ color: 0x0e1117, width: 2 });
      if (t.def.splash > 0) live.circle(cx, cy, 5).fill(0x0e1117);
    }
    for (const s of match.shots) {
      const x0 = laneX(s.lane);
      live
        .moveTo(x0 + s.from[0] * CELL, s.from[1] * CELL)
        .lineTo(x0 + s.to[0] * CELL, s.to[1] * CELL)
        .stroke({ color: 0xffb13f, width: 2, alpha: 0.8 });
      if (s.splash > 0)
        live.circle(x0 + s.to[0] * CELL, s.to[1] * CELL, s.splash * CELL).fill({ color: 0xffb13f, alpha: 0.18 });
    }
    for (const u of match.units) {
      const [x, y] = pointAt(u.dist);
      const lane = laneOf(u);
      const cx = laneX(lane) + x * CELL;
      const cy = y * CELL;
      const r = 5 + Math.min(9, Math.sqrt(u.def.hp) / 4);
      live.circle(cx, cy, r).fill(RACES[match.players[u.owner].race].color).stroke({ color: 0x0e1117, width: 2 });
      live.rect(cx - r, cy - r - 6, r * 2, 3).fill(0x0e1117);
      live.rect(cx - r, cy - r - 6, r * 2 * Math.max(0, u.hp / u.def.hp), 3).fill(0x6fd36f);
    }
  }

  function side(id: string, label: string, p: Match['players'][number]) {
    $(id).innerHTML =
      `<span>${label} · ${RACES[p.race].name}</span><b>${Math.floor(p.gold)} gold</b><span>+${10 + p.income}/pay</span><b>${p.lives} lives</b>`;
  }

  const buildButtons: [HTMLButtonElement, TowerDef][] = [];
  const sendButtons: [HTMLButtonElement, { id: string; cost: number }][] = [];

  function makeControls(race: RaceId) {
    $('build').innerHTML = '<span>Build</span>';
    $('send').innerHTML = '<span>Send</span>';
    buildButtons.length = 0;
    sendButtons.length = 0;
    for (const def of RACES[race].towers) {
      const b = document.createElement('button');
      b.innerHTML = `${def.name}<small>${def.cost}g · range ${def.range} · ${def.damage} dmg${def.splash ? ' · splash' : ''}</small>`;
      b.onclick = () => {
        selected = selected === def ? undefined : def;
        refresh();
      };
      $('build').append(b);
      buildButtons.push([b, def]);
    }
    for (const def of RACES[race].units) {
      const b = document.createElement('button');
      b.innerHTML = `${def.count > 1 ? def.count + '× ' : ''}${def.name}<small>${def.cost}g · ${def.hp} hp · +${def.income} pay</small>`;
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
    b.innerHTML = `<b>${race.name}</b><span>${race.blurb}</span>`;
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
    if (started && match.winner < 0) {
      acc += Math.min(ticker.deltaMS / 1000, 0.25);
      while (acc >= STEP && match.winner < 0) {
        acc -= STEP;
        ai(match, STEP);
        step(match, STEP);
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
