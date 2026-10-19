// The Towercraft balance lab: plays seeded AI-against-AI matches headless, as fast as the machine allows (no renderer, no clock:
// a match is a loop of `step(m, 0.05)`), over a matrix of maps x races x strategies, and reports who wins. A tool for finding
// game balance, not part of the game. Run `npm run towercraft:lab -- --help` for the options; `towercraftBalance.ts` is the quick
// default-map report and shares `playMatch`.
//
//   npm run towercraft:lab -- --n 20 --maps all --strategies rush,turtle,boom --out lab.csv
//   npm run towercraft:lab -- --set swarm.units.glider.hp=*1.2 --set titan.castle.hp=-10%     (what-if: no source edit)
//
// Deterministic: the same arguments give the same matches. An "entrant" is a race plus a strategy (`STRATEGIES` in ai.ts,
// `random` = the AI's seeded style, or one you `--define`); every pair of entrants plays N matches, the sides alternating.
// The what-if overrides change `RACES` data only (unit, tower and castle numbers); sim constants (START_GOLD, ...) are edited in source.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createAi, STRATEGIES, type Style } from '../towercraft/src/sim/ai';
import { BOARDS } from '../towercraft/src/sim/board';
import { MAPS as BALANCE_MAPS } from '../towercraft/src/sim/maps';

/** Every duel map the lab can play: the symmetric balance maps and the game's own (asymmetric) ones. The co-op maps (more than two seats) are for `towercraftCoop.ts`. */
const MAPS = { ...BALANCE_MAPS, ...Object.fromEntries(Object.entries(BOARDS).filter(([, b]) => b.seats === 2)) };
const MAP_IDS = Object.keys(MAPS);
import { RACES, RACE_IDS, type RaceId } from '../towercraft/src/sim/races';
import { TIME_LIMIT, newMatch, step } from '../towercraft/src/sim/sim';

// --- One match -----------------------------------------------------------------------------------------------------------------------

/** One side: a race and the name of the plan it plays (`random`: the AI's own style drawn from the seed). */
export interface Entrant {
  race: RaceId;
  plan: string;
}

export interface Job {
  map: string;
  top: Entrant;
  bottom: Entrant;
  seed: number;
}

export interface Result extends Job {
  /** 0 or 1 the winner's side, -1 a stalemate at the time limit (or a mutual kill). */
  winner: -1 | 0 | 1;
  time: number;
  /** Castle hit points left, as a share of the maximum, top then bottom: how close a win was. */
  hp: [number, number];
  /** What each side (top, bottom) trained and built, by unit or tower id, for checking nothing dominates. */
  made: [Record<string, number>, Record<string, number>];
}

/** Plans defined on the command line (`--define name=json`), by name; set in each worker too. */
const defined: Record<string, Partial<Style>> = {};

function planOf(name: string): Partial<Style> | undefined {
  if (name === 'random') return undefined;
  const plan = defined[name] ?? STRATEGIES[name];
  if (!plan)
    throw new Error(
      `unknown strategy "${name}" (known: random, ${[...Object.keys(STRATEGIES), ...Object.keys(defined)].join(', ')})`,
    );
  return plan;
}

