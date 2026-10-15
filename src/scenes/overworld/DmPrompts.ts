import type { CardOption, DmCard } from '../../hud/DmCard';
import { PRESSURES, PRESSURE_LABEL, isPressure } from '../../systems/dmPowers';
import { Director, type Suggestion } from '../../systems/dmDirector';
import { classify } from '../../systems/dmTasks';
import { QUESTS } from '../../systems/quests';
import { PRECIPS, type Precip } from '../../systems/weather';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
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
export type CardKind = Suggestion | 'task' | 'sky' | 'pressure';

/**
 * What the Dungeon Master is asked, and when: the DM steers by reacting. `systems/dmDirector.ts` watches the party (their
 * health, how far the task has got, how long it has been quiet) and says when a card is due; this builds each card from
 * the game and carries out the pick. A card is two or three buttons: "it is going too easy: turn up the heat / stay the
 * course", "the party is struggling: ease off / stay the course", "make it interesting: a storm / foes close in", "what
 * now?: follow me / defend this ground / hunt here". The bar can open any of them on demand. It runs for whoever runs the
 * world: the online DM, or a solo player in a live world.
 */
export class DmPrompts {
  private director = new Director();
  private twists = 0;

  constructor(
    private arena: Arena,
    private story: Story,
    private desk: DmDesk,
    private powers: DmPowers,
    private card: DmCard,
    private tasks: DmTasks,
    private revive: DmRevive,
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
    this.card.update(dt);
    if (this.card.kind === 'story') this.card.refresh(this.storyOptions());
    const party = this.arena.party();
    const fracs = party.map((p) => p.hero.stats.hp / Math.max(1, p.hero.stats.maxHp));
    const t = this.tasks.view;
    const pace = this.tasks.pace;
    const result = this.tasks.result;
    const kind = this.director.tick(dt, {
      busy: busy || this.card.open,
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
    if (kind) this.open(kind);
  }

  /** Is there a live story whose next step the DM may choose? */
  get hasStory(): boolean {
    const view = this.story.view();
    return !!view && !view.complete && view.options.length > 0 && this.story.canChoose;
  }

  /** The party has finished every task told so far and there is a road to take. */
  private storyReady(): boolean {
    if (!this.hasStory) return false;
    const done = Math.max(0, ...this.arena.party().map((p) => p.hero.quests.stage));
    return done >= QUESTS.length;
  }

  /** Put a card up now. */
  open(kind: CardKind, note = '') {
    if (!this.runsWorld) return;
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
      case 'next': {
        if (this.arena.role !== 'host') return; // a quest needs a party
        const options = this.questOptions();
        if (!options.length) return; // the land offers nothing to ask
        show('Which quest?', options, CARD_TIME, 'Nothing has been asked of them for a while.');
        return;
      }
      case 'lost':
        show(
          'They seem lost',
          [
            { id: 'hint', label: 'Point the way' },
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
      case 'task': {
        if (this.arena.role !== 'host') return;
        const options = this.questOptions();
        if (!this.tasks.active && !options.length) return;
        show(this.tasks.active ? 'A quest is running' : 'Which quest?', options, CARD_TIME, '');
        return;
      }
      case 'sky':
        show('How does the sky look?', this.skyOptions(false));
        return;
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

  /** The quests the land offers (a few of different kinds), or, with one running, a hint and a way to call it off. */
  private questOptions(): CardOption[] {
    if (this.tasks.active)
      return [
        { id: 'hint', label: 'Point the way' },
        { id: '@cancel', label: 'Call it off' },
      ];
    return this.tasks.offersHere(3).map((o, i) => ({ id: `q:${i}`, label: o.title }));
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
    this.card.hide();
    if (kind === 'revive') {
      const [how, slot] = id.split(':');
      const n = Number(slot);
      if (how === 'where') this.revive.raiseWhere(n);
      else if (how === 'here') this.revive.bringHere(n);
      else this.revive.leave(n);
    } else if (id === 'heat') {
      this.powers.heat();
      this.desk.say('Something stirs in the dark…');
    } else if (id === 'ease') {
      this.powers.easeOff();
      this.desk.say('A moment of calm.');
    } else if (id === 'close') {
      this.powers.closeIn();
      this.desk.say('They are coming.');
    } else if (id === '@cancel') this.tasks.cancel();
    else if (id === 'hint') {
      this.tasks.giveHint();
      this.desk.say('Look for the signs.');
    } else if (id.startsWith('q:')) this.tasks.call(Number(id.slice(2)));
    else if (id.startsWith('w:')) {
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
    this.director.reset();
    this.card.hide();
  }
}
