// Plays Towercraft's co-op maps (three or four seats, two sides) with a computer on every seat, headless, to see how fair a map is
// and how long it lasts: the lone computer of a two-against-one map earns `Board.pace` times the castle's pay, and this is how that
// number is found (the side that is two computers wins too often at 1, the lone one too often at 3). A tool, not part of the game.
//
//   npm run towercraft:coop -- twinfords --n 24                 win rate and length on one map
//   npm run towercraft:coop -- delta --n 24 --pace 1.4          the lone seat's pace overridden (what-if)
//   npm run towercraft:coop                                      every co-op map
//
// Races rotate through the three, the side a race plays alternates with the seed, and the same arguments give the same matches.

import { pathToFileURL } from 'node:url';
import { createAi } from '../towercraft/src/sim/ai';
import { BOARDS, boardIdsFor } from '../towercraft/src/sim/board';
import { RACE_IDS } from '../towercraft/src/sim/races';
import { newMatch, step } from '../towercraft/src/sim/sim';

export interface CoopResult {
  map: string;
  /** The winning side (0 or 1), 2 a draw. */
  winner: number;
  seconds: number;
}

/** One match of computers on every seat of a map: `pace` (when given) replaces the pace of the seats that stand alone on their side. */
export function playCoop(map: string, seed: number, pace?: number): CoopResult {
  const board = BOARDS[map];
  if (!board || board.seats < 3)
    throw new Error(`"${map}" is not a co-op map (known: ${[...boardIdsFor(3), ...boardIdsFor(4)].join(', ')})`);
  const races = board.teams.map((_, i) => RACE_IDS[(seed + i) % RACE_IDS.length]);
  const alone = board.teams.map((t) => board.teams.filter((u) => u === t).length === 1);
  const m = newMatch(
    races,
    board,
    undefined,
    board.pace.map((p, i) => (pace !== undefined && alone[i] ? pace : p)),
  );
  const ais = races.map((_, i) => createAi(i, seed * 10 + i + 1));
  while (m.winner < 0) {
    for (const ai of ais) ai(m, 0.05);
    step(m, 0.05);
  }
  return { map, winner: m.winner, seconds: m.time };
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (name: string) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined);
  const n = Number(flag('--n') ?? 12);
  const pace = flag('--pace') === undefined ? undefined : Number(flag('--pace'));
  const named = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
  const maps = named.length ? named : [...boardIdsFor(3), ...boardIdsFor(4)];
  for (const map of maps) {
    const results = Array.from({ length: n }, (_, k) => playCoop(map, k + 1, pace));
    const first = results.filter((r) => r.winner === 0).length;
    const decided = results.filter((r) => r.winner < 2).length;
    const median = [...results].sort((a, b) => a.seconds - b.seconds)[Math.floor(n / 2)].seconds;
    const b = BOARDS[map];
    console.log(
      `${map.padEnd(10)} ${b.seats} seats, pace ${pace ?? b.pace.at(-1) ?? 1}: side 0 (seats ${b.teams.flatMap((t, i) => (t === 0 ? [i] : [])).join(',')}) wins ${first}/${decided}, median ${(median / 60).toFixed(1)} min`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