export function playMatch(job: Job): Result {
  const board = MAPS[job.map];
  if (!board) throw new Error(`unknown map "${job.map}" (known: ${MAP_IDS.join(', ')})`);
  const { top, bottom, seed } = job;
  const m = newMatch([top.race, bottom.race], board);
  const ai = [createAi(0, seed * 2 + 1, planOf(top.plan)), createAi(1, seed * 2 + 2, planOf(bottom.plan))] as const;
  const made: Result['made'] = [{}, {}];
  const seen = new Set<number>();
  const note = (side: number, id: string) => {
    if (side !== 0 && side !== 1) return;
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
  const share = (o: 0 | 1) => Math.max(0, m.players[o].castle.hp) / m.players[o].castle.maxHp;
  return { ...job, winner: decisive ? (m.winner as 0 | 1) : -1, time: m.time, hp: [share(0), share(1)], made };
}

// --- What-if overrides ---------------------------------------------------------------------------------------------------------------

/**
 * Change a number in the race data: `path=value`, the path walking objects by key and lists by an item's `id` (or its index), e.g.
 * `swarm.units.glider.hp=120`, `titan.castle.hp=*1.1`, `legion.towers.watch.damage=+5`, `swarm.castle.upgrades.0=-10%`.
 * The value is a number (set), `*x` (times), `+x` / `-x` (add), or `+x%` / `-x%` (that share more or less).
 */
export function applyOverride(root: object, spec: string): void {
  const eq = spec.indexOf('=');
  if (eq < 1) throw new Error(`bad --set "${spec}": expected path=value`);
  const [path, raw] = [spec.slice(0, eq), spec.slice(eq + 1).trim()];
  const keys = path.split('.');
  const last = keys.pop()!;
  let at: unknown = root;
  for (const k of keys) at = child(at, k, path);
  const holder = at as Record<string, unknown>;
  if (!holder || typeof holder !== 'object' || !(last in holder) || typeof holder[last] !== 'number')
    throw new Error(`bad --set "${spec}": "${path}" is not a number in the race data`);
  const now = holder[last];
  const pct = /^([+-]\d+(?:\.\d+)?)%$/.exec(raw);
  const times = /^\*(\d+(?:\.\d+)?)$/.exec(raw);
  const add = /^([+-]\d+(?:\.\d+)?)$/.exec(raw);
  let next: number;
  if (pct) next = now * (1 + Number(pct[1]) / 100);
  else if (times) next = now * Number(times[1]);
  else if (add) next = now + Number(add[1]);
  else if (/^\d+(?:\.\d+)?$/.test(raw)) next = Number(raw);
  else throw new Error(`bad --set "${spec}": value "${raw}" is not a number, *x, +x, -x or +x%`);
  holder[last] = next;
}

function child(at: unknown, key: string, path: string): unknown {
  if (Array.isArray(at)) {
    const items = at as { id?: string }[];
    const item: unknown = items.find((x) => x?.id === key) ?? items[Number(key)];
    if (item === undefined) throw new Error(`bad --set path "${path}": nothing called "${key}" in the list`);
    return item;
  }
  if (at && typeof at === 'object' && key in at) return (at as Record<string, unknown>)[key];
  throw new Error(`bad --set path "${path}": no "${key}"`);
}

// --- The matrix -----------------------------------------------------------------------------------------------------------------------

export interface Plan {
  maps: string[];
  races: RaceId[];
  strategies: string[];
  n: number;
  seedBase: number;
}

/** Every pair of entrants (a race with a strategy; mirrors included) on every map, N matches each, the sides alternating. */
export function planJobs({ maps, races, strategies, n, seedBase }: Plan): Job[] {
  const entrants: Entrant[] = races.flatMap((race) => strategies.map((plan) => ({ race, plan })));
  const jobs: Job[] = [];
  let seed = seedBase * 100_000;
  for (const map of maps)
    for (let i = 0; i < entrants.length; i++)
      for (let j = i; j < entrants.length; j++)
        for (let k = 0; k < n; k++) {
          const [a, b] = [entrants[i], entrants[j]];
          jobs.push(k % 2 === 0 ? { map, top: a, bottom: b, seed: seed++ } : { map, top: b, bottom: a, seed: seed++ });
        }
  return jobs;
}

// --- Statistics -----------------------------------------------------------------------------------------------------------------------

/** A win rate with its 95% Wilson interval (decisive matches only): how far to trust it. */
export function winRate(wins: number, losses: number): { p: number; lo: number; hi: number; n: number } {
  const n = wins + losses;
  if (n === 0) return { p: NaN, lo: NaN, hi: NaN, n };
  const z = 1.96;
  const p = wins / n;
  const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return { p, lo: centre - half, hi: centre + half, n };
}

const fmt = (w: number, l: number) => {
  const r = winRate(w, l);
  return r.n
    ? `${(100 * r.p).toFixed(0).padStart(3)}% [${(100 * r.lo).toFixed(0)}-${(100 * r.hi).toFixed(0)}]  n=${r.n}`
    : '   -';
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const mins = (s: number) => (s / 60).toFixed(1);

/** The winner's entrant, if the match was decisive. */
const winnerOf = (r: Result): Entrant | undefined => (r.winner === 0 ? r.top : r.winner === 1 ? r.bottom : undefined);

/** Tally of one group (a race, a strategy, ...) over the matches where it met something different from itself. */
function tally<T extends string>(results: Result[], key: (e: Entrant) => T, keys: readonly T[]) {
  return keys.map((k) => {
    let [w, l, draws] = [0, 0, 0];
    for (const r of results) {
      const [a, b] = [key(r.top), key(r.bottom)];
      if (a === b || (a !== k && b !== k)) continue;
      const won = winnerOf(r);
      if (!won) draws++;
      else if (key(won) === k) w++;
      else l++;
    }
    return { key: k, w, l, draws };
  });
}

/** The decisive matches split into the shortest, middle and longest third by length, with the time each third runs up to (seconds). */
export function lengthThirds(results: Result[]): { name: string; upTo: number; rs: Result[] }[] {
  const dec = results.filter((r) => r.winner >= 0).sort((a, b) => a.time - b.time);
  const cut = (i: number) => dec[Math.min(dec.length - 1, Math.floor((dec.length * i) / 3))]?.time ?? 0;
  const [c1, c2] = [cut(1), cut(2)];
  return [
    { name: 'early', upTo: c1, rs: dec.filter((r) => r.time < c1) },
    { name: 'middle', upTo: c2, rs: dec.filter((r) => r.time >= c1 && r.time < c2) },
    { name: 'late', upTo: Infinity, rs: dec.filter((r) => r.time >= c2) },
  ];
}

export function report(results: Result[], plan: Plan): string {
  const out: string[] = [];
  const say = (s = '') => out.push(s);
  const plans = plan.strategies;
  const entrantKey = (e: Entrant) => `${e.race}/${e.plan}`;
  for (const map of plan.maps) {
    const rs = results.filter((r) => r.map === map);
    const dec = rs.filter((r) => r.winner >= 0);
    say(
      `=== map ${map}: ${rs.length} matches, decisive ${((100 * dec.length) / (rs.length || 1)).toFixed(0)}%, median length ${mins(median(dec.map((r) => r.time)))} min`,
    );

    say('  race win rate against other races (all strategies; 95% interval; draws excluded)');
    for (const t of tally(rs, (e) => e.race, plan.races))
      say(`    ${t.key.padEnd(7)} ${fmt(t.w, t.l)}${t.draws ? `  (${t.draws} draws)` : ''}`);

    if (plan.races.length > 1 && dec.length >= 30) {
      const thirds = lengthThirds(rs);
      say(
        `  timing: race win rate in the early / middle / late third of games (cuts at ${mins(thirds[0].upTo)} and ${mins(thirds[1].upTo)} min): who wins fast, who wins slow`,
      );
      for (const race of plan.races)
        say(
          `    ${race.padEnd(7)} ${thirds
            .map((t) => {
              const x = tally(t.rs, (e) => e.race, [race])[0];
              return `${t.name} ${fmt(x.w, x.l)}`;
            })
            .join('   ')}`,
        );
    }

    if (plan.races.length > 1) {
      say('  pairings: win rate of the first race');
      for (let i = 0; i < plan.races.length; i++)
        for (let j = i + 1; j < plan.races.length; j++) {
          const [a, b] = [plan.races[i], plan.races[j]];
          const pair = rs.filter(
            (r) => (r.top.race === a && r.bottom.race === b) || (r.top.race === b && r.bottom.race === a),
          );
          const w = pair.filter((r) => winnerOf(r)?.race === a).length;
          const l = pair.filter((r) => winnerOf(r)?.race === b).length;
          say(`    ${a.padEnd(7)} vs ${b.padEnd(7)} ${fmt(w, l)}`);
        }
    }

    const mirrors = rs.filter((r) => entrantKey(r.top) === entrantKey(r.bottom) && r.winner >= 0);
    const topWins = mirrors.filter((r) => r.winner === 0).length;
    say(`  side bias (mirror matches, top = player 0): top wins ${fmt(topWins, mirrors.length - topWins)}`);

    if (plans.length > 1) {
      say('  strategy win rate against other strategies (all races)');
      for (const t of tally(rs, (e) => e.plan, plans)) say(`    ${t.key.padEnd(9)} ${fmt(t.w, t.l)}`);
      say('  race x strategy: win rate of the entrant against all others');
      const keys = plan.races.flatMap((race) => plans.map((p) => `${race}/${p}`));
      for (const t of tally(rs, entrantKey, keys)) say(`    ${t.key.padEnd(17)} ${fmt(t.w, t.l)}`);
    }
    say();
  }
  if (plan.maps.length > 1) {
    say('=== maps compared: top-side win rate over all decisive mirror matches, decisive %, median length');
    for (const map of plan.maps) {
      const rs = results.filter((r) => r.map === map);
      const mirrors = rs.filter((r) => entrantKey(r.top) === entrantKey(r.bottom) && r.winner >= 0);
      const top = mirrors.filter((r) => r.winner === 0).length;
      const dec = rs.filter((r) => r.winner >= 0);
      say(
        `  ${map.padEnd(11)} top ${fmt(top, mirrors.length - top)}   decisive ${((100 * dec.length) / (rs.length || 1)).toFixed(0)}%   median ${mins(median(dec.map((r) => r.time)))} min`,
      );
    }
  }
  return out.join('\n');
}

const madeText = (m: Record<string, number>) =>
  Object.entries(m)
    .map(([id, n]) => `${id}:${n}`)
    .join('|');

/** One row a match, for pandas and the like. */
export function toCsv(results: Result[]): string {
  const head =
    'map,seed,top_race,top_plan,bottom_race,bottom_plan,winner_side,winner_race,winner_plan,seconds,top_hp,bottom_hp,top_made,bottom_made';
  const rows = results.map((r) => {
    const w = winnerOf(r);
    return [
      r.map,
      r.seed,
      r.top.race,
      r.top.plan,
      r.bottom.race,
      r.bottom.plan,
      r.winner,
      w?.race ?? '',
      w?.plan ?? '',
      r.time.toFixed(2),
      r.hp[0].toFixed(3),
      r.hp[1].toFixed(3),
      madeText(r.made[0]),
      madeText(r.made[1]),
    ].join(',');
  });
  return [head, ...rows].join('\n') + '\n';
}

// --- Running ----------------------------------------------------------------------------------------------------------------------------

interface WorkerInput {
  sets: string[];
  defs: Record<string, Partial<Style>>;
  jobs: [number, Job][];
}

/** Play the jobs in child processes (a job depends only on its own seed, so the split changes nothing). */
async function playAll(jobs: Job[], sets: string[], workers: number): Promise<Result[]> {
  const procs = Math.max(1, Math.min(workers, jobs.length));
  const out = new Array<Result>(jobs.length);
  await Promise.all(
    Array.from({ length: procs }, (_, t) => {
      const mine = jobs.map((job, i) => [i, job] as [number, Job]).filter(([i]) => i % procs === t);
      return new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [...process.execArgv, process.argv[1], '--worker'], {
          stdio: ['pipe', 'pipe', 'inherit'],
        });
        let text = '';
        child.stdout.on('data', (d: Buffer) => (text += d.toString()));
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code !== 0) return reject(new Error(`lab worker failed (${code})`));
          for (const [i, r] of JSON.parse(text) as [number, Result][]) out[i] = r;
          resolve();
        });
        child.stdin.end(JSON.stringify({ sets, defs: defined, jobs: mine } satisfies WorkerInput));
      });
    }),
  );
  return out;
}

