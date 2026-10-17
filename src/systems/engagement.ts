// How a player is doing, in counters (Pixi-free, tested; core engine, co-op): the host keeps one per player (`DmReport`,
// scenes/overworld/DmReport.ts) and reads the stall and the line off it when it notes what a player said. They are proxies
// for engagement (is the player busy, stuck, hurt, bored?), not a verdict: read them beside what the player says.
// Nothing here names a player or a place beyond the zone keys the page already has; the repo and site are public.

/** Seconds without a key or a tap before the player counts as idle. */
export const IDLE_AFTER = 20;
export interface ZoneStat {
  seconds: number;
  entries: number;
  knockouts: number;
}

/** What one frame tells the counters. */
export interface Frame {
  /** The player pressed or moved something this frame. */
  input: boolean;
  /** The zone the player is in (its key). */
  zone: string;
  level: number;
  breather: boolean;
}

/** Seconds as "m:ss" (hours as "h:mm:ss"). */
export function span(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const [h, m] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60)];
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export class Engagement {
  /** Seconds the page has run, and the part of it with input in the last IDLE_AFTER seconds. */
  seconds = 0;
  active = 0;
  readonly zones = new Map<string, ZoneStat>();
  kills = 0;
  knockouts = 0;
  quests = { started: 0, done: 0, lost: 0 };
  breathers = 0;
  breatherSeconds = 0;
  firstKillAt: number | null = null;
  firstQuestAt: number | null = null;
  levelStart: number | null = null;
  level = 0;
  /** The longest stretch with no progress (a kill, a quest event or a new zone). */
  longestStall = 0;

  private sinceInput = 0;
  private sinceProgress = 0;

  /** Seconds since this player last made progress while at the keyboard (idle time is not a stall). */
  get stalled(): number {
    return this.sinceProgress;
  }

  private zone = '';

  tick(dt: number, f: Frame) {
    this.seconds += dt;
    this.sinceInput = f.input ? 0 : this.sinceInput + dt;
    if (this.sinceInput < IDLE_AFTER) this.active += dt;
    if (this.levelStart === null) this.levelStart = f.level;
    this.level = f.level;
    if (f.zone !== this.zone) {
      this.zone = f.zone;
      this.stat(f.zone).entries++;
      this.progress();
    }
    this.stat(f.zone).seconds += dt;
    if (f.breather) this.breatherSeconds += dt;
    // Idle time is not a stall: the player was away, not stuck.
    if (this.sinceInput < IDLE_AFTER) this.sinceProgress += dt;
    this.longestStall = Math.max(this.longestStall, this.sinceProgress);
  }

  private stat(zone: string): ZoneStat {
    let z = this.zones.get(zone);
    if (!z) this.zones.set(zone, (z = { seconds: 0, entries: 0, knockouts: 0 }));
    return z;
  }

  private progress() {
    this.sinceProgress = 0;
  }

  killed() {
    this.kills++;
    this.firstKillAt ??= this.active;
    this.progress();
  }

  knockedOut(zone: string) {
    this.knockouts++;
    this.stat(zone).knockouts++;
  }

  questStarted() {
    this.quests.started++;
    this.firstQuestAt ??= this.active;
    this.progress();
  }

  questDone() {
    this.quests.done++;
    this.progress();
  }

  questLost() {
    this.quests.lost++;
    this.progress();
  }

  breatherBegan() {
    this.breathers++;
  }

  /** One line of JSON for the console (`[engage] {...}`): the same counters, for a developer or the DM bot to read. */
  line(): string {
    return JSON.stringify({
      s: Math.round(this.seconds),
      busy: Math.round(this.active),
      lv: this.level,
      kills: this.kills,
      down: this.knockouts,
      quests: [this.quests.started, this.quests.done, this.quests.lost],
      breathers: this.breathers,
      stall: Math.round(this.longestStall),
      zones: Object.fromEntries([...this.zones].map(([z, s]) => [z, Math.round(s.seconds)])),
    });
  }
}
