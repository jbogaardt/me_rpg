// What a tick of the match sounds like: the rules say what happened (`shots`, `deaths`, `razed`) or leave it to be seen in what
// changed (a new tower, a castle level, an upgrade bought). Pixi-free and cosmetic: it only reads the match, so each page makes
// its own sounds from the same lockstep state and nothing goes over the wire.

import { canSee, incomeOf, teamOf, TIME_LIMIT, type Match, type Owner, type Unit } from './sim/sim';
import type { RaceId } from './sim/races';
import type { FileKind } from './soundBank';
import { CASTLE_WEAPON, deathKind, impactKind, isStone, TOWER_WEAPON, UNIT_WEAPON } from './soundClass';

export type { FileKind } from './soundBank';
/** What a cue can be: any recorded sound of the bank (`soundBank.ts`). */
export type SoundKind = FileKind;

/** The castle alarm sounds at most this often (seconds of match time), and the softer one for a building hit off screen. */
export const ALARM_EVERY = 10;
export const WARN_EVERY = 8;
/** The clock warnings: this many seconds before `TIME_LIMIT`. */
export const CLOCK_AT = [60, 10] as const;

export interface Cue {
  kind: SoundKind;
  /** Where it happens, in cells. */
  at: readonly [number, number];
  /** The player did it themselves (built, upgraded): heard in full wherever they are looking. */
  own: boolean;
}

interface Seen {
  towers: Set<number>;
  levels: number[];
  upgrades: number[];
  alive: boolean[];
  castleHp: number[];
  towerHp: Map<number, number>;
  /** Bunker garrison sizes, to hear a unit go in. */
  garrison: Map<number, number>;
  /** Whether each tower (by `col,row`) is big enough to fall as stone, for the sound of its razing. */
  towerBig: Map<string, boolean>;
  payTimer: number;
  time: number;
  over: boolean;
}

const raceOfSeat = (m: Match, o: Owner): RaceId => m.players[o]!.race;
const upgradesOf = (m: Match, o: Owner) => Object.values(m.players[o]!.upgrades).reduce((a, b) => a + b, 0);

function snapshot(m: Match): Seen {
  return {
    towers: new Set(m.towers.map((t) => t.id)),
    levels: m.players.map((p) => p.castle.level),
    upgrades: m.players.map((_, o) => upgradesOf(m, o)),
    alive: m.players.map((p) => p.castle.hp > 0),
    castleHp: m.players.map((p) => p.castle.hp),
    towerHp: new Map(m.towers.map((t) => [t.id, t.hp])),
    garrison: new Map(m.towers.map((t) => [t.id, t.garrison.length])),
    towerBig: new Map(m.towers.map((t) => [`${t.col},${t.row}`, isStone(m.players[t.owner]!.race, t.def.hp)])),
    payTimer: m.payTimer,
    time: m.time,
    over: m.winner >= 0,
  };
}

/** Remembers the match as of the last tick, to tell what is new in this one. Make one per match, at its start. */
export class SoundWatch {
  private seen: Seen;
  /** Match time of the last alarm and the last off-screen warning, so a long siege is not one long siren. */
  private alarmAt = -Infinity;
  private warnAt = -Infinity;
  constructor(m: Match) {
    this.seen = snapshot(m);
  }

  /** The sounds of the tick just run, for the player in seat `you`. Things the player cannot see stay silent (fog of war). */
  collect(m: Match, you: Owner): Cue[] {
    const cues: Cue[] = [];
    const heard = (at: readonly [number, number]) => canSee(m, you, at);
    const add = (kind: SoundKind, at: readonly [number, number], own = false) => {
      if (own || heard(at)) cues.push({ kind, at, own });
    };
    this.fights(m, add);
    for (const d of m.deaths) add(d.boom ? 'blast' : deathKind(m.players[d.owner]!.race, d.def), d.at);
    for (const r of m.razed)
      add(this.seen.towerBig.get(`${r.col},${r.row}`) ? 'razedLarge' : 'razedSmall', [r.col + 0.5, r.row + 0.5]);

    const was = this.seen;
    for (const t of m.towers) {
      if (!was.towers.has(t.id)) add('build', [t.col + 0.5, t.row + 0.5], t.owner === you);
      else if (t.garrison.length > (was.garrison.get(t.id) ?? 0))
        add('bunker', [t.col + 0.5, t.row + 0.5], t.owner === you);
    }
    m.players.forEach((p, o) => {
      const castle = m.board.castles[o]!;
      const mine = o === you;
      if (p.castle.level > (was.levels[o] ?? 0)) add('castle', castle, mine);
      else if (upgradesOf(m, o) > (was.upgrades[o] ?? 0)) add('upgrade', castle, mine);
      if (was.alive[o] && p.castle.hp <= 0) add('fall', castle, true);
    });
    this.alerts(m, you, add);
    this.seen = snapshot(m);
    return cues;
  }