const HELP = `towercraft lab: headless balance simulations over maps x races x strategies

  --n N              matches per pair of entrants (default 40; more is steadier, 100 gives about +-10 points)
  --seed K           seed base (default 1); the same arguments give the same matches
  --maps a,b | all   maps (default serpent): ${MAP_IDS.join(', ')}
  --races a,b | all  races (default all): ${RACE_IDS.join(', ')}
  --strategies a,b | all
                     strategies (default random, the AI's own seeded style): ${Object.keys(STRATEGIES).join(', ')}
  --define name=json a new strategy, e.g. --define air='{"waveEvery":25,"unitWeight":{"glider":4}}' (any Style field; the rest is random)
  --set path=value   what-if on the race data, repeatable: swarm.units.glider.hp=*1.2  titan.castle.hp=-10%  (see applyOverride)
  --out file.csv     write one row per match
  --workers W        processes (default: the cores, at most 8)
`;

function parse(argv: string[]) {
  const get = (flag: string) => argv.flatMap((a, i) => (a === flag ? [argv[i + 1] ?? ''] : []));
  const one = (flag: string, fallback: string) => get(flag).at(-1) ?? fallback;
  const list = (flag: string, all: readonly string[], fallback: string) => {
    const v = one(flag, fallback);
    return v === 'all' ? [...all] : v.split(',').filter(Boolean);
  };
  const sets = get('--set');
  for (const d of get('--define')) {
    const eq = d.indexOf('=');
    defined[d.slice(0, eq)] = JSON.parse(d.slice(eq + 1)) as Partial<Style>;
  }
  const plan: Plan = {
    n: Number(one('--n', '40')),
    seedBase: Number(one('--seed', '1')),
    maps: list('--maps', MAP_IDS, 'serpent'),
    races: list('--races', RACE_IDS, 'all') as RaceId[],
    strategies: list('--strategies', [...Object.keys(STRATEGIES), ...Object.keys(defined)], 'random'),
  };
  for (const m of plan.maps) if (!MAPS[m]) throw new Error(`unknown map "${m}" (known: ${MAP_IDS.join(', ')})`);
  for (const r of plan.races) if (!RACES[r]) throw new Error(`unknown race "${r}" (known: ${RACE_IDS.join(', ')})`);
  for (const s of plan.strategies) planOf(s);
  return {
    plan,
    sets,
    out: get('--out').at(-1),
    workers: Number(one('--workers', String(Math.min(os.availableParallelism(), 8)))),
  };
}

