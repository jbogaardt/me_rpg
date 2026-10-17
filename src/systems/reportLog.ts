// What the host writes down about how a game is going (Pixi-free, tested; core engine, co-op). Nobody fills in a form: the
// host notes what each player says to the Dungeon Master (their own words, a canned ask, a one-tap note) and what the game
// did around it (a director's nudge, a knockout, a quest ending, a breather), each with the state of the game at that
// moment: who, level and health, where, the quest, how the party fares, what stands near, how long since anything
// progressed, and the last few things that happened. It goes to the host's console as `[report]` lines and is held for the
// DM bot to collect (`DmBot.reports`), which at the game's end has Haiku turn it into a prompt file for the next session
// (server/report.ts). Players are P1, P2... (their seat), never a name; the repo and site are public.

/** What was noted. */
export const REPORT_KINDS = ['said', 'ask', 'note', 'signal', 'down', 'quest', 'breather'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** A hero as they really are: what they hit with and take with, and what they carry. */
export interface HeroFacts {
  /** The attack stat and what gear adds to it (power is the two together: the blow). */
  attack: number;
  attackGear: number;
  power: number;
  /** The defense stat and what armour adds (armor is the two together: what each blow is cut by). */
  defense: number;
  defenseGear: number;
  armor: number;
  magic: number;
  mp: number;
  maxMp: number;
  /** XP into this level, and what the next needs. */
  xp: [into: number, next: number];
  weapon: string;
  /** What else is worn, by name. */
  worn: string[];
  /** Supplies that heal, in the pack. */
  potions: number;
  food: number;
  water: number;
  gold: number;
  skills: string[];
}

/** How fighting has gone for this player (and the party), now and over the last minute. */
export interface FightFacts {
  /** Knockouts of this player, in all and in this zone; the party's kills in this zone and in all. */
  downs: number;
  downsHere: number;
  killsHere: number;
  kills: number;
  /** In the last 60 s: damage this player took and in how many hits, damage the party dealt. */
  taken: number;
  hitsTaken: number;
  dealt: number;
  /** Foes that hit this player in the last 60 s, by name, with how many hits each. */
  by: Record<string, number>;
  /** Who last hurt them and how long ago (s), or null. */
  lastHurtBy: { foe: string; ago: number } | null;
  /** The DM's pressure: gentle, steady or fierce. */
  pressure: string;
}

/** The zone: the levels it is for, and how many foes stand in it. */
export interface PlaceFacts {
  band: [number, number] | null;
  alive: number;
  total: number;
}

/** One kind of foe in the zone, as it fights this player (their real blow and armour, and a typical hero of their level). */
export interface FoeFacts {
  name: string;
  /** How many of this kind are alive in the zone, and within a few cells of the player. */
  count: number;
  near: number;
  maxHp: number;
  attack: number;
  defense: number;
  xp: number;
  /** Blows this player needs to fell one and hits it needs to fell them, as they are now. */
  blows: number;
  hits: number;
  /** deadly, slog, hard, fair, easy or trivial: this fight as this player has it, and as a typical hero of their level would. */
  verdict: string;
  typical: string;
}

/** The state of the game when something was noted. */
export interface ReportState {
  /** The player concerned, by seat ("P1"); "-" for something about the whole table. */
  who: string;
  level: number;
  /** Health in points. */
  hp: number;
  maxHp: number;
  /** The zone's key and what the player sees it called, and the cell they stand on. */
  zone: string;
  area: string;
  at: [col: number, row: number];
  /** The quest the party has (its title and how far), or null. */
  quest: string | null;
  party: { size: number; avgHp: number; lowest: number };
  hero: HeroFacts;
  fight: FightFacts;
  place: PlaceFacts;
  /** The kinds of foe in the zone, the ones nearest this player first. */
  foes: FoeFacts[];
  breather: boolean;
  /** Seconds this player has gone without progress (a kill, a quest event, a new zone) while at the keyboard. */
  stall: number;
  /** The last things that happened, oldest first, each with when. */
  recent: string[];
}

export interface ReportEntry {
  /** Seconds since the game began (the host's clock). */
  t: number;
  kind: ReportKind;
  slot: number;
  /** What was said or what happened. */
  text: string;
  state: ReportState;
}

/** How many recent events ride with each entry, and how many entries are kept before the oldest are dropped. */
export const RECENT_EVENTS = 12;
export const ENTRY_CAP = 600;

/** "3:07": a game clock for a line of the log. */
export const stamp = (t: number): string => {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class ReportLog {
  private events: string[] = [];
  private kept: ReportEntry[] = [];
  private cursor = 0;

  /** A thing that happened (not yet a report): it rides in the `recent` of what is noted next. */
  event(t: number, text: string) {
    this.events.push(`${stamp(t)} ${text}`);
    if (this.events.length > RECENT_EVENTS) this.events.shift();
  }

  get recent(): string[] {
    return [...this.events];
  }

  /** Note something with the state it happened in. Returns the entry (the host also prints it). */
  add(t: number, kind: ReportKind, slot: number, text: string, state: ReportState): ReportEntry {
    const entry: ReportEntry = { t: Math.round(t * 10) / 10, kind, slot, text: text.slice(0, 200), state };
    this.kept.push(entry);
    if (this.kept.length > ENTRY_CAP) {
      this.kept.shift();
      this.cursor = Math.max(0, this.cursor - 1);
    }
    this.event(
      t,
      `${kind === 'said' || kind === 'ask' || kind === 'note' ? `${state.who} ${kind}` : kind}: ${text}`.slice(0, 120),
    );
    return entry;
  }

  /** What was noted since the last call (the bot collects it every few seconds). */
  drain(): ReportEntry[] {
    const fresh = this.kept.slice(this.cursor);
    this.cursor = this.kept.length;
    return fresh;
  }

  get all(): readonly ReportEntry[] {
    return this.kept;
  }

  reset() {
    this.events = [];
    this.kept = [];
    this.cursor = 0;
  }
}

/** One entry as the host prints it to its console: `[report] {json}`. */
export const reportLine = (e: ReportEntry): string => `[report] ${JSON.stringify(e)}`;

/** Is this a report entry the bot may trust? (the log comes from a page, so the bot checks its shape) */
export function isReportEntry(v: unknown): v is ReportEntry {
  const e = v as Partial<ReportEntry> | null;
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof e.t === 'number' &&
    typeof e.text === 'string' &&
    typeof e.slot === 'number' &&
    REPORT_KINDS.includes(e.kind as ReportKind) &&
    typeof e.state === 'object' &&
    e.state !== null &&
    typeof e.state.who === 'string' &&
    Array.isArray(e.state.recent)
  );
}
