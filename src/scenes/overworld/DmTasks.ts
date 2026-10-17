import { CELL } from '../../map/types';
import { cleanNote } from '../../systems/dmBrief';
import { DONE_WORDS, FAILED_WORDS } from '../../systems/dmVoice';
import { Phrasebook } from '../../systems/phrases';
import { collect } from '../../systems/chests';
import { GEAR_KINDS, giftFor, remember, type GiftMemory } from '../../systems/dmGear';
import { RELIC_KIND, parseRelicWhat, relicsFor, type Land } from '../../systems/dmQuests';
import {
  TASK_LINGER,
  TaskBook,
  viewOf,
  type Presence,
  type QuestOffer,
  type TaskResult,
  type TaskState,
} from '../../systems/dmTasks';
import { recipesFor } from '../../systems/dmForge';
import { isGem } from '../../systems/gems';
import { ITEMS, idOfItem, itemOf } from '../../systems/items';
import { SHOPS, stockOf } from '../../systems/shops';
import type { Item } from '../../systems/combat';
import { enabled } from '../../systems/capabilities';
import { heroCombos } from '../../systems/skills';
import { SPELLS } from '../../systems/spells';
import { SITE_KINDS, mobKey } from '../../systems/quests';
import type { Player } from '../../entities/Player';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import type { Simulation } from './Simulation';
import type { ZoneState } from '../ZoneState';

/** The spells the party's wands and tomes teach in `zone` (one entry per spell, with the keys that cast it): what a mastery quest may ask for. Empty where `combos` is off. */
function masteries(party: Player[], zone: string): NonNullable<Land['combos']> {
  const out = new Map<string, { spell: string; name: string; keys: string }>();
  for (const p of party)
    for (const c of heroCombos(p.hero, zone))
      if (!c.skill && !out.has(c.spell)) out.set(c.spell, { spell: c.spell, name: SPELLS[c.spell].name, keys: c.keys });
  return [...out.values()];
}

/** What the DM says as a quest ends: their voice, to every screen (the telling of a new one is each player's own dialog). */

/** The gems a shop sells (their ids): a forge quest may send the party to buy one. */
const soldGems = (): Set<string> =>
  new Set(Object.values(SHOPS).flatMap((shop) => stockOf(shop).filter((id) => isGem(itemOf(id)))));

/** How often (s) the quest's target (the foes, the nearest site) is looked for again. */
const RETARGET = 2;

/**
 * The quest the Dungeon Master gives the party (systems/dmTasks.ts has the rules, systems/dmQuests.ts writes the offers
 * from a land), on the host: offered from the land the DM stands in, counted each frame (the party's kills of the foe,
 * the sites they touch, the relic found, a place reached), paid to the whole party when done and announced in the DM's
 * voice. Everyone sees it in their tracker, and once the DM offers the compass as its needle (`Arena.task`, a friend is told through the
 * `dm` message); the DM can point the way if they are lost. How it went (how long, how hurt, who fell) is what the
 * director reads to nudge the DM next.
 */
export class DmTasks {
  private book = new TaskBook();
  private phrases = new Phrasebook();
  private finder: Player | null = null;
  private falls = 0;
  private linger = 0;
  private retarget = 0;
  private seq = 0;
  private note = '';
  private epic: { title: string; step: number; total: number } | null = null;
  /** The slots each hero was last handed gear for (systems/dmGear.ts), so rewards rotate. */
  private memory: GiftMemory = new WeakMap();

  constructor(
    private arena: Arena,
    private sim: Simulation,
    private desk: DmDesk,
  ) {
    const kill = sim.onKill;
    sim.onKill = (zone, key) => {
      kill(zone, key);
      this.book.kill(key, zone);
    };
    const cast = sim.onCast;
    sim.onCast = (p, zone, spell) => {
      cast(p, zone, spell);
      this.book.cast(zone, spell);
    };
    const setDown = sim.onSetDown;
    sim.onSetDown = (p, zone, index, x, y) => {
      setDown(p, zone, index, x, y);
      this.book.haul(zone, index, x, y);
    };
    const defeat = sim.onDefeat;
    sim.onDefeat = (p, zone, x, y) => {
      defeat(p, zone, x, y);
      if (this.active) this.falls++;
    };
  }

