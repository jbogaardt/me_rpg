// The computer opponent (Pixi-free). It thinks about once a second, with a seeded random source so a match replays:
// early on it leans toward towers (it must survive the first sends), later it sends more, and it puts each tower on
// the free cell that covers the most road. It is a sparring partner for the prototype, not a clever player.

import { RACES, type TowerDef } from './races';
import { COLS, pointAt, ROAD_CELLS, ROAD_LENGTH, ROWS, cellIndex } from './board';
import { buildTower, sendUnits, towerAt, type Match } from './sim';

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

/** The free cell of `owner`'s lane from which a tower of this kind covers the most road, if any is free. */
export function bestCell(m: Match, owner: 0 | 1, def: TowerDef): [number, number] | undefined {
  let best: [number, number] | undefined;
  let bestScore = -1;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (ROAD_CELLS.has(cellIndex(col, row)) || towerAt(m, owner, col, row)) continue;
      let score = 0;
      for (const [x, y] of ROAD_SAMPLES) if (Math.hypot(x - col - 0.5, y - row - 0.5) <= def.range) score++;
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
export function createAi(owner: 0 | 1, seed: number): (m: Match, dt: number) => void {
  const random = seeded(seed);
  let timer = 0;
  return (m, dt) => {
    if (m.winner >= 0) return;
    timer += dt;
    if (timer < THINK_EVERY) return;
    timer -= THINK_EVERY;
    const me = m.players[owner];
    const race = RACES[me.race];
    const towers = m.towers.filter((t) => t.owner === owner).length;
    const wantTower = random() < (towers < 2 + m.time / 45 ? 0.75 : 0.35);
    if (wantTower) {
      const options = race.towers.filter((t) => t.cost <= me.gold);
      const def = options[Math.floor(random() * options.length)];
      const cell = def && bestCell(m, owner, def);
      if (def && cell) buildTower(m, owner, def.id, cell[0], cell[1]);
      return;
    }
    const options = race.units.filter((u) => u.cost <= me.gold);
    if (!options.length) return;
    // Mostly the biggest wave it can pay for, now and then a cheaper one.
    const pick = random() < 0.6 ? options[options.length - 1] : options[Math.floor(random() * options.length)];
    if (pick) sendUnits(m, owner, pick.id);
  };
}
