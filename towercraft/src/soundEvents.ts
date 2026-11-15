// What a tick of the match sounds like: the rules say what happened (`shots`, `deaths`, `razed`) or leave it to be seen in what
// changed (a new tower, a castle level, an upgrade bought). Pixi-free and cosmetic: it only reads the match, so each page makes
// its own sounds from the same lockstep state and nothing goes over the wire.

import { canSee, incomeOf, teamOf, TIME_LIMIT, type Match, type Owner } from './sim/sim';
import type { SynthKind } from './synth';

/** The sounds that are Ogg files (`public/audio/sfx/`). */
export type FileKind = 'melee' | 'shoot' | 'blast' | 'death' | 'build' | 'upgrade' | 'castle' | 'razed' | 'fall';
/** What a cue can be: a file, or one of the synthesized cues the match itself raises (`synth.ts`). */
export type SoundKind =
  FileKind | Extract<SynthKind, 'alarm' | 'warn' | 'coin' | 'clock' | 'clockLast' | 'win' | 'lose'>;

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
  payTimer: number;
  time: number;
  over: boolean;
}

const upgradesOf = (m: Match, o: Owner) => Object.values(m.players[o]!.upgrades).reduce((a, b) => a + b, 0);

function snapshot(m: Match): Seen {
  return {
    towers: new Set(m.towers.map((t) => t.id)),
    levels: m.players.map((p) => p.castle.level),
    upgrades: m.players.map((_, o) => upgradesOf(m, o)),
    alive: m.players.map((p) => p.castle.hp > 0),
    castleHp: m.players.map((p) => p.castle.hp),
    towerHp: new Map(m.towers.map((t) => [t.id, t.hp])),
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
    for (const s of m.shots) add(s.melee ? 'melee' : s.splash > 0 ? 'blast' : 'shoot', s.from);
    for (const d of m.deaths) add(d.boom ? 'blast' : 'death', d.at);
    for (const r of m.razed) add('razed', [r.col + 0.5, r.row + 0.5]);

    const was = this.seen;
    for (const t of m.towers) if (!was.towers.has(t.id)) add('build', [t.col + 0.5, t.row + 0.5], t.owner === you);
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
