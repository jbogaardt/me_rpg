import type { Player } from '../../entities/Player';
import { CELL } from '../../map/types';
import {
  MOB_KINDS,
  attackPower,
  defensePower,
  gearAttack,
  gearDefense,
  wornGear,
  xpToNext,
} from '../../systems/combat';
import { heroModel } from '../../systems/dmBoss';
import { mobKey } from '../../systems/quests';
import { MESSAGE_CODE, NOTE_CODE, REQUESTS } from '../../systems/dmRequests';
import { Engagement } from '../../systems/engagement';
import { duelWith, verdictOf, zoneLevels } from '../../systems/levels';
import { zoneName } from '../../systems/places';
import {
  ReportLog,
  reportLine,
  type FoeFacts,
  type ReportKind,
  type ReportState,
  type StateDetail,
} from '../../systems/reportLog';
import type { Arena } from './Arena';

/** Foes this close (cells) to a player ride in the state of what they said. */
const NEAR_CELLS = 10;
/** The window (s) of "lately" for damage taken and dealt, and the most kinds of foe a state lists. */
const LATELY = 60;
const MAX_FOES = 6;
/** A knockout is blamed on a foe that hurt the player this recently (s). */
const BLAME = 10;
/** A director's nudge of the same kind is noted again only after this many seconds (the repeats in between are counted). */
const REPEAT_SIGNAL = 120;
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
  /** Blows that landed on each player, and blows the party dealt, over the last `LATELY` seconds. */
  private taken = new Map<number, { t: number; dmg: number; foe: string }[]>();
  private dealtLately: { t: number; dmg: number }[] = [];
  private downs = new Map<string, number>(); // `${slot}` and `${slot}|${zone}`
  private killsIn = new Map<string, number>();
  private killsAll = 0;
  private signalAt = new Map<string, number>();
  private repeats = new Map<string, number>();

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

  /** A hero was knocked out (and by whom, when a foe hurt them just before). */
  down(p: Player, zone: string) {
    for (const k of [`${p.slot}`, `${p.slot}|${zone}`]) this.downs.set(k, (this.downs.get(k) ?? 0) + 1);
    const last = this.lastHurt(p.slot);
    this.add('down', p, `knocked out in ${zoneName(zone)}${last && last.ago <= BLAME ? ` by ${last.foe}` : ''}`);
  }

  killed(zone: string, key: string) {
    this.kills.set(key, (this.kills.get(key) ?? 0) + 1);
    this.killsAt ||= this.clock;
    this.killsIn.set(zone, (this.killsIn.get(zone) ?? 0) + 1);
    this.killsAll++;
  }

  /** A foe hurt a hero. */
  hurt(p: Player, kind: string, damage: number) {
    const list = this.taken.get(p.slot) ?? [];
    list.push({ t: this.clock, dmg: damage, foe: MOB_KINDS[kind]?.name ?? kind });
    this.taken.set(p.slot, list);
  }

  /** The party hurt a foe. */
  dealt(damage: number) {
    this.dealtLately.push({ t: this.clock, dmg: damage });
  }

  private lastHurt(slot: number): { foe: string; ago: number } | null {
    const hit = this.taken.get(slot)?.at(-1);
    return hit ? { foe: hit.foe, ago: Math.round((this.clock - hit.t) * 10) / 10 } : null;
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
    this.taken.clear();
    this.dealtLately = [];
    this.downs.clear();
    this.killsIn.clear();
    this.killsAll = 0;
    this.signalAt.clear();
    this.repeats.clear();
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
    if (kind === 'signal') {
      // The director repeats itself while a thing lasts: note it once a while, and say how many repeats it stands for.
      const last = this.signalAt.get(text);
      if (last !== undefined && this.clock - last < REPEAT_SIGNAL) {
        this.repeats.set(text, (this.repeats.get(text) ?? 0) + 1);
        return;
      }
      this.signalAt.set(text, this.clock);
      const more = this.repeats.get(text);
      this.repeats.delete(text);
      if (more) text = `${text} (+${more} repeats since)`;
    }
    if (this.kills.size) this.flushKills();
    const full = kind === 'said' || kind === 'ask' || kind === 'note' || kind === 'down';
    const entry = this.log.add(this.clock, kind, p?.slot ?? 0, text, this.snapshot(p, full));
    console.info(reportLine(entry));
  }

  /** The state of the game now, for `p`; for the table (no `p`) the player in the worst shape stands for it. */
  snapshot(p: Player | null, full = true): ReportState {
    const party = this.arena.partyAll();
    const fracs = party.map((q) => q.hero.stats.hp / Math.max(1, q.hero.stats.maxHp));
    const who =
      p ??
      party.reduce<Player | null>(
        (w, q) => (!w || q.hero.stats.hp / q.hero.stats.maxHp < w.hero.stats.hp / w.hero.stats.maxHp ? q : w),
        null,
      );
    const zone = who?.zone ?? '';
    const t = this.arena.task;
    const round = (n: number) => Math.round(n * 100) / 100;
    const hero = who?.hero;
    const s = hero?.stats;
    // lately: drop what is older than the window, then add up
    const cut = this.clock - LATELY;
    for (const list of this.taken.values()) while (list[0] && list[0].t < cut) list.shift();
    while (this.dealtLately[0] && this.dealtLately[0].t < cut) this.dealtLately.shift();
    return {
      who: p ? seatName(p.slot) : '-',
      level: s?.level ?? 0,
      hp: Math.round(s?.hp ?? 0),
      maxHp: s?.maxHp ?? 0,
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
      ...(full && who && hero ? { detail: this.detail(who) } : {}),
      breather: this.breathing(),
      stall: Math.round((who && this.counters.get(who.slot)?.stalled) || 0),
      recent: this.log.recent,
    };
  }

  /** The whole fight for `who`: the hero as they are, how fighting has gone, the zone, each kind of foe in it. */
  private detail(who: Player): StateDetail {
    const hero = who.hero;
    const s = hero.stats;
    // lately: drop what is older than the window, then add up
    const cut = this.clock - LATELY;
    for (const list of this.taken.values()) while (list[0] && list[0].t < cut) list.shift();
    while (this.dealtLately[0] && this.dealtLately[0].t < cut) this.dealtLately.shift();
    const mine = this.taken.get(who.slot) ?? [];
    const by: Record<string, number> = {};
    for (const h of mine) by[h.foe] = (by[h.foe] ?? 0) + 1;
    const band = zoneLevels(who.zone);
    const z = this.arena.zones.get(who.zone);
    return {
      hero: {
        attack: s.attack,
        attackGear: gearAttack(hero),
        power: attackPower(hero),
        defense: s.defense,
        defenseGear: gearDefense(hero),
        armor: defensePower(hero),
        magic: s.magic,
        mp: Math.round(s.mp),
        maxMp: s.maxMp,
        xp: [s.xp, xpToNext(s.level)],
        weapon: hero.weapon.name,
        worn: wornGear(hero)
          .filter((i) => i !== hero.weapon)
          .map((i) => i.name),
        potions: hero.pack.filter((i) => i.use && i.use.hp > 0).length,
        food: Math.round(hero.needs.food),
        water: Math.round(hero.needs.water),
        gold: hero.gold,
        skills: [...hero.skills],
      },
      fight: {
        downs: this.downs.get(`${who.slot}`) ?? 0,
        downsHere: this.downs.get(`${who.slot}|${who.zone}`) ?? 0,
        killsHere: this.killsIn.get(who.zone) ?? 0,
        kills: this.killsAll,
        taken: mine.reduce((a, h) => a + h.dmg, 0),
        hitsTaken: mine.length,
        dealt: this.dealtLately.reduce((a, h) => a + h.dmg, 0),
        by,
        lastHurtBy: this.lastHurt(who.slot),
        pressure: this.arena.pressure,
      },
      place: {
        band: band ? [band[0], band[1]] : null,
        alive: z?.mobs.filter((m) => m.alive).length ?? 0,
        total: z?.mobs.length ?? 0,
      },
      foes: this.foesFor(who),
    };
  }

  /** The kinds of foe in the player's zone, those nearest first, each as this player (and a typical hero of their level) would fight it. */
  private foesFor(p: Player): FoeFacts[] {
    const z = this.arena.zones.get(p.zone);
    if (!z) return [];
    const typical = heroModel(p.hero.stats.level);
    const real = { hp: p.hero.stats.maxHp, power: attackPower(p.hero), defense: defensePower(p.hero) };
    const byKind = new Map<string, FoeFacts>();
    for (const m of z.mobs) {
      if (!m.alive) continue;
      const key = mobKey(m.kind) ?? m.kind.name;
      let f = byKind.get(key);
      if (!f) {
        const foe = { hp: m.kind.maxHp, attack: m.kind.attack, defense: m.kind.defense };
        f = {
          name: m.kind.name,
          count: 0,
          near: 0,
          maxHp: m.kind.maxHp,
          attack: m.kind.attack,
          defense: m.kind.defense,
          xp: m.kind.xp,
          ...duelWith(foe, real),
          verdict: verdictOf(duelWith(foe, real)),
          typical: verdictOf(duelWith(foe, { hp: typical.hp, power: typical.power, defense: typical.defense })),
        };
        byKind.set(key, f);
      }
      f.count++;
      if (Math.hypot(m.body.x - p.body.x, m.body.y - p.body.y) <= NEAR_CELLS * CELL) f.near++;
    }
    return [...byKind.values()].sort((a, b) => b.near - a.near || b.count - a.count).slice(0, MAX_FOES);
  }
}
