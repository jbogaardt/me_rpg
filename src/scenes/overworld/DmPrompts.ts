import type { CardOption, DmCard } from '../../hud/DmCard';
import { PRESSURES, PRESSURE_LABEL, isPressure } from '../../systems/dmPowers';
import { Director, type Suggestion } from '../../systems/dmDirector';
import { Inbox, MESSAGE_CODE, REPLIES, REQUESTS, describe, type InboxKind } from '../../systems/dmRequests';
import { playerName } from '../../systems/looks';
import { HINT_AREA, HINT_ARROW, classify } from '../../systems/dmTasks';
import { QUESTS } from '../../systems/quests';
import { PRECIPS, type Precip } from '../../systems/weather';
import { Phrasebook } from '../../systems/phrases';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import type { DmEpics } from './DmEpics';
import type { DmPowers } from './DmPowers';
import type { DmRevive } from './DmRevive';
import type { DmTasks } from './DmTasks';
import type { Story } from './Story';

/** Seconds a card waits before it goes away on its own (the game carries on); the story and a fallen player wait longer. */
const CARD_TIME = 20;
const REVIVE_TIME = 30;
/** "Not now" on a card: a breather before the director offers another. */
const SNOOZE = 25;

const HOURS: { id: string; label: string; hour: number }[] = [
  { id: 't:6', label: 'Break of day', hour: 6 },
  { id: 't:19', label: 'Dusk', hour: 19 },
  { id: 't:23', label: 'Night falls', hour: 23 },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What a card can be: everything the director suggests, and what the bar opens on demand. */
export type CardKind = Suggestion | 'sky' | 'pressure' | 'epic' | 'message' | 'suggest';

/**
 * What the Dungeon Master is asked, and when: the DM steers by reacting. `systems/dmDirector.ts` watches the party (their
 * health, how far the task has got, how long it has been quiet) and says when a card is due; this builds each card from
 * the game and carries out the pick. A card is two or three buttons: "it is going too easy: turn up the heat / stay the
 * course", "the party is struggling: ease off / stay the course", "make it interesting: a storm / foes close in", "what
 * now?: follow me / defend this ground / hunt here". The bar can open any of them on demand. It runs for whoever runs the
 * world: the online DM, or a solo player in a live world.
 */
/** What the DM says on showing the way: the area on the map first, then an arrow (several wordings, `phrases.ts`). */
const AREA_WORDS = [
  'You look lost, friends. I have marked where to search on your map.',
  'Here, let me help. Open your map: the place to look is circled.',
  'You have walked in circles long enough. Your map now shows where to look.',
  'The land is not giving it up easily. I have drawn the search on your map.',
  'No shame in asking the way. Look at your map: I have marked the ground.',
];
const ARROW_WORDS = [
  'Still nothing? Follow the arrow, then. It will not lead you wrong.',
  'Very well, I will lead you by the hand. Follow the arrow.',
  'Enough wandering. The arrow points the way now.',
  'Some places hide well. The arrow will take you straight there.',
];
const CANCEL_WORDS = [
  'Let that one go. Something else is coming.',
  'We will leave that task for another day.',
  'Forget that errand. The road has other plans for you.',
  'That task is called off. Rest a moment before the next.',
];

export class DmPrompts {
  private director = new Director();
  private phrases = new Phrasebook();
  private twists = 0;
  /** What is waiting for the DM, behind a button: the director's nudges and the players' requests (no popups). */
  private inbox = new Inbox();
  private seen = new Map<number, number>(); // the last request counter heard from each friend
  private now = 0;
  /** The seats of whoever asked for the card now up (or last up): a reply goes to them. */
  private askers: { slots: number[]; at: number } = { slots: [], at: -Infinity };

  constructor(
    private arena: Arena,
    private story: Story,
    private desk: DmDesk,
    private powers: DmPowers,
    private card: DmCard,
    private tasks: DmTasks,
    private revive: DmRevive,
    private epics: DmEpics,
  ) {
    card.onPick = (kind, id) => this.pick(kind, id);
    card.onDismiss = () => this.director.snooze(SNOOZE);
  }

  get runsWorld(): boolean {
    return this.arena.local.dm || (this.arena.role === 'solo' && this.story.live);
  }

  /** Each frame. `busy`: something else has the screen (a dialog, the menu, a door). */
  update(dt: number, busy: boolean) {
    if (!this.runsWorld) {
      if (this.card.open) this.card.hide();
      return;
    }
    this.now += dt;
    this.hear();
    this.inbox.expire(this.now);
    this.card.update(dt);
    if (this.card.kind === 'story') this.card.refresh(this.storyOptions());
    const party = this.arena.partyAll();
    const fracs = party.map((p) => p.hero.stats.hp / Math.max(1, p.hero.stats.maxHp));
    const t = this.tasks.view;
    const pace = this.tasks.pace;
    const result = this.tasks.result;
    const kind = this.director.tick(dt, {
      busy: busy || this.card.open || this.inbox.size > 0, // one thing waiting at a time: the DM catches up first
      fallen: this.revive.unoffered !== undefined,
      storyReady: this.storyReady(),
      task: t && {
        id: this.tasks.id,
        active: t.state === 'active',
        progress: t.progress,
        goal: t.goal,
        age: pace?.age ?? 0,
        sinceProgress: pace?.sinceProgress ?? 0,
        hint: pace?.hint ?? t.hint,
        finished: t.state !== 'active' && result ? classify(result) : null,
      },
      health: fracs.length ? { avg: fracs.reduce((a, b) => a + b, 0) / fracs.length, min: Math.min(...fracs) } : null,
      area: this.arena.view.name,
    });
    if (kind) this.inbox.add(kind, this.now); // it waits behind the Requests button: nothing pops up
  }

  /** Friends' requests that have come in since last looked (each friend's counter grows with each). */
  private hear() {
    if (this.arena.role !== 'host') return;
    for (const { slot, id, code, text } of this.desk.requestsHeard()) {
      if (this.seen.get(slot) === id) continue;
      this.seen.set(slot, id);
      if (code === MESSAGE_CODE) {
        if (text) this.inbox.add('message', this.now, playerName(slot), slot, text);
      } else {
        const ask = REQUESTS[code];
        if (ask) this.inbox.add(ask.kind, this.now, playerName(slot), slot);
      }
    }
  }

  /** What waits for the DM: a count and the oldest in words, for the button. */
  get waiting(): { count: number; first: string } {
    const first = this.inbox.list[0];
    return { count: this.inbox.size, first: first ? describe(first) : '' };
  }

  /**
   * What the DM could do right now, written from how things stand (the Suggest button): what is waiting in the inbox first,
   * then what fits the party's health, the quest and the story. Never more than five.
   */
  suggestions(): { kind: InboxKind; label: string }[] {
    const out: { kind: InboxKind; label: string }[] = [];
    const add = (kind: InboxKind, label: string) => {
      if (!out.some((o) => o.kind === kind)) out.push({ kind, label });
    };
    for (const item of this.inbox.list) if (item.kind !== 'message') add(item.kind, describe(item));
    if (this.revive.fallen.length) add('revive', 'Someone has fallen: raise them?');
    if (this.hasStory) add('story', 'Choose where the story goes next');
    const party = this.arena.partyAll();
    const fracs = party.map((p) => p.hero.stats.hp / Math.max(1, p.hero.stats.maxHp));
    const min = fracs.length ? Math.min(...fracs) : 1;
    const avg = fracs.length ? fracs.reduce((a, b) => a + b, 0) / fracs.length : 1;
    const t = this.tasks.view;
    const pace = this.tasks.pace;
    if (min < 0.5) add('struggle', 'The party is hurt: ease off?');
    if (t?.state === 'active') {
      if (avg >= 0.8) add('easy', 'They are in fine shape: turn up the heat?');
      if (pace && pace.hint < HINT_ARROW && pace.sinceProgress >= 45)
        add('lost', 'No progress for a while: show the way?');
      add('twist', 'Make it more interesting');
    } else {
      add('epic', 'Begin an epic quest across lands and people');
    }
    add('sky', 'Change the sky');
    return out.slice(0, 5);
  }

  /** Something for the director's own use: a nudge goes in the inbox (the epic ending asks the story's next road). */
  suggest(kind: InboxKind) {
    if (kind === 'story' && !this.hasStory) return;
    this.inbox.add(kind, this.now);
  }

  /** Can the DM answer someone now (the bar's Reply button)? */
  get canReply(): boolean {
    return this.askers.slots.length > 0 && this.now - this.askers.at < 180;
  }

  /** The DM answers whoever asked for the card now up, with their own words, privately. */
  reply(text: string): boolean {
    return this.canReply && this.desk.replyTo(this.askers.slots, text);
  }

  /** The DM taps Requests: the oldest suggestion becomes a card (one that no longer applies is skipped). */
  openInbox() {
    for (let item = this.inbox.take(); item; item = this.inbox.take()) {
      if (item.kind === 'message') {
        this.askers = { slots: item.slots, at: this.now };
        this.card.show({
          kind: 'message',
          title: `${item.from.join(' & ')} says`,
          note: `“${item.text ?? ''}”`,
          options: [...this.replyOptions(), { id: '@quest', label: 'Give them a quest' }],
          seconds: null,
        });
        return;
      }
      this.open(item.kind);
      if (this.card.open) {
        if (item.slots.length) {
          this.askers = { slots: item.slots, at: this.now };
          this.card.setNote(`${item.from.join(' & ')} asked: ${describe(item).split(': ')[1] ?? ''}.`);
          this.card.refresh([...this.card.options, ...this.replyOptions()]); // and the DM may answer them
        }
        return;
      }
    }
  }

  /** Canned answers to whoever asked. */
  private replyOptions(): CardOption[] {
    return REPLIES.slice(0, 3).map((r, i) => ({ id: `r:${i}`, label: `Reply: ${r}` }));
  }

  /** Is there a live story whose next step the DM may choose? */
  get hasStory(): boolean {
    const view = this.story.view();
    return !!view && !view.complete && view.options.length > 0 && this.story.canChoose;
  }

  /** The party has finished every task told so far and there is a road to take. */
  private storyReady(): boolean {
    if (!this.hasStory) return false;
    const done = Math.max(0, ...this.arena.partyAll().map((p) => p.hero.quests.stage));
    return done >= QUESTS.length;
  }

  /** Put a card up now. */
  open(kind: CardKind, note = '') {
    if (!this.runsWorld) return;
    if (kind !== 'pressure' && kind !== 'message' && kind !== 'suggest') this.inbox.drop(kind); // asked for by hand: no longer waiting
    const show = (title: string, options: CardOption[], seconds: number | null = CARD_TIME, text = note) =>
      this.card.show({ kind, title, note: text, options, seconds });
    switch (kind) {
      case 'story': {
        const view = this.story.view();
        if (!view || view.complete || !view.options.length) return;
        show(
          'Where does the story go next?',
          this.storyOptions(),
          null,
          note || `${view.title}: ${view.placed.length} of ${view.total} lands`,
        );
        return;
      }
      case 'revive': {
        const f = this.revive.unoffered ?? this.revive.fallen[0];
        if (!f) return;
        f.offered = true;
        show(
          `${f.name} has fallen`,
          [
            { id: `where:${f.slot}`, label: 'Raise them where they fell' },
            { id: `here:${f.slot}`, label: 'Bring them to me' },
            { id: `leave:${f.slot}`, label: 'Let them wake at the start' },
          ],
          REVIVE_TIME,
          'They wake at the start unless you raise them.',
        );
        return;
      }
      case 'easy':
        show(
          'It is going too easy',
          [
            { id: 'heat', label: 'Turn up the heat' },
            { id: 'stay', label: 'Stay the course' },
          ],
          CARD_TIME,
          'The party is in fine shape.',
        );
        return;
      case 'struggle':
        show(
          'The party is struggling',
          [
            { id: 'ease', label: 'Ease off' },
            { id: 'stay', label: 'Stay the course' },
          ],
          CARD_TIME,
          'They are hurt.',
        );
        return;
      case 'twist':
        show('Make it interesting', this.twistOptions(), CARD_TIME, 'Halfway there: something should happen.');
        return;
      case 'lost':
        show(
          'They seem lost',
          [
            { id: 'hint', label: this.hintLabel() },
            { id: 'stay', label: 'Let them wander' },
          ],
          CARD_TIME,
          'No progress for a long while.',
        );
        return;
      case 'done': {
        const how = this.tasks.result ? classify(this.tasks.result) : 'plain';
        show(
          how === 'rough' ? 'That was hard-won' : 'That was easy work',
          [
            how === 'rough' ? { id: 'ease', label: 'Give them a breather' } : { id: 'heat', label: 'Raise the stakes' },
            { id: 'stay', label: 'Keep the pace' },
          ],
          CARD_TIME,
          how === 'rough' ? 'Someone nearly fell, or did.' : 'Quick, and nobody was hurt.',
        );
        return;
      }
      case 'land':
        show('A new land', this.skyOptions(true), CARD_TIME, 'How does the sky look?');
        return;
      case 'sky':
        show('How does the sky look?', this.skyOptions(false));
        return;
      case 'message':
        return; // only from the inbox
      case 'suggest':
        show(
          'What could you do now?',
          this.suggestions().map((s) => ({ id: `s:${s.kind}`, label: s.label })),
          null,
          'Each opens the choice it names. Nothing happens until you pick.',
        );
        return;
      case 'next': // nothing asked of the party for a while (or they asked): the same choice as the Epic button
      case 'epic': {
        if (this.arena.role === 'client') return;
        if (this.epics.active) {
          show('An epic quest is running', this.runningOptions(), null, 'Point the way, or call the whole saga off.');
          return;
        }
        const { items, more } = this.epics.options();
        if (!items.length) {
          show('No epic quest here', [], CARD_TIME, 'Stand in open country, away from a shop, to begin one.');
          return;
        }
        show(
          'Choose an epic quest',
          [...items, ...(more ? [{ id: '@more', label: 'Other epic quests…' }] : [])],
          null,
          'Each is a chain of quests across several lands. Stars: how hard. Then how long, how many steps and lands.',
        );
        return;
      }
      case 'pressure':
        show('How hard should the world push?', this.pressureOptions());
    }
  }

  private storyOptions(): CardOption[] {
    const view = this.story.view();
    const vote = this.arena.role === 'host' ? this.desk.voteView() : null;
    const options: CardOption[] = (view?.options ?? []).map((o) => ({
      id: o.cue,
      label: vote?.open ? `${o.label}  (${vote.tally[o.cue] ?? 0} of ${vote.voters})` : o.label,
    }));
    if (vote && options.length > 1)
      options.push({ id: vote.open ? '@close' : '@ask', label: vote.open ? 'Close the vote' : 'Ask the party' });
    return options;
  }

  /** What showing the way does next: mark the area to search, then an arrow. */
  private hintLabel(): string {
    return (this.tasks.pace?.hint ?? 0) < HINT_AREA ? 'Mark the area on their map' : 'Point the way with an arrow';
  }

  /** With a quest running: a hint, and a way to call it off. */
  private runningOptions(): CardOption[] {
    return this.tasks.active
      ? [
          ...((this.tasks.pace?.hint ?? 0) < HINT_ARROW ? [{ id: 'hint', label: this.hintLabel() }] : []),
          { id: '@cancel', label: 'Call it off' },
        ]
      : [];
  }

  /** The sky: with `short` just clear, the land's own weather and night; else everything the climate allows. */
  private skyOptions(short: boolean): CardOption[] {
    const v = this.desk.dialsView();
    const precips = v.precips.slice(0, short ? 1 : 3);
    return [
      { id: 'w:', label: 'Clear skies', on: v.precip === null },
      ...precips.map((p) => ({ id: `w:${p}`, label: cap(p), on: v.precip === p })),
      ...(short ? HOURS.filter((h) => h.id === 't:23') : HOURS).map((h) => ({ id: h.id, label: h.label })),
    ];
  }

  /** Two twists, rotating through what the land allows: a storm, night, the foes closing in. */
  private twistOptions(): CardOption[] {
    const stormy = this.desk.dialsView().precips.find((p) => p === 'storm' || p === 'blizzard');
    const all: CardOption[] = [
      ...(stormy
        ? [{ id: `w:${stormy}`, label: stormy === 'storm' ? 'A storm rolls in' : 'A blizzard sweeps in' }]
        : []),
      { id: 't:23', label: 'Night falls' },
      { id: 'close', label: 'Foes close in' },
    ];
    const first = this.twists++ % all.length;
    return [all[first]!, all[(first + 1) % all.length]!];
  }

  private pressureOptions(): CardOption[] {
    return PRESSURES.map((p) => ({ id: p, label: PRESSURE_LABEL[p], on: this.arena.pressure === p }));
  }

  private pick(kind: string, id: string) {
    this.director.settled();
    if (kind === 'story') {
      if (id === '@ask') this.desk.openVote(this.story.view()?.options ?? []);
      else if (id === '@close') this.desk.closeVote();
      else {
        this.desk.closeVote(); // the DM's choice ends any vote
        this.story.choose(id);
        const note = this.story.lastNote;
        if (note)
          this.open('story', note); // it did not work: say why and keep the card
        else this.card.hide();
      }
      return;
    }
    if (id.startsWith('r:')) {
      this.desk.replyTo(this.askers.slots, REPLIES[Number(id.slice(2))] ?? '');
      return; // the card stays: answering is not deciding
    }
    if (id.startsWith('s:')) {
      this.card.hide();
      this.open(id.slice(2) as CardKind);
      return;
    }
    if (id === '@more') {
      this.epics.turnPage();
      this.open('epic');
      return;
    }
    this.card.hide();
    if (id === '@quest') this.open('next');
    else if (id.startsWith('e:')) this.epics.begin(Number(id.slice(2)));
    else if (kind === 'revive') {
      const [how, slot] = id.split(':');
      const n = Number(slot);
      if (how === 'where') this.revive.raiseWhere(n);
      else if (how === 'here') this.revive.bringHere(n);
      else this.revive.leave(n);
    } else if (id === 'heat') {
      this.powers.heat();
    } else if (id === 'ease') {
      this.powers.easeOff();
    } else if (id === 'close') {
      this.powers.closeIn();
    } else if (id === '@cancel') {
      this.tasks.cancel();
      this.desk.say(this.phrases.pick('cancel', CANCEL_WORDS));
    } else if (id === 'hint') {
      const arrow = (this.tasks.pace?.hint ?? 0) >= HINT_AREA;
      this.tasks.giveHint();
      this.desk.say(this.phrases.pick(arrow ? 'arrow' : 'area', arrow ? ARROW_WORDS : AREA_WORDS));
    } else if (id.startsWith('w:')) {
      const precip = id.slice(2);
      const valid = precip === '' ? null : (PRECIPS as readonly string[]).includes(precip) ? (precip as Precip) : null;
      this.desk.setWeather(valid, valid === 'storm' || valid === 'blizzard' ? 1 : valid ? 0.5 : 0);
    } else if (id.startsWith('t:')) {
      const hour = HOURS.find((h) => h.id === id)?.hour;
      if (hour !== undefined) this.desk.setHour(hour);
    } else if (isPressure(id)) this.powers.setPressure(id);
    // "stay the course" (or anything else) changes nothing
  }

  reset() {
    this.askers = { slots: [], at: -Infinity };
    this.director.reset();
    this.phrases.reset();
    this.inbox.clear();
    this.seen.clear();
    this.card.hide();
  }
}
