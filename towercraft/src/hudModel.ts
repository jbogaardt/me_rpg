// What the status strip and the alerts show, as numbers (cosmetic, Pixi-free; layer: this game's own, nothing in the protocol).
// Everything reads a `Match` and never writes it, so a guest and a host, a duel and a co-op match all use the same code.
import { PAY_EVERY, TIME_LIMIT, UNIT_CAP, incomeOf, teamSeats, type Match, type Owner } from './sim/sim';

/** Seconds as `m:ss` (never negative). */
export const clockText = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Whole seconds left until the match is decided on castle health. */
export const timeLeft = (m: Match): number => Math.max(0, Math.ceil(TIME_LIMIT - m.time));

/** The last minute: the clock turns amber. */
export const clockLate = (m: Match): boolean => timeLeft(m) <= 60;

/** The castle health left (0..1) of `seats`: what the rules compare at the time limit. */
export const castleShare = (m: Match, seats: readonly Owner[]): number => {
  let hp = 0;
  let max = 0;
  for (const o of seats) {
    const p = m.players[o];
    if (!p) continue;
    hp += Math.max(0, p.castle.hp);
    max += p.castle.maxHp;
  }
  return max > 0 ? Math.min(1, hp / max) : 0;
};

/** Every seat on `you`'s side, and every seat on another side. */
export const sides = (m: Match, you: Owner): { mine: Owner[]; foes: Owner[] } => {
  const mine = teamSeats(m, you);
  return { mine, foes: m.players.flatMap((_, o) => (mine.includes(o) ? [] : [o])) };
};

/** How many units `you` has out, as the unit limit counts them. */
export const unitsOut = (m: Match, you: Owner): number => m.units.reduce((n, u) => n + (u.owner === you ? 1 : 0), 0);

export { UNIT_CAP };

/** What `you` is paid every pay day, as the number the strip shows (wood and stone together), and how far the next one is (0..1). */
export const payDay = (m: Match, you: Owner): { total: number; wood: number; stone: number; progress: number } => {
  const inc = incomeOf(m, you);
  return {
    total: Math.round(inc.wood + inc.stone),
    wood: Math.round(inc.wood),
    stone: Math.round(inc.stone),
    progress: Math.max(0, Math.min(1, m.payTimer / PAY_EVERY)),
  };
};

/** Where a point of the minimap is on the field (cells); `x`, `y` are 0..1 across the picture. Clamped to the map. */
export const miniToCell = (m: Match, x: number, y: number): [number, number] => [
  Math.max(0, Math.min(1, x)) * m.board.cols,
  Math.max(0, Math.min(1, y)) * m.board.rows,
];

/** What an alert says. */
export type AlertKind = 'castle' | 'tower' | 'ally';
export interface Alert {
  kind: AlertKind;
  text: string;
  /** Where to look, in cells. */
  at: [number, number];
}

/** The part of the field on screen, in cells (`soundView` in main.ts). */
export interface View {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

/** Is a point (cells) inside the view, with `pad` cells of margin? */
export const inView = (v: View, at: readonly [number, number], pad = 0): boolean =>
  Math.abs(at[0] - v.cx) <= v.halfW - pad && Math.abs(at[1] - v.cy) <= v.halfH - pad;

/** Seconds of match time between two alerts of one kind. */
export const ALERT_EVERY = 8;

/**
 * Notices damage to the player's castle and buildings that is off screen, and a fallen ally, by comparing health with the last call
 * (so a repair or a pay day says nothing). One alert per kind every `ALERT_EVERY` seconds of match time; damage seen on screen is
 * not announced, but is remembered as the new level.
 */
export class AlertWatch {
  private towers = new Map<number, number>();
  private castles: number[] = [];
  private out: boolean[] = [];
  private last: Partial<Record<AlertKind, number>> = {};

  constructor(m?: Match) {
    if (m) this.reset(m);
  }

  /** Start from how things stand now (a new match). */
  reset(m: Match): void {
    this.towers = new Map(m.towers.map((t) => [t.id, t.hp]));
    this.castles = m.players.map((p) => p.castle.hp);
    this.out = m.players.map((p) => p.out);
    this.last = {};
  }

  /** The alerts since the last call, for `you` while `view` is what the screen shows. */
  collect(m: Match, you: Owner, view: View): Alert[] {
    const found: Alert[] = [];
    const allowed = (kind: AlertKind): boolean => {
      const at = this.last[kind];
      return at === undefined || m.time - at >= ALERT_EVERY || m.time < at;
    };
    const say = (a: Alert) => {
      if (!allowed(a.kind)) return;
      this.last[a.kind] = m.time;
      found.push(a);
    };
    const mine = teamSeats(m, you);
    m.players.forEach((p, o) => {
      const before = this.castles[o] ?? p.castle.hp;
      const at = m.board.castles[o]!;
      if (o === you && !p.out && p.castle.hp < before && !inView(view, at, 1))
        say({ kind: 'castle', text: 'Your castle is under attack', at: [at[0], at[1]] });
      if (o !== you && mine.includes(o) && p.out && !this.out[o])
        say({ kind: 'ally', text: "Your ally's castle has fallen", at: [at[0], at[1]] });
      this.castles[o] = p.castle.hp;
      this.out[o] = p.out;
    });
    const seen = new Map<number, number>();
    for (const t of m.towers) {
      seen.set(t.id, t.hp);
      const before = this.towers.get(t.id);
      if (t.owner !== you || before === undefined || t.hp >= before || t.hp <= 0) continue;
      const at: [number, number] = [t.col + 0.5, t.row + 0.5];
      if (!inView(view, at, 1)) say({ kind: 'tower', text: 'A tower is under attack', at });
    }
    this.towers = seen;
    return found;
  }
}
