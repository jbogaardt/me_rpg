// What a player can report about how the game is going (Pixi-free, tested; core engine, co-op): counters kept on each
// page, never sent anywhere. The Report tab (hud/Report.ts) shows them and copies them as plain text; the same numbers go
// to the console as one `[engage]` line at the moments that matter, so a developer or the DM bot reads the same story
// the player tells. They are proxies for engagement (is the player busy, stuck, hurt, bored?), not a verdict: read them
// beside what the player says. A guest's page cannot count kills or knockouts (the host simulates), so those read 0 there.
// Nothing here names a player or a place beyond the zone keys the page already has; the repo and site are public.

/** How a player says it is going. */
export const MOODS = ['good', 'ok', 'bad'] as const;
export type Mood = (typeof MOODS)[number];
export const MOOD_FACES: Record<Mood, string> = { good: '\u{1F600}', ok: '\u{1F610}', bad: '\u{1F61E}' };

/** Seconds without a key or a tap before the player counts as idle. */
export const IDLE_AFTER = 20;
/** The longest free-text note a player may attach. */
export const NOTE_MAX = 240;

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
  readonly moods: Record<Mood, number> = { good: 0, ok: 0, bad: 0 };
  stuck = 0;
  note = '';
  firstKillAt: number | null = null;
  firstQuestAt: number | null = null;
  levelStart: number | null = null;
  level = 0;
  /** The longest stretch with no progress (a kill, a quest event or a new zone). */
  longestStall = 0;

  private sinceInput = 0;
  private sinceProgress = 0;
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

  mood(m: Mood) {
    this.moods[m]++;
  }

  stuckPressed() {
    this.stuck++;
  }

  setNote(text: string) {
    this.note = text.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
  }

  /** The plain-text report a player copies: `name` turns a zone key into what the player sees. */
  text(opts: { build: string; name: (zone: string) => string; visit?: number }): string {
    const idle = Math.max(0, this.seconds - this.active);
    const where = [...this.zones.entries()]
      .sort((a, b) => b[1].seconds - a[1].seconds)
      .map(
        ([z, s]) => `${opts.name(z)} ${span(s.seconds)} (${s.entries}x${s.knockouts ? `, ${s.knockouts} down` : ''})`,
      );
    const lines = [
      `me_rpg report · build ${opts.build}${opts.visit ? ` · visit ${opts.visit}` : ''}`,
      `Playing ${span(this.seconds)} (busy ${span(this.active)}, idle ${span(idle)}) · level ${this.level}` +
        (this.levelStart !== null && this.level > this.levelStart ? ` (from ${this.levelStart})` : ''),
      `First kill ${this.firstKillAt === null ? 'none yet' : `at ${span(this.firstKillAt)}`} · first quest ${
        this.firstQuestAt === null ? 'none yet' : `at ${span(this.firstQuestAt)}`
      } · longest stall ${span(this.longestStall)}`,
      `Kills ${this.kills} · knockouts ${this.knockouts}`,
      `Quests started ${this.quests.started}, done ${this.quests.done}, lost ${this.quests.lost}`,
      `Breathers ${this.breathers} (${span(this.breatherSeconds)})`,
      `Mood ${MOODS.map((m) => `${MOOD_FACES[m]} ${this.moods[m]}`).join('  ')} · stuck pressed ${this.stuck}`,
      `Where: ${where.join(', ') || 'nowhere yet'}`,
    ];
    if (this.note) lines.push(`Note: ${this.note}`);
    return lines.join('\n');
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
      mood: [this.moods.good, this.moods.ok, this.moods.bad],
      stuck: this.stuck,
      stall: Math.round(this.longestStall),
      zones: Object.fromEntries([...this.zones].map(([z, s]) => [z, Math.round(s.seconds)])),
    });
  }
}