  /** Which quest this is (changes with each one the DM gives). */
  get id(): number {
    return this.seq;
  }

  /** The quest as everyone sees it. */
  get view() {
    return this.arena.task;
  }

  get active(): boolean {
    return this.book.task?.state === 'active';
  }

  /** How the quest is going, for the director: how long, how long since progress, and whether the DM has pointed the way. */
  get pace(): { age: number; sinceProgress: number; hint: number } | null {
    const t = this.book.task;
    return t && t.state === 'active' ? { age: t.age, sinceProgress: t.sinceProgress, hint: t.hint } : null;
  }

  /** How the last quest went. */
  get result(): TaskResult | null {
    return this.book.result;
  }

  private presence = (p: Player): Presence => ({ zone: p.zone, x: p.body.x, y: p.body.y });

  /** The party's average level: what the DM's quests are sized and paid by. */
  get level(): number {
    const party = this.arena.partyAll();
    return party.length ? party.reduce((a, p) => a + p.hero.stats.level, 0) / party.length : 1;
  }

  /** What a loaded land holds, as the DM's quests (and a saga's steps) need to know it. */
  landOf(zone: ZoneState): Land {
    const { arena } = this;
    const party = arena.partyAll();
    const level = this.level;
    const here = party.filter((p) => p.zone === zone.name);
    const centre = here.length
      ? {
          x: here.reduce((a, p) => a + p.body.x, 0) / here.length,
          y: here.reduce((a, p) => a + p.body.y, 0) / here.length,
        }
      : zone === arena.view
        ? { x: arena.local.body.x, y: arena.local.body.y }
        : { x: (zone.data.spawn.col + 0.5) * CELL, y: (zone.data.spawn.row + 0.5) * CELL }; // nobody there yet: from where one arrives
    const mobs = arena.inZone(zone, () =>
      arena.mobs.flatMap((m) => {
        const key = m.alive && !m.kind.boss ? mobKey(m.kind) : undefined; // a boss is the quest's own, not the land's
        return key ? [{ key, name: m.kind.name, xp: m.kind.xp, x: m.body.x, y: m.body.y }] : [];
      }),
    );
    const kinds = new Map<string, { kind: string; name: string; count: number; x: number; y: number }>();
    for (const s of zone.sites) {
      const have = kinds.get(s.kind);
      if (have) have.count++;
      else kinds.set(s.kind, { kind: s.kind, name: SITE_KINDS[s.kind]?.name ?? s.kind, count: 1, x: s.x, y: s.y });
    }
    const smith = zone.keepers.find((k) => SHOPS[k.shop]?.stock.some((id) => isGem(itemOf(id))))?.body;
    return {
      zone: zone.name,
      level,
      mobs,
      sites: [...kinds.values()].filter((s) => s.kind !== RELIC_KIND),
      places: zone.data.places.map((p) => ({ name: p.name, x: (p.col + 0.5) * CELL, y: (p.row + 0.5) * CELL })),
      casters: enabled('combos', zone.name) && party.some((p) => heroCombos(p.hero, zone.name).length > 0),
      barrels: enabled('carrying', zone.name) ? zone.barrels.filter((b) => !b.carried).length : 0,
      relics: relicsFor(ITEMS, level),
      party: party.length,
      combos: masteries(party, zone.name),
      ...(enabled('forge')
        ? {
            forge: {
              recipes: recipesFor(
                party.map((p) => p.hero),
                soldGems(),
              ),
              smith,
            },
          }
        : {}),
      spot: () => {
        for (let i = 0; i < 300; i++) {
          const x = (2 + Math.floor(Math.random() * (zone.data.width - 4)) + 0.5) * CELL;
          const y = (2 + Math.floor(Math.random() * (zone.data.height - 4)) + 0.5) * CELL;
          const d = Math.hypot(x - centre.x, y - centre.y);
          if (d > 12 * CELL && d < 45 * CELL && zone.collision.fitsMap(x, y)) return { x, y };
        }
        return null;
      },
    };
  }

