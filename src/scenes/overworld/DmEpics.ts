import type { ContentManager } from '../../content/ContentManager';
import { allOffers, offerFor } from '../../systems/dmQuests';
import { cleanNote } from '../../systems/dmBrief';
import { CELL } from '../../map/types';
import {
  epicReward,
  epicsFrom,
  gaugeText,
  needsPeople,
  planEpic,
  tellStep,
  type EpicPlan,
  type EpicStep,
  type EpicTemplate,
  type StepKind,
  type ZoneGraph,
} from '../../systems/dmEpics';
import { openGroundNear, pickLook } from '../../systems/dmPeople';
import type { QuestOffer, TaskKind } from '../../systems/dmTasks';
import { neighbours, zoneName } from '../../systems/places';
import { cleanSay } from '../../systems/dmPowers';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import type { DmTasks } from './DmTasks';
import type { Simulation } from './Simulation';
import type { Story } from './Story';
import type { Zones } from './Zones';
import type { ZoneState } from '../ZoneState';

/** A saga the DM may begin: what the card's button says and what it would do. */
export interface EpicOffer {
  id: string;
  label: string;
}

/** How many sagas one card shows. */
const PAGE = 4;

/** What a step turns to when its land has none of the kind it wants. */
/** How long (s) each line of a person's speech stays before the next. */
const SPEECH = 4;

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
  private run: {
    plan: EpicPlan;
    step: number;
    next: boolean;
    /** A person the party has reached, speaking: the lines still to say and the seconds until the next. */
    speech: { lines: string[]; wait: number } | null;
    /** The last step is done and the closing scene is being told (then the saga is complete). */
    finishing?: boolean;
    /** The id the world gave each person made so far (by their key in the epic). */
    ids: Map<string, string>;
  } | null = null;
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
    /** The live world the people of an epic are made in (none: sagas with people are not offered). */
    private story: Story | null = null,
    /** The epics on offer: the content's, and those the campaign's own file holds (asked afresh: a live world reloads its content). */
    private stock: () => EpicTemplate[] = () => [],
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
      if (state !== 'done') return this.end('The thread of the epic is lost. The saga ends here.');
      const step = run.plan.epic.steps[run.step];
      if (step?.kind === 'meet') return this.meet(run, step); // they speak first, then the epic goes on
      this.advance(run);
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
    const all = epicsFrom(this.arena.view.name, this.graph, this.turn, this.stock(), this.canMake);
    const start = (this.page * PAGE) % Math.max(1, all.length);
    const shown = all.slice(start, start + PAGE);
    this.offered = shown.map((s) => s.plan);
    return {
      items: shown.map((s, i) => ({ id: `e:${i}`, label: `${s.plan.epic.title}\n${gaugeText(s.gauge)}` })),
      more: all.length > PAGE,
    };
  }

  /** Can people be made here? Only the one who writes a live world (solo, or the online host) can. */
  private get canMake(): boolean {
    return !!this.story?.canChoose;
  }

  /** Show the next page of sagas. */
  turnPage() {
    this.page++;
  }

  /** The DM begins the saga at `index` of the last options. False if one is running or there is no game to tell it in. */
  begin(index: number): boolean {
    const plan = this.offered[index];
    if (!plan || this.run || this.arena.role === 'client' || this.tasks.active) return false;
    this.turn++;
    this.run = { plan, step: 0, next: true, speech: null, ids: new Map() };
    this.desk.say(cleanSay(`${plan.epic.title}. ${plan.epic.opening}`));
    return true;
  }

  /**
   * Begin an epic written elsewhere (an AI's, or the content's) from where the DM stands: it is read as strictly as a
   * file of epics (`parseEpic` was run by the caller) and planned onto this world like any saga.
   */
  beginEpic(epic: EpicTemplate): { ok: boolean; note: string } {
    if (this.arena.role === 'client') return { ok: false, note: 'only the host tells an epic' };
    if (this.run || this.tasks.active) return { ok: false, note: 'a quest is already running' };
    if (needsPeople(epic) && !this.canMake) return { ok: false, note: 'people can only be made in a live world' };
    const plan = planEpic(epic, this.arena.view.name, this.graph, this.turn);
    if (!plan) return { ok: false, note: 'an epic is not told in a shop' };
    this.turn++;
    this.run = { plan, step: 0, next: true, speech: null, ids: new Map() };
    this.desk.say(cleanSay(`${epic.title}. ${epic.opening}`));
    return { ok: true, note: '' };
  }

  /** Call it off. */
  cancel() {
    if (!this.run) return;
    this.end('The saga is called off.');
    this.tasks.cancel(false);
  }

  /** Each frame: when the last step is over and cleared away, begin the next. */
  update(dt = 0) {
    const run = this.run;
    if (run?.speech) return this.speak(run, run.speech, dt);
    if (!run || !run.next || this.tasks.view) return;
    const zone = run.plan.zones[run.step]!;
    const z = this.arena.zones.get(zone);
    if (!z) {
      void this.zones.ensure(zone); // nobody has been there yet: load it, and try again next frame
      return;
    }
    const step = run.plan.epic.steps[run.step]!;
    const offer =
      step.kind === 'meet'
        ? this.person(run, step, zone, z)
        : step.objective
          ? offerFor(this.tasks.landOf(z), step.objective) // named outright: this foe, these sites, that place
          : this.choose(allOffers(this.tasks.landOf(z)), step.kind, run.step);
    if (!offer) return this.end('The lands fall quiet, and the saga with them.');
    run.next = false;
    this.tasks.setEpic({ title: run.plan.epic.title, step: run.step + 1, total: run.plan.epic.steps.length });
    const from = run.step > 0 ? zoneName(run.plan.zones[run.step - 1]!) : zoneName(zone);
    this.tasks.start(offer, cleanNote(tellStep(step, zoneName(zone), from)));
  }

  /** A meeting: make the person on open ground in the step's land, and send the party to find them. */
  private person(run: NonNullable<DmEpics['run']>, step: EpicStep, zone: string, z: ZoneState): QuestOffer | undefined {
    const person = step.who ? run.plan.epic.people?.[step.who] : undefined;
    const { story } = this;
    const region = story?.regionOf(zone);
    if (!person || !story || !region) return undefined;
    const land = this.tasks.landOf(z);
    const spawn = { body: { x: (z.data.spawn.col + 0.5) * CELL, y: (z.data.spawn.row + 0.5) * CELL } };
    const cell = land.spot()
      ? { col: Math.floor(land.spot()!.x / CELL), row: Math.floor(land.spot()!.y / CELL) }
      : openGroundNear(z.collision, [spawn]);
    const look = story.world ? pickLook(story.world.lookOptions(), person.look, run.step) : null;
    if (!cell || !look) return undefined;
    const id = story.bring({ name: person.name, look, lines: person.lines }, region, cell.col, cell.row);
    if (!id || story.lastNote) return undefined;
    if (step.who) run.ids.set(step.who, id);
    const folk = z.folk.find((f) => f.name === person.name);
    const at = folk ? { x: folk.body.x, y: folk.body.y } : { x: (cell.col + 0.5) * CELL, y: (cell.row + 1) * CELL };
    return { kind: 'visit', title: `Find ${person.name}`, zone, goal: 1, what: person.name, ...at };
  }

  /** The party has reached the person: they speak, a line at a time, and then the epic goes on. */
  private meet(run: NonNullable<DmEpics['run']>, step: EpicStep) {
    const person = step.who ? run.plan.epic.people?.[step.who] : undefined;
    const lines = (step.says ?? []).map((l) => `${person?.name ?? 'Someone'}: “${l}”`);
    if (step.gives) lines.push(`${person?.name ?? 'They'} gives you ${step.gives}. Keep it safe.`);
    this.say(run, step.who, person?.after); // from now on they speak of what has happened
    run.speech = { lines, wait: 0 };
  }

  private speak(run: NonNullable<DmEpics['run']>, speech: { lines: string[]; wait: number }, dt: number) {
    if ((speech.wait -= dt) > 0) return;
    const line = speech.lines.shift();
    if (line !== undefined) {
      this.desk.say(cleanSay(line));
      speech.wait = SPEECH;
      return;
    }
    run.speech = null;
    if (run.finishing) this.complete(run.plan);
    else this.advance(run);
  }

  private advance(run: NonNullable<DmEpics['run']>) {
    run.step++;
    if (run.step >= run.plan.epic.steps.length) this.close(run);
    else run.next = true;
  }

  /** The step's quest: one of its kind if the land has one, else the first kind it does have. */
  private choose(offers: QuestOffer[], kind: StepKind, n: number): QuestOffer | undefined {
    for (const k of kind === 'meet' ? FALLBACK : [kind, ...FALLBACK]) {
      const of = offers.filter((o) => o.kind === k);
      if (of.length) return of[(n + this.turn) % of.length];
    }
    return undefined;
  }

  /** A person of the epic says something else from now on (their lines are a log entry, so friends have them too). */
  private say(run: NonNullable<DmEpics['run']>, who: string | undefined, lines: string[] | undefined) {
    const id = who ? run.ids.get(who) : undefined;
    if (id && lines) this.story?.voice(id, lines);
  }

  /**
   * The last step is done: the closing scene. A person of the saga (the last the party met) is glad and says so, the DM
   * tells how it ended, and the reward is named, so the party knows what they did and what they got. Then it is complete.
   */
  private close(run: NonNullable<DmEpics['run']>) {
    const { epic } = run.plan;
    const { xp, gold } = epicReward(run.plan);
    const last = Object.values(epic.people ?? {}).at(-1);
    const thanks = last?.finished?.[0] ? `${last.name}: “${last.finished[0]}”` : '';
    const lines = [thanks, `${epic.ending} You each earn ${xp} XP and ${gold} gold.`].filter(Boolean);
    run.finishing = true;
    run.speech = { lines, wait: 0 };
    for (const p of this.arena.partyAll()) this.sim.reward(p, xp, gold);
  }

  private complete(plan: EpicPlan) {
    const run = this.run;
    if (run) for (const [who, person] of Object.entries(plan.epic.people ?? {})) this.say(run, who, person.finished);
    this.run = null;
    this.tasks.setEpic(null);
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