  /** The swing or release of every shot by the attacker's weapon class, and where a ranged one lands (`soundClass.ts`). */
  private fights(m: Match, add: (kind: SoundKind, at: readonly [number, number]) => void) {
    if (!m.shots.length) return;
    const units = new Map<number, Unit>(m.units.map((u) => [u.id, u]));
    const raceOf = (o: number): RaceId => m.players[o]!.race;
    for (const s of m.shots) {
      let weapon: FileKind | null | undefined;
      if (s.by.kind === 'unit') {
        const u = units.get(s.by.id);
        weapon = u ? UNIT_WEAPON[raceOf(u.owner)][u.def.id] : s.melee ? 'sword' : 'bow';
      } else if (s.by.kind === 'tower') {
        const t = m.towers.find((x) => x.id === s.by.id);
        weapon = t ? TOWER_WEAPON[raceOf(t.owner)][t.def.id] : 'bow';
      } else weapon = CASTLE_WEAPON;
      if (!weapon) continue;
      add(weapon, s.from);
      if (s.melee) continue;
      const hit = impactKind(weapon, this.materialAt(m, s.to));
      if (hit) add(hit, s.to);
    }
  }

  /** The material of the building a missile lands on (a castle or tower within a cell and a half of the point), if any. */
  private materialAt(m: Match, at: readonly [number, number]): 'stone' | 'wood' | undefined {
    if (m.board.castles.some((c) => Math.hypot(c[0] - at[0], c[1] - at[1]) < 1.6)) return 'stone';
    const t = m.towers.find((x) => Math.hypot(x.col + 0.5 - at[0], x.row + 0.5 - at[1]) < 1.5);
    return t ? (isStone(raceOfSeat(m, t.owner), t.def.hp) ? 'stone' : 'wood') : undefined;
  }

  /** What the player must hear whatever they look at: their castle or a building hit, pay-day, the clock, the end. */
  private alerts(m: Match, you: Owner, add: (kind: SoundKind, at: readonly [number, number], own?: boolean) => void) {
    const was = this.seen;
    const mine = m.players[you];
    if (!mine) return;
    const home = m.board.castles[you]!;
    if (mine.castle.hp > 0 && mine.castle.hp < (was.castleHp[you] ?? 0) && m.time - this.alarmAt >= ALARM_EVERY) {
      this.alarmAt = m.time;
      add('alarm', home, true);
    }
    const hurt = m.towers.find((t) => t.owner === you && t.hp > 0 && t.hp < (was.towerHp.get(t.id) ?? 0));
    if (hurt && m.time - this.warnAt >= WARN_EVERY && m.time - this.alarmAt >= 2) {
      this.warnAt = m.time;
      add('warn', [hurt.col + 0.5, hurt.row + 0.5]);
    }
    if (m.payTimer < was.payTimer && m.winner < 0 && (incomeOf(m, you).wood > 0 || incomeOf(m, you).stone > 0))
      add('coin', home, true);
    if (m.winner < 0) {
      if (was.time < TIME_LIMIT - CLOCK_AT[0] && m.time >= TIME_LIMIT - CLOCK_AT[0]) add('clock', home, true);
      if (was.time < TIME_LIMIT - CLOCK_AT[1] && m.time >= TIME_LIMIT - CLOCK_AT[1]) add('clockLast', home, true);
    }
    if (!was.over && m.winner >= 0 && m.winner !== 2) add(m.winner === teamOf(m, you) ? 'win' : 'lose', home, true);
  }
}
