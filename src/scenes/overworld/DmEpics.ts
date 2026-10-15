import type { ContentManager } from '../../content/ContentManager';
import { allOffers } from '../../systems/dmQuests';
import { cleanNote } from '../../systems/dmBrief';
import { epicReward, epicsFrom, gaugeText, tellStep, type EpicPlan, type ZoneGraph } from '../../systems/dmEpics';
import type { QuestOffer, TaskKind } from '../../systems/dmTasks';
import { neighbours, zoneName } from '../../systems/places';
import { cleanSay } from '../../systems/dmPowers';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import type { DmTasks } from './DmTasks';
import type { Simulation } from './Simulation';
import type { Zones } from './Zones';

/** A saga the DM may begin: what the card's button says and what it would do. */
export interface EpicOffer {
  id: string;
  label: string;
}

/** How many sagas one card shows. */
const PAGE = 4;

/** What a step turns to when its land has none of the kind it wants. */
const FALLBACK: TaskKind[] = ['hunt', 'visit', 'gather', 'find'];

/**
 * Epic quests, on the host (systems/dmEpics.ts has the sagas and their gauge): a saga is a chain of the DM's ordinary
 * quests (`DmTasks`) that carries the party across several lands. Begun from the DM's card, planned onto this world's
 * lands from where the DM stands, each step is a quest written from its land (`DmTasks.landOf`, the land loaded first if
 * nobody has been there), told to the party in the saga's own words, and the next begins when the last is done. The party
 * is pointed to the next land by the door that leads there. A step the party fails, or a DM who calls it off, ends the saga.
 * The whole party is paid for the saga on top of its steps. Everyone sees it through the quest's `epic` (the tracker).
 */
export class DmEpics {
  private run: { plan: EpicPlan; step: number; next: boolean } | null = null;
  private offered: EpicPlan[] = [];
  private turn = 0;
  private page = 0;
  /** A saga finished: the party did it all. */
  onDone: () => void = () => {};

  private graph: ZoneGraph;

  constructor(
    private arena: Arena,
    private zones: Zones,
    content: ContentManager,
    private tasks: DmTasks,
    private desk: DmDesk,
    private sim: Simulation,
  ) {
    this.graph = {
      neighbours,
      open: (z) => {
        const biome = content.biomeOfMap(z)?.[1];
        return !!biome && biome.climate !== null;
      },
    };
    tasks.onFinish = (state) => {
      const run = this.run;
      if (!run) return;
      if (state !== 'done') return this.end('The thread of the tale is lost. The saga ends here.');
      run.step++;
      if (run.step >= run.plan.epic.steps.length) this.complete(run.plan);
      else run.next = true;
    };
    tasks.onCancel = () => {
      if (this.run) this.end('The saga is called off.');
    };
  }

  /** Is a saga running? */
  get active(): boolean {
    return this.run !== null;
  }

  /** Where the saga stands, for the DM's card. */
  get view(): { title: string; step: number; total: number } | null {
    const run = this.run;
    return (
      run && {
        title: run.plan.epic.title,
        step: Math.min(run.step + 1, run.plan.epic.steps.length),
        total: run.plan.epic.steps.length,
      }
    );
  }

  /** The sagas this land can start (a page of them; `more` says there are others to turn to). */
  options(): { items: EpicOffer[]; more: boolean } {
    const all = epicsFrom(this.arena.view.name, this.graph, this.turn);
    const start = (this.page * PAGE) % Math.max(1, all.length);
    const shown = all.slice(start, start + PAGE);
    this.offered = shown.map((s) => s.plan);
    return {
      items: shown.map((s, i) => ({ id: `e:${i}`, label: `${s.plan.epic.title}\n${gaugeText(s.gauge)}` })),
      more: all.length > PAGE,
    };
  }

  /** Show the next page of sagas. */
  turnPage() {
    this.page++;
  }

  /** The DM begins the saga at `index` of the last options. False if one is running or there is no game to tell it in. */
  begin(index: number): boolean {
    const plan = this.offered[index];
    if (!plan || this.run || this.arena.role !== 'host' || this.tasks.active) return false;
    this.turn++;
    this.run = { plan, step: 0, next: true };
    this.desk.say(cleanSay(`${plan.epic.title}. ${plan.epic.opening}`));
    return true;
  }

  /** Call it off. */
  cancel() {
    if (!this.run) return;
    this.end('The saga is called off.');
    this.tasks.cancel(false);
  }

  /** Each frame: when the last step is over and cleared away, begin the next. */
  update() {
    const run = this.run;
    if (!run || !run.next || this.tasks.view) return;
    const zone = run.plan.zones[run.step]!;
    const z = this.arena.zones.get(zone);
    if (!z) {
      void this.zones.ensure(zone); // nobody has been there yet: load it, and try again next frame
      return;
    }
    const step = run.plan.epic.steps[run.step]!;
    const offers = allOffers(this.tasks.landOf(z));
    const offer = this.choose(offers, step.kind, run.step);
    if (!offer) return this.end('The lands fall quiet, and the saga with them.');
    run.next = false;
    this.tasks.setEpic({ title: run.plan.epic.title, step: run.step + 1, total: run.plan.epic.steps.length });
    const from = run.step > 0 ? zoneName(run.plan.zones[run.step - 1]!) : zoneName(zone);
    this.tasks.start(offer, cleanNote(tellStep(step, zoneName(zone), from)));
  }

  /** The step's quest: one of its kind if the land has one, else the first kind it does have. */
  private choose(offers: QuestOffer[], kind: TaskKind, n: number): QuestOffer | undefined {
    for (const k of [kind, ...FALLBACK]) {
      const of = offers.filter((o) => o.kind === k);
      if (of.length) return of[(n + this.turn) % of.length];
    }
    return undefined;
  }

  private complete(plan: EpicPlan) {
    this.run = null;
    this.tasks.setEpic(null);
    const { xp, gold } = epicReward(plan);
    for (const p of this.arena.partyAll()) this.sim.reward(p, xp, gold);
    this.desk.say(cleanSay(plan.epic.ending));
    this.onDone();
  }

  private end(words: string) {
    this.run = null;
    this.tasks.setEpic(null);
    this.desk.say(words);
  }

  reset() {
    this.run = null;
    this.offered = [];
    this.page = 0;
  }
}