async function main() {
  if (process.argv.includes('--help')) return void console.log(HELP);
  const { plan, sets, out, workers } = parse(process.argv.slice(2));
  const copy = structuredClone(RACES);
  for (const s of sets) applyOverride(copy, s); // validate here, with a clear error, before the workers start
  const jobs = planJobs(plan);
  const started = Date.now();
  console.log(
    `${jobs.length} matches (${plan.maps.length} maps, ${plan.races.length} races, ${plan.strategies.length} strategies, ${plan.n} per pair)${sets.length ? `, what-if: ${sets.join(' ')}` : ''}`,
  );
  const results = await playAll(jobs, sets, workers);
  const secs = (Date.now() - started) / 1000;
  console.log(
    `played in ${secs.toFixed(0)} s (${((jobs.length * 600) / secs).toFixed(0)} game-minutes per second wall clock at ~10 min a game)\n`,
  );
  console.log(report(results, plan));
  if (out) {
    writeFileSync(out, toCsv(results));
    console.log(`\nwrote ${results.length} rows to ${out}`);
  }
}

async function worker() {
  let text = '';
  for await (const chunk of process.stdin) text += (chunk as Buffer).toString();
  const input = JSON.parse(text) as WorkerInput;
  Object.assign(defined, input.defs);
  for (const s of input.sets) applyOverride(RACES, s);
  process.stdout.write(JSON.stringify(input.jobs.map(([i, job]) => [i, playMatch(job)])));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void (process.argv.includes('--worker') ? worker() : main()).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
