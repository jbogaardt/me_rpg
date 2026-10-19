// What a tick of the match sounds like: the rules say what happened (`shots`, `deaths`, `razed`) or leave it to be seen in what
// changed (a new tower, a castle level, an upgrade bought). Pixi-free and cosmetic: it only reads the match, so each page makes
// its own sounds from the same lockstep state and nothing goes over the wire.

import { canSee, type Match, type Owner } from './sim/sim';

export type SoundKind = 'melee' | 'shoot' | 'blast' | 'death' | 'build' | 'upgrade' | 'castle' | 'razed' | 'fall';

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
}

const upgradesOf = (m: Match, o: Owner) => Object.values(m.players[o]!.upgrades).reduce((a, b) => a + b, 0);

function snapshot(m: Match): Seen {
  return {
    towers: new Set(m.towers.map((t) => t.id)),
    levels: m.players.map((p) => p.castle.level),
    upgrades: m.players.map((_, o) => upgradesOf(m, o)),
    alive: m.players.map((p) => p.castle.hp > 0),
  };
}

/** Remembers the match as of the last tick, to tell what is new in this one. Make one per match, at its start. */
export class SoundWatch {
  private seen: Seen;
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
    this.seen = snapshot(m);
    return cues;
  }
}