  /**
   * Hand `p` a piece of gear that helps them most, of a slot not given lately, in reach of the party's level (systems/dmGear.ts;
   * worn if it beats what they wear, else in the pack). `seed` varies the pick from one reward to the next. Returns its name, or
   * null when nothing would help or the pack is full.
   */
  gift(p: Player, seed: number): string | null {
    const gift = giftFor(p.hero, ITEMS, this.level, this.memory.get(p.hero) ?? [], seed);
    if (!gift) return null;
    const item = itemOf(gift.id);
    const found = collect(p.hero, { item });
    if (found.refused) return null;
    remember(this.memory, p.hero, gift.slot);
    this.arena.refreshLook(p);
    this.arena.inZone(this.arena.zoneOf(p), () => this.sim.text(p.body.x, p.body.y - 90, found.text, 0xfff0a0));
    return item.name;
  }

  /** Give a quest written elsewhere (a saga's step), with the DM's telling of it. False if one is running or there is no game to give it in. */
  start(offer: QuestOffer, note = ''): boolean {
    if (this.arena.role === 'client' || this.active) return false;
    this.book.cancel();
    if (!this.book.call(offer)) return false;
    this.finder = null;
    this.falls = 0;
    this.linger = 0;
    this.retarget = 0;
    this.seq++;
    this.note = cleanNote(note);
    this.publish();
    return true;
  }

  /** Someone set a gem in a piece, making `made`: counts for a forge quest that asks for it. */
  forged(made: Item) {
    const id = idOfItem(made);
    if (id !== undefined && this.book.forge(id)) this.publish();
  }

  /** A player touched a quest site of the land: true if it counts for the DM's quest (a gather site, or the relic). */
  touchSite(p: Player, kind: string, index: number): boolean {
    const t = this.book.task;
    if (!t || t.state !== 'active' || p.zone !== t.zone) return false;
    const counted = this.book.touch(kind, p.zone, index);
    if (counted && kind === RELIC_KIND) this.finder = p;
    return counted;
  }

  /** The DM offers the compass: toward the search area first, straight at the goal the second time. */
  giveHint() {
    this.book.giveHint();
    this.publish();
  }

  /** The DM calls it off (`byDm` false: it has only run its course). */
  cancel(byDm = true) {
    const was = this.active;
    this.book.cancel();
    this.note = '';
    this.publish();
    if (byDm && was) this.onCancel();
  }

  /** The quest's step in a saga, shown to the party with it (null when it is a quest of its own). */
  setEpic(epic: { title: string; step: number; total: number } | null) {
    this.epic = epic;
    this.publish();
  }

  /** A quest has run its course: how it ended. */
  onFinish: (state: TaskState) => void = () => {};
  /** The DM called a running quest off. */
  onCancel: () => void = () => {};

  /** The DM's own instructions for the quest running: every player is told them in place of the usual telling. */
  setNote(text: string): boolean {
    const words = cleanNote(text);
    if (this.arena.role === 'client' || !this.active || !words) return false;
    this.note = words;
    this.publish();
    return true;
  }

  update(dt: number) {
    if (this.arena.role === 'client') return;
    const task = this.book.task;
    if (!task) return;
    if (task.state !== 'active') {
      if ((this.linger -= dt) <= 0) this.cancel(false);
      return;
    }
    const party = this.arena.partyAll();
    const fracs = party.map((p) => p.hero.stats.hp / Math.max(1, p.hero.stats.maxHp));
    this.retarget -= dt;
    const at = this.retarget <= 0 ? this.target(party) : undefined;
    if (at !== undefined || this.retarget <= 0) this.retarget = RETARGET;
    const result = this.book.tick(dt, {
      party: party.map(this.presence),
      ...(at ? { at } : {}),
      health: fracs.length ? Math.min(...fracs) : 1,
      falls: this.falls,
    });
    this.falls = 0;
    this.publish();
    if (result) this.finish(result, party);
  }

