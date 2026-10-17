import type { ContentManager } from '../../content/ContentManager';
import { allOffers, offerFor } from '../../systems/dmQuests';
import { cleanNote } from '../../systems/dmBrief';
import { MEET_WORDS, SAGA_LOST_WORDS, SAGA_OFF_WORDS, SAGA_QUIET_WORDS, TALK_NUDGE_WORDS } from '../../systems/dmVoice';
import { Phrasebook } from '../../systems/phrases';
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
import { openGroundBeside, openGroundNear, pickLook } from '../../systems/dmPeople';
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

/** How long (s) each line of the DM's closing words stays before the next. */
const SPEECH = 4;

/** How long (s) after a person has been spoken to before the saga goes on (time to read what they said). */
const SETTLE = 5;

/** How long (s) a party may stand by a person without speaking to them before the DM says so, and how long between reminders. */
const TALK_NUDGE = 20;

/** How long (s) the saga waits for a word with a person before it goes on without one (it is never left hanging). */
const TALK_GIVE_UP = 150;

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
  private run: {
    plan: EpicPlan;
    step: number;
    next: boolean;
    /** The DM's closing words: the lines still to say and the seconds until the next (then the saga is complete). */
    speech: { lines: string[]; wait: number } | null;
    /**
     * The party has reached a person and waits to be spoken to: who (their id and name), the seconds left once they have
     * been (null before), and how long they have stood unspoken to, and when the DM next reminds them.
     */
    talk: { id: string; name: string; settle: number | null; idle: number; nudge: number } | null;
    /** The id the world gave each person made so far (by their key in the epic). */
    ids: Map<string, string>;
  } | null = null;
  private phrases = new Phrasebook();
  private offered: EpicPlan[] = [];
  private turn = 0;
  private page = 0;
  /** How many sagas the party has finished (not lost or called off): the DM bot reads it to tell a won saga from an ended one. */
  completed = 0;
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
      haven: (z) => !!this.story?.isHaven(z),
    };
    tasks.onFinish = (state) => {
      const run = this.run;
      if (!run) return;
      if (state !== 'done') return this.end(this.phrases.pick('lost', SAGA_LOST_WORDS), 'a step was lost');
      const step = run.plan.epic.steps[run.step];
      if (step?.kind === 'meet') return this.meet(run, step); // they speak when talked to, then the epic goes on
      this.advance(run);
    };
    tasks.onCancel = () => {
      if (this.run) this.end(this.phrases.pick('off', SAGA_OFF_WORDS), 'called off');
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

  /**
   * The sagas this land can start, a page of them: `more` says a later page exists, `back` that this is not the first.
   * Pages never wrap and never overlap, so no list is shown twice in a row (the DM's card names the page it is on).
   */
  options(): { items: EpicOffer[]; more: boolean; back: boolean; page: number; pages: number } {
    const all = epicsFrom(this.arena.view.name, this.graph, this.turn, this.stock(), this.canMake);
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    this.page = Math.min(Math.max(0, this.page), pages - 1);
    const shown = all.slice(this.page * PAGE, (this.page + 1) * PAGE);
    this.offered = shown.map((s) => s.plan);
    return {
      items: shown.map((s, i) => ({ id: `e:${i}`, label: `${s.plan.epic.title}\n${gaugeText(s.gauge)}` })),
      more: this.page < pages - 1,
      back: this.page > 0,
      page: this.page,
      pages,
    };
  }

  /** Can people be made here? Only the one who writes a live world (solo, or the online host) can. */
  private get canMake(): boolean {
    return !!this.story?.canChoose;
  }

  /** Turn to the next page of sagas (`by` -1: the one before; `options` keeps it in range). */
  turnPage(by = 1) {
    this.page += by;
  }

  /** Start browsing again from the first page (a card opened afresh). */
  firstPage() {
    this.page = 0;
  }

  /** The DM begins the saga at `index` of the last options. False if one is running or there is no game to tell it in. */
  begin(index: number): boolean {
    const plan = this.offered[index];
    if (!plan || this.run || this.arena.role === 'client' || this.tasks.active) return false;
    this.turn++;
    this.run = { plan, step: 0, next: true, speech: null, talk: null, ids: new Map() };
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
    this.run = { plan, step: 0, next: true, speech: null, talk: null, ids: new Map() };
    this.desk.say(cleanSay(`${epic.title}. ${epic.opening}`));
    return { ok: true, note: '' };
  }

  /** Call it off. */
  cancel() {
    if (!this.run) return;
    this.end(this.phrases.pick('off', SAGA_OFF_WORDS), 'called off');
    this.tasks.cancel(false);
  }

  /** Each frame: when the last step is over and cleared away, begin the next. */
  update(dt = 0) {
    const run = this.run;
    if (run?.speech) return this.speak(run, run.speech, dt);
    if (run?.talk) return this.waitForWord(run, run.talk, dt);
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
        ? (this.person(run, step, zone, z) ?? this.choose(allOffers(this.tasks.landOf(z)), 'meet', run.step)) // nowhere to put them: another errand in their stead
        : step.objective
          ? offerFor(this.tasks.landOf(z), step.objective) // named outright: this foe, these sites, that place
          : this.choose(allOffers(this.tasks.landOf(z)), step.kind, run.step);
    if (!offer) return this.end(this.phrases.pick('quiet', SAGA_QUIET_WORDS), 'the land had nothing more to ask');
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
    const known = step.who ? run.ids.get(step.who) : undefined;
    let cell: { col: number; row: number } | null = null;
    if (!known) {
      const land = this.tasks.landOf(z);
      const spawn = { body: { x: (z.data.spawn.col + 0.5) * CELL, y: (z.data.spawn.row + 0.5) * CELL } };
      const spot = land.spot();
      cell =
        (step.at === 'haven' && this.story?.isHaven(zone) ? this.byShop(z, run.step + this.turn) : null) ??
        (spot
          ? { col: Math.floor(spot.x / CELL), row: Math.floor(spot.y / CELL) }
          : openGroundNear(z.collision, [spawn]));
      const look = story.world ? pickLook(story.world.lookOptions(), person.look, run.step) : null;
      if (!cell || !look) return undefined;
      const id = story.bring({ name: person.name, look, lines: person.lines }, region, cell.col, cell.row);
      if (!id || story.lastNote) return undefined;
      if (step.who) run.ids.set(step.who, id);
    }
    // met before: they are where they were left, and the party is sent back to them
    const folk = z.folk.find((f) => f.name === person.name);
    if (!folk && !cell) return undefined;
    const at = folk ? { x: folk.body.x, y: folk.body.y } : { x: (cell!.col + 0.5) * CELL, y: (cell!.row + 1) * CELL };
    return { kind: 'visit', title: `Find ${person.name}`, zone, goal: 1, what: person.name, ...at };
  }

  /** A free cell beside one of a town's shop doors (which one varies from saga to saga), where its shopkeeper-folk stand. */
  private byShop(z: ZoneState, n: number): { col: number; row: number } | null {
    const shops = z.data.doors.filter((d) => !d.dir && !this.graph.open(d.to.zone));
    for (let i = 0; i < shops.length; i++) {
      const door = shops[(n + i) % shops.length]!;
      const cell = openGroundBeside(z.collision, door);
      if (cell) return cell;
    }
    return null;
  }

  /**
   * The party has reached the person. They say what the step gives them when the party talks to them (their own dialog, not
   * the DM's voice): the lines are put on them, and the epic goes on once someone has (`talked`).
   */
  private meet(run: NonNullable<DmEpics['run']>, step: EpicStep) {
    const person = step.who ? run.plan.epic.people?.[step.who] : undefined;
    const id = step.who ? run.ids.get(step.who) : undefined;
    if (!id) return this.advance(run);
    const lines = [...(step.says ?? [])];
    if (step.gives) lines.push(`${person?.name ?? 'They'} gives you ${step.gives}. Keep it safe.`);
    this.story?.voice(id, lines);
    run.talk = { id, name: person?.name ?? 'them', settle: null, idle: 0, nudge: TALK_NUDGE };
    this.desk.say(
      cleanSay(
        this.phrases.pick(
          'meet',
          MEET_WORDS.map((w) => w(person?.name ?? 'Someone')),
        ),
      ),
    );
  }

  /** A party member talked to the person `entity`: if the saga waits for them, they have had their say, and the saga goes on shortly. */
  talked(entity: string) {
    const run = this.run;
    if (!run?.talk || run.talk.settle !== null || run.talk.id !== entity) return;
    const step = run.plan.epic.steps[run.step];
    const who = step?.who;
    this.say(run, who, who ? run.plan.epic.people?.[who]?.after : undefined); // from now on they speak of what has happened
    run.talk.settle = SETTLE;
  }

  /** The party stands by a person: once they have spoken, go on shortly; if nobody does, remind them, and in the end go on anyway. */
  private waitForWord(
    run: NonNullable<DmEpics['run']>,
    t: NonNullable<NonNullable<DmEpics['run']>['talk']>,
    dt: number,
  ) {
    const done = () => {
      run.talk = null;
      this.advance(run);
    };
    if (t.settle !== null) {
      if ((t.settle -= dt) <= 0) done();
      return;
    }
    t.idle += dt;
    const zone = this.arena.zones.get(run.plan.zones[run.step]!);
    if (t.idle >= TALK_NUDGE && zone && !zone.folk.some((f) => f.name === t.name)) return done(); // nobody there to speak to
    if (t.idle >= TALK_GIVE_UP) return done();
    if (t.idle >= t.nudge) {
      t.nudge += TALK_NUDGE;
      this.desk.say(
        cleanSay(
          this.phrases.pick(
            'talk',
            TALK_NUDGE_WORDS.map((w) => w(t.name)),
          ),
        ),
      );
    }
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
    this.complete(run.plan);
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
      // a hunt takes the foe that best matches the party (offers come best first); the rest vary from step to step
      if (of.length) return k === 'hunt' ? of[0] : of[(n + this.turn) % of.length];
    }
    return undefined;
  }

  /** A person of the epic says something else from now on (their lines are a log entry, so friends have them too). */
  private say(run: NonNullable<DmEpics['run']>, who: string | undefined, lines: string[] | undefined) {
    const id = who ? run.ids.get(who) : undefined;
    if (id && lines) this.story?.voice(id, lines);
  }

  /**
   * The last step is done: the closing scene. The DM tells how it ended and names the reward, so the party knows what they
   * did and what they got (the people of the saga are glad in their own words, when talked to: `complete` gives them
   * their `finished` lines). Then it is complete.
   */
  private close(run: NonNullable<DmEpics['run']>) {
    const { epic } = run.plan;
    const { xp, gold } = epicReward(run.plan, this.tasks.level);
    const party = this.arena.partyAll();
    // Each hero is handed a piece of gear for what they wear (varied by slot, in the pack if they cannot wear it now).
    const gifts = party.flatMap((p) => this.tasks.gift(p, this.turn) ?? []);
    const given = gifts.length ? ` And for your trouble: ${[...new Set(gifts)].join(', ')}.` : '';
    // the reward has a line of its own, so a long ending is never cut short by it
    const lines = [epic.ending, `You each earn ${xp} XP and ${gold} gold.${given}`].filter(Boolean);
    run.speech = { lines, wait: 0 };
    for (const p of party) this.sim.reward(p, xp, gold);
  }

  private complete(plan: EpicPlan) {
    const run = this.run;
    if (run) for (const [who, person] of Object.entries(plan.epic.people ?? {})) this.say(run, who, person.finished);
    this.run = null;
    this.tasks.setEpic(null);
    this.completed++;
    this.onDone();
  }

  /**
   * The saga stops short (a step lost, the DM calling it off, a land with nothing left to ask): the DM says so plainly, with
   * how far it got and that it paid nothing, and the page logs it. A saga never just vanishes (a beta run lost one at
   * chapter 2 with no word of it). Callers must not `say` anything after this: the newest words replace these.
   */
  private end(words: string, why: string) {
    const run = this.run;
    this.run = null;
    this.tasks.setEpic(null);
    if (!run) {
      this.desk.say(words);
      return;
    }
    const { title, steps } = run.plan.epic;
    const at = Math.min(run.step + 1, steps.length);
    console.info(`[dm] saga “${title}” ended at step ${at} of ${steps.length} (${why})`);
    this.desk.say(`“${title}” ends at step ${at} of ${steps.length}, unfinished: no saga reward. ${words}`); // outcome first: a long line is cut at its end
  }

  reset() {
    this.run = null;
    this.offered = [];
    this.page = 0;
  }
}
