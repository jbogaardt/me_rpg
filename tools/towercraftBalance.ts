// Plays seeded AI-against-AI Towercraft matches headless and prints how fair the races are: the real measurement behind the
// numbers in towercraft/src/sim/races.ts and the AI in ai.ts. Run `npm run towercraft:balance [-- N [seedBase]]`: N matches per
// unordered pairing of races (default 40, mirrors included; the sides alternate so side bias shows), a 0.05 s step.
// A match is decisive when a castle falls before TIME_LIMIT; a time-limit result is a draw (a stalemate), whoever was ahead.
// Deterministic: the same arguments print the same table. Player 0 is the castle at the top, player 1 the one at the bottom.

import { spawn } from 'node:child_process';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createAi } from '../towercraft/src/sim/ai';
import { RACE_IDS, type RaceId } from '../towercraft/src/sim/races';
import { TIME_LIMIT, newMatch, step } from '../towercraft/src/sim/sim';

export interface Result {
  top: RaceId;
  bottom: RaceId;
  /** 0 or 1 the winner's side, -1 a stalemate at the time limit (or a mutual kill). */
  winner: -1 | 0 | 1;
  time: number;
  /** What each side (top, bottom) trained and built, by unit or tower id, for checking nothing dominates. */
  made: [Record<string, number>, Record<string, number>];
}

export function playMatch(top: RaceId, bottom: RaceId, seed: number): Result {
  const m = newMatch([top, bottom]);
  const ai = [createAi(0, seed * 2 + 1), createAi(1, seed * 2 + 2)] as const;
  const made: Result['made'] = [{}, {}];
  const seen = new Set<number>();
  const note = (side: 0 | 1, id: string) => {
    made[side][id] = (made[side][id] ?? 0) + 1;
  };
  while (m.winner < 0) {
    ai[0](m, 0.05);
    ai[1](m, 0.05);
    step(m, 0.05);
    for (const u of m.units)
      if (!seen.has(u.id)) {
        seen.add(u.id);
        note(u.owner, u.def.id);
      }
    for (const t of m.towers)
      if (!seen.has(t.id)) {
        seen.add(t.id);
        note(t.owner, t.def.id);
      }
  }
  const decisive = m.time < TIME_LIMIT && (m.winner === 0 || m.winner === 1);
  return { top, bottom, winner: decisive ? (m.winner as 0 | 1) : -1, time: m.time, made };
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : '-');
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const mins = (s: number) => (s / 60).toFixed(1);
const winnerOf = (r: Result) => (r.winner === 0 ? r.top : r.bottom);

type Job = [RaceId, RaceId, number];

/** Play the jobs in a few child processes (a job's result depends only on its own seed, so the split changes nothing). */
async function playAll(jobs: Job[]): Promise<Result[]> {
  const procs = Math.max(1, Math.min(os.availableParallelism(), 8, jobs.length));
  const out = new Array<Result>(jobs.length);
  await Promise.all(
    Array.from({ length: procs }, (_, t) => {
      const mine = jobs.map((job, i) => [i, job] as const).filter(([i]) => i % procs === t);
      return new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [...process.execArgv, process.argv[1], '--jobs', JSON.stringify(mine)], {
          stdio: ['ignore', 'pipe', 'inherit'],
        });
        let text = '';
        child.stdout.on('data', (d: Buffer) => (text += d.toString()));
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code !== 0) return reject(new Error(`balance worker failed (${code})`));
          for (const [i, r] of JSON.parse(text) as [number, Result][]) out[i] = r;
          resolve();
        });
      });
    }),
  );
  return out;
}