  /** Where the quest leads now: the nearest living foe of the kind to the party, the nearest site not yet touched. */
  private target(party: Player[]): { x: number; y: number } | undefined {
    const t = this.book.task;
    const carrier = t?.kind === 'find' ? parseRelicWhat(t.what).carrier : undefined;
    if (!t || (t.kind !== 'hunt' && t.kind !== 'gather' && t.kind !== 'boss' && !carrier)) return undefined;
    const zone = this.arena.zones.get(t.zone);
    if (!zone) return undefined;
    if (t.kind === 'boss') {
      const boss = this.arena.inZone(zone, () => this.arena.mobs.find((m) => m.kind.boss && m.alive)); // the compass follows it
      return boss && { x: boss.body.x, y: boss.body.y };
    }
    const here = party.filter((p) => p.zone === t.zone);
    const from = here[0]?.body ?? this.arena.local.body;
    const near = (list: { x: number; y: number }[]) =>
      list.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
    if (t.kind === 'hunt' || carrier)
      return near(
        this.arena.inZone(zone, () =>
          this.arena.mobs
            .filter((m) => m.alive && mobKey(m.kind) === (carrier ?? t.what))
            .map((m) => ({ x: m.body.x, y: m.body.y })),
        ),
      );
    return near(
      zone.sites.filter((s) => s.kind === t.what && !(t.bits & (1 << s.index))).map((s) => ({ x: s.x, y: s.y })),
    );
  }

  private finish(result: TaskState, party: Player[]) {
    const t = this.book.task!;
    if (result === 'done') {
      const { xp, gold } = t.quest.reward; // scaled to the party's level when it was given
      for (const p of party) this.sim.reward(p, xp, gold);
      if (GEAR_KINDS.includes(t.kind)) for (const p of party) this.gift(p, this.seq);
      // Hook: a boss quest may also drop gear for the party here (`t.kind === 'boss'`; `upgradeFor`/`relicsFor` pick pieces).
      const finder = this.finder;
      const relic = t.kind === 'find' ? parseRelicWhat(t.what) : undefined;
      const item = relic && ITEMS[relic.item];
      // the chest's finder keeps it; the foe's drop goes to whoever of the party is in its land (kills are the party's)
      const keeper = finder ?? (relic?.carrier ? (party.find((p) => p.zone === t.zone) ?? party[0]) : undefined);
      if (keeper && relic && item) {
        const found = collect(keeper.hero, { item: itemOf(relic.item) });
        this.arena.inZone(this.arena.zoneOf(keeper), () =>
          this.sim.text(keeper.body.x, keeper.body.y - 90, found.text, 0xfff0a0),
        );
      }
    }
    if (!this.epic) this.desk.say(this.phrases.pick(result, result === 'done' ? DONE_WORDS : FAILED_WORDS));
    else if (result === 'done' && this.epic.step < this.epic.total) {
      // a saga says its own words, but a won step still tells what it paid (the last step's reward is in the closing scene)
      const { xp, gold } = t.quest.reward;
      this.desk.say(`Step ${this.epic.step} of ${this.epic.total} done. You each earn ${xp} XP and ${gold} gold.`);
    }
    this.linger = TASK_LINGER;
    this.onFinish(result);
  }

  private publish() {
    this.arena.task = this.book.task
      ? {
          ...viewOf(this.book.task),
          ...(this.note && this.active ? { note: this.note } : {}),
          ...(this.epic ? { epic: this.epic } : {}),
        }
      : null;
  }

  reset() {
    this.book.cancel();
    this.finder = null;
    this.note = '';
    this.epic = null;
    this.arena.task = null;
  }
}
