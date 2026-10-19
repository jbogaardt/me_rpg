// The computer opponent (Pixi-free). It thinks about once a second, with a seeded random source so a match replays: it
// raises its castle as gold and time allow, keeps a few towers where they cover the most road (pushing its build area
// forward as it goes), and trains units with the rest. It is a sparring partner for the prototype, not a clever player.

import { CASTLES, COLS, ROAD_CELLS, ROAD_LENGTH, ROWS, cellIndex, pointAt } from './board';
import { MAX_LEVEL } from './races';
import {
  buildTower,
  canBuild,
  enemy,
  raceOf,
  trainUnit,
  upgradeCastle,
  upgradeCost,
  type Match,
  type Owner,
} from './sim';
import type { TowerDef } from './races';

/** A small seeded random source (mulberry32): same seed, same sequence. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points along the road, half a cell apart: what "covering the road" is counted over. */
const ROAD_SAMPLES: [number, number][] = Array.from({ length: Math.floor(ROAD_LENGTH * 2) }, (_, i) => pointAt(i / 2));

/** How much road a tower of this range would cover from each cell (cached: the road never changes). */
const coverage = new Map<string, number>();
function coverageOf(col: number, row: number, range: number): number {
  const key = `${cellIndex(col, row)}:${range}`;
  let n = coverage.get(key);
  if (n === undefined) {
    n = 0;
    for (const [x, y] of ROAD_SAMPLES) if (Math.hypot(x - col - 0.5, y - row - 0.5) <= range) n++;
    coverage.set(key, n);
  }
  return n;
}

/** The cell `owner` may build this tower on that covers the most road, preferring cells nearer the enemy castle. */
export function bestCell(m: Match, owner: Owner, def: TowerDef): [number, number] | undefined {
  let best: [number, number] | undefined;
  let bestScore = -1;
  const foe = CASTLES[enemy(owner)];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (ROAD_CELLS.has(cellIndex(col, row)) || canBuild(m, owner, def, col, row) !== 'ok') continue;
      const toFoe = Math.hypot(foe[0] - col - 0.5, foe[1] - row - 0.5);
      const score = coverageOf(col, row, def.range) - toFoe * 0.15;
      if (score > bestScore) {
        bestScore = score;
        best = [col, row];
      }
    }
  }
  return best;
}

const THINK_EVERY = 1;

/** The AI for player `owner`: call the returned function every step with the match and the step's length. */
export function createAi(owner: Owner, seed: number): (m: Match, dt: number) => void {
  const random = seeded(seed);
  let timer = 0;
  return (m, dt) => {
    if (m.winner >= 0) return;
    timer += dt;
    if (timer < THINK_EVERY) return;
    timer -= THINK_EVERY;
    const me = m.players[owner];
    const race = raceOf(m, owner);
    const level = me.castle.level;

    // Up a level once the time is right and it can pay, and not at the cost of having no defence at all.
    const cost = upgradeCost(m, owner);
    const towers = m.towers.filter((t) => t.owner === owner).length;
    if (level < MAX_LEVEL && cost !== undefined && me.gold >= cost && m.time > 50 * level && towers >= level + 1) {
      upgradeCastle(m, owner);
      return;
    }

    const wantTowers = towers < 2 + level * 2 && random() < 0.45;
    if (wantTowers) {
      const options = race.towers.filter((t) => t.tier <= level && t.cost <= me.gold);
      const def = options[Math.floor(random() * options.length)];
      const cell = def && bestCell(m, owner, def);
      if (def && cell) {
        buildTower(m, owner, def.id, cell[0], cell[1]);
        return;
      }
    }
    if (me.queue.length >= 3) return;
    const options = race.units.filter((u) => u.tier <= level && u.cost <= me.gold);
    if (!options.length) return;
    // Mostly the best unit it can pay for, now and then a cheaper one.
    const pick = random() < 0.6 ? options[options.length - 1] : options[Math.floor(random() * options.length)];
    if (pick) trainUnit(m, owner, pick.id);
  };
}
