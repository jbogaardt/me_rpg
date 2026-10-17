import type { Player } from '../../entities/Player';
import { CELL } from '../../map/types';
import { MESSAGE_CODE, NOTE_CODE, REQUESTS } from '../../systems/dmRequests';
import { Engagement } from '../../systems/engagement';
import { zoneName } from '../../systems/places';
import { ReportLog, reportLine, type ReportKind, type ReportState } from '../../systems/reportLog';
import type { Arena } from './Arena';

/** Foes this close (cells) to a player ride in the state of what they said. */
const NEAR_CELLS = 10;
/** Kills are written as one event per this many seconds, not one each. */
const KILL_EVENT_EVERY = 10;
/** A player by seat, never by name: the report may end up in a public repo. */
export const seatName = (slot: number) => `P${slot + 1}`;

/**
 * The host's notebook (core engine, host and solo; nothing on the wire beyond the one-tap note a guest sends): it writes down
 * what each player says to the Dungeon Master and what the game did around it, each with the state of the game at that
 * moment (`ReportState`, systems/reportLog.ts), so nobody has to fill in a form. Entries go to the console as `[report]`
 * lines (the host log) and wait for the DM bot (`DmBot.reports`), which has Haiku turn a game's worth into a prompt file for
 * the next session (server/report.ts). A guest's page keeps nothing: its host does.
 */
export class DmReport {
  readonly log = new ReportLog();
  private clock = 0;
  private counters = new Map<number, Engagement>();
  private zones = new Map<number, string>();
  private questState: string | null = null;
  private kills = new Map<string, number>();
  private killsAt = 0;

  constructor(
    private arena: Arena,
    /** Is a breather running (the page's own)? */
    private breathing: () => boolean,
  ) {}

  private get keeping(): boolean {
    return this.arena.role !== 'client';
  }

  /** Every frame. */
  update(dt: number) {
    if (!this.keeping) return;
    this.clock += dt;
    for (const p of this.arena.partyAll()) {
      let e = this.counters.get(p.slot);
      if (!e) this.counters.set(p.slot, (e = new Engagement()));
      e.tick(dt, { input: p.idle < 0.5, zone: p.zone, level: p.hero.stats.level, breather: this.breathing() });
      const last = this.zones.get(p.slot);
      if (last !== undefined && last !== p.zone)
        this.log.event(this.clock, `${seatName(p.slot)} went to ${zoneName(p.zone)}`);
      this.zones.set(p.slot, p.zone);
    }
    if (this.kills.size && this.clock - this.killsAt >= KILL_EVENT_EVERY) this.flushKills();
    this.watchQuest();
  }

  /** The DM's quest as it begins or ends (what the party is doing is the first thing a report needs). */
  private watchQuest() {
    const t = this.arena.task;
    const state = t ? `${t.state}|${t.title}` : null;
    if (state === this.questState) return;
    const was = this.questState;
    this.questState = state;
    if (!t) return;
    if (t.state === 'active') this.log.event(this.clock, `quest began: ${t.title}`);
    else if (was?.startsWith('active|')) this.add('quest', null, `${t.state === 'done' ? 'done' : 'lost'}: ${t.title}`);
  }

  /** A player's request reached the host: words of their own, a canned ask, or a one-tap note. */
  heard(slot: number, code: number, text?: string) {
    const p = this.arena.partyAll().find((q) => q.slot === slot);
    if (code === MESSAGE_CODE && text) this.add('said', p ?? null, text);
    else if (code === NOTE_CODE && text) this.add('note', p ?? null, text);
    else if (REQUESTS[code]) this.add('ask', p ?? null, REQUESTS[code].label);
  }

  /** The director offered the DM something (the party is struggling, lost, breezing through...). */
  signal(kind: string) {
    this.add('signal', null, kind);
  }

  /** A hero was knocked out. */
  down(p: Player, zone: string) {
    this.add('down', p, `knocked out in ${zoneName(zone)}`);
  }

  killed(key: string) {
    this.kills.set(key, (this.kills.get(key) ?? 0) + 1);
    this.killsAt ||= this.clock;
  }

  /** The DM said something (what a player answers is read against it). */
  dmSaid(text: string) {
    this.log.event(this.clock, `DM: "${text.slice(0, 80)}"`);
  }

  breather() {
    this.add('breather', null, 'a breather began');
  }

  reset() {
    this.log.reset();
    this.counters.clear();
    this.zones.clear();
    this.kills.clear();
    this.questState = null;
    this.clock = 0;
  }

  private flushKills() {
    const parts = [...this.kills].map(([k, n]) => (n > 1 ? `${k} x${n}` : k));
    this.log.event(this.clock, `the party killed ${parts.join(', ')}`);
    this.kills.clear();
    this.killsAt = 0;
  }

  /** Note something, with the state of the game for `p` (or for the table when it is about no one in particular). */
  private add(kind: ReportKind, p: Player | null, text: string) {
    if (!this.keeping) return;
    if (this.kills.size) this.flushKills();
    const entry = this.log.add(this.clock, kind, p?.slot ?? 0, text, this.snapshot(p));
    console.info(reportLine(entry));
  }

  /** The state of the game now, for `p`; for the table (no `p`) the player in the worst shape stands for it. */
  snapshot(p: Player | null): ReportState {
    const party = this.arena.partyAll();
    const fracs = party.map((q) => q.hero.stats.hp / Math.max(1, q.hero.stats.maxHp));
    const who =
      p ??
      party.reduce<Player | null>(
        (w, q) => (!w || q.hero.stats.hp / q.hero.stats.maxHp < w.hero.stats.hp / w.hero.stats.maxHp ? q : w),
        null,
      );
    const zone = who?.zone ?? '';
    const state = this.arena.zones.get(zone);
    const near: Record<string, number> = {};
    if (who && state)
      for (const m of state.mobs)
        if (m.alive && Math.hypot(m.body.x - who.body.x, m.body.y - who.body.y) <= NEAR_CELLS * CELL)
          near[m.kind.name] = (near[m.kind.name] ?? 0) + 1;
    const t = this.arena.task;
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      who: p ? seatName(p.slot) : '-',
      level: who?.hero.stats.level ?? 0,
      hp: Math.round(who?.hero.stats.hp ?? 0),
      maxHp: who?.hero.stats.maxHp ?? 0,
      zone,
      area: zoneName(zone),
      at: who ? [Math.floor(who.body.x / CELL), Math.floor(who.body.y / CELL)] : [0, 0],
      quest: t
        ? `${t.title}${t.goal > 1 ? ` (${t.progress}/${t.goal})` : ''}${t.epic ? ` [saga step ${t.epic.step} of ${t.epic.total}]` : ''}${t.state === 'active' ? '' : ` [${t.state}]`}`
        : null,
      party: {
        size: party.length,
        avgHp: round(fracs.reduce((a, b) => a + b, 0) / Math.max(1, fracs.length)),
        lowest: round(fracs.length ? Math.min(...fracs) : 1),
      },
      near,
      breather: this.breathing(),
      stall: Math.round((who && this.counters.get(who.slot)?.stalled) || 0),
      recent: this.log.recent,
    };
  }
}