async function main() {
  const n = Number(process.argv[2] ?? 40);
  const base = Number(process.argv[3] ?? 1);
  const started = Date.now();
  let seed = base * 100_000;
  const jobs: Job[] = [];
  for (let i = 0; i < RACE_IDS.length; i++)
    for (let j = i; j < RACE_IDS.length; j++)
      for (let k = 0; k < n; k++) {
        const [a, b] = [RACE_IDS[i], RACE_IDS[j]];
        jobs.push(k % 2 === 0 ? [a, b, seed++] : [b, a, seed++]);
      }
  const results = await playAll(jobs);

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\n${results.length} matches, ${n} per pairing, seeds from ${base * 100_000} (${secs} s)\n`);
  console.log(
    'top (player 0) vs bottom (player 1): top wins / bottom wins / draws, top share of decisive, decisive length',
  );
  for (const a of RACE_IDS)
    for (const b of RACE_IDS) {
      const rs = results.filter((r) => r.top === a && r.bottom === b);
      if (!rs.length) continue;
      const [t, o, d] = [0, 1, -1].map((w) => rs.filter((r) => r.winner === w).length) as [number, number, number];
      const len = rs.filter((r) => r.winner >= 0).map((r) => r.time);
      console.log(
        `  ${a.padEnd(7)} vs ${b.padEnd(7)} ${String(t).padStart(3)} / ${String(o).padStart(3)} / ${String(d).padStart(3)}   top ${pct(t, t + o).padStart(4)}   median ${mins(median(len))} min, mean ${mins(mean(len))} min`,
      );
    }

  console.log('\nunordered pairing: win rate of the first race over decisive matches');
  for (let i = 0; i < RACE_IDS.length; i++)
    for (let j = i + 1; j < RACE_IDS.length; j++) {
      const [a, b] = [RACE_IDS[i], RACE_IDS[j]];
      const rs = results.filter((r) => (r.top === a && r.bottom === b) || (r.top === b && r.bottom === a));
      const wins = rs.filter((r) => r.winner >= 0 && winnerOf(r) === a).length;
      const losses = rs.filter((r) => r.winner >= 0 && winnerOf(r) === b).length;
      console.log(
        `  ${a} vs ${b}: ${pct(wins, wins + losses)} (${wins}-${losses}, ${rs.length - wins - losses} draws)`,
      );
    }
  for (const a of RACE_IDS) {
    const rs = results.filter((r) => r.top === a && r.bottom === a);
    const [t, o] = [0, 1].map((w) => rs.filter((r) => r.winner === w).length) as [number, number];
    console.log(`  ${a} mirror: top wins ${pct(t, t + o)} (${t}-${o}, ${rs.length - t - o} draws)`);
  }

  console.log('\nper race, against the other races: win rate of decisive matches / of all matches');
  for (const a of RACE_IDS) {
    let w = 0;
    let l = 0;
    let all = 0;
    for (const r of results) {
      if (r.top === r.bottom || (r.top !== a && r.bottom !== a)) continue;
      all++;
      if (r.winner < 0) continue;
      if (winnerOf(r) === a) w++;
      else l++;
    }
    console.log(
      `  ${a.padEnd(7)} ${pct(w, w + l).padStart(4)} / ${pct(w, all).padStart(4)} (${w}-${l}, ${all - w - l} draws)`,
    );
  }

  const decisive = results.filter((r) => r.winner >= 0);
  const lens = decisive.map((r) => r.time);
  console.log(
    `\ndecisive ${pct(decisive.length, results.length)}; decisive length: median ${mins(median(lens))} min, mean ${mins(mean(lens))} min`,
  );

  console.log(
    "\nwhat the AI made per side-game of the race (units trained, towers built), and the race's win rate in the",
  );
  console.log(
    'games where it made more of that than its average (a unit or tower far above 50% there would be dominant)',
  );
  for (const a of RACE_IDS) {
    // Every side that played this race, with what it made and whether it won (a decisive game only).
    const sides = results.flatMap((r) =>
      ([0, 1] as const)
        .filter((o) => (o === 0 ? r.top : r.bottom) === a && r.winner >= 0)
        .map((o) => ({ made: r.made[o], won: r.winner === o })),
    );
    const ids = [...new Set(sides.flatMap((x) => Object.keys(x.made)))];
    const line = ids.map((id) => {
      const mean = sides.reduce((c, x) => c + (x.made[id] ?? 0), 0) / sides.length;
      const many = sides.filter((x) => (x.made[id] ?? 0) > mean);
      return `${id} ${mean.toFixed(1)} (${pct(many.filter((x) => x.won).length, many.length)})`;
    });
    console.log(`  ${a.padEnd(7)} ${line.join(', ')}`);
  }
}

const jobsArg = process.argv.indexOf('--jobs');
if (jobsArg > 0) {
  const mine = JSON.parse(process.argv[jobsArg + 1]) as [number, Job][];
  process.stdout.write(JSON.stringify(mine.map(([i, [a, b, seed]]) => [i, playMatch(a, b, seed)])));
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
