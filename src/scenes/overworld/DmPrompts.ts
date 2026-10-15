import type { CardOption, DmCard } from '../../hud/DmCard';
import { PRESSURES, PRESSURE_LABEL, isPressure } from '../../systems/dmPowers';
import { Prompter, type PromptKind } from '../../systems/dmPrompts';
import { TASK_KINDS, TASK_LABEL, type TaskKind } from '../../systems/dmTasks';
import { QUESTS } from '../../systems/quests';
import { PRECIPS, type Precip } from '../../systems/weather';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import type { DmPowers } from './DmPowers';
import type { DmRevive } from './DmRevive';
import type { DmTasks } from './DmTasks';
import type { Story } from './Story';

/** Seconds a card for the sky or the pressure waits before it goes away on its own. */
const CARD_TIME = 25;
/** "Not now" on the story card: ask again after this long. */
const STORY_SNOOZE = 45;

const HOURS: { id: string; label: string; hour: number }[] = [
  { id: 't:6', label: 'Break of day', hour: 6 },
  { id: 't:19', label: 'Dusk', hour: 19 },
  { id: 't:23', label: 'Night falls', hour: 23 },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * What the Dungeon Master is asked, and when. There is no admin panel: at the right moment (the party has finished what
 * the story told, reached a new land, finished a task) a card offers two or three options, and picking one does it.
 * `systems/dmPrompts.ts` decides when; this builds each card from the game and carries out the pick. The DM can also ask
 * for the sky or the pressure at any time from the bar. It runs for whoever runs the world: the online DM, or a solo
 * player in a live world.
 */
export class DmPrompts {
  private prompter = new Prompter();

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
    card.onDismiss = (kind) => {
      if (kind === 'story') this.prompter.snooze(STORY_SNOOZE);
    };
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
    // A player has fallen: the moment to raise them is now, over a card that can wait.
    const lowCard = this.card.kind === null || ['sky', 'pressure', 'task'].includes(this.card.kind);
    if (!busy && lowCard && this.revive.unoffered) this.open('revive');
    const kind = this.prompter.tick(dt, {
      storyReady: this.storyReady(),
      area: this.arena.view.name,
      questsDone: Math.max(0, ...this.arena.party().map((p) => p.hero.quests.stage)),
      busy: busy || this.card.open,
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
    const view = this.story.view();
    if (!view || view.complete || !view.options.length || !this.story.canChoose) return false;
    const done = Math.max(0, ...this.arena.party().map((p) => p.hero.quests.stage));
    return done >= QUESTS.length;
  }

  /** Put a card up now (the story, the sky or the pressure). */
  open(kind: PromptKind | 'task' | 'revive', note = '') {
    if (!this.runsWorld) return;
    if (kind === 'story') {
      const view = this.story.view();
      if (!view || view.complete || !view.options.length) return;
      this.card.show({
        kind,
        title: 'Where does the story go next?',
        note: note || `${view.title}: ${view.placed.length} of ${view.total} lands`,
        options: this.storyOptions(),
        seconds: null,
      });
    } else if (kind === 'revive') {
      const f = this.revive.unoffered ?? this.revive.fallen[0];
      if (!f) return;
      f.offered = true;
      this.card.show({
        kind,
        title: `${f.name} has fallen`,
        note: 'They wake at the start unless you raise them.',
        options: [
          { id: `where:${f.slot}`, label: 'Raise them where they fell' },
          { id: `here:${f.slot}`, label: 'Bring them to me' },
          { id: `leave:${f.slot}`, label: 'Let them wake at the start' },
        ],
        seconds: 30,
      });
    } else if (kind === 'task') {
      if (this.arena.role !== 'host') return; // a task needs a party
      this.card.show({
        kind,
        title: this.tasks.active ? 'A task is running' : 'What does the party do?',
        note: this.tasks.active ? '' : 'It is anchored where you stand.',
        options: this.taskOptions(),
        seconds: CARD_TIME,
      });
    } else if (kind === 'sky') {
      this.card.show({ kind, title: 'How does the sky look?', options: this.skyOptions(), seconds: CARD_TIME });
    } else {
      this.card.show({
        kind,
        title: 'How hard should the world push?',
        options: this.pressureOptions(),
        seconds: CARD_TIME,
      });
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

  private skyOptions(): CardOption[] {
    const v = this.desk.dialsView();
    return [
      { id: 'w:', label: 'Clear skies', on: v.precip === null },
      ...v.precips.slice(0, 3).map((p) => ({ id: `w:${p}`, label: cap(p), on: v.precip === p })),
      ...HOURS.map((h) => ({ id: h.id, label: h.label })),
    ];
  }

  private taskOptions(): CardOption[] {
    if (this.tasks.active) return [{ id: '@cancel', label: 'Call it off' }];
    return TASK_KINDS.map((k) => ({ id: k, label: TASK_LABEL[k] }));
  }

  private pressureOptions(): CardOption[] {
    return PRESSURES.map((p) => ({ id: p, label: PRESSURE_LABEL[p], on: this.arena.pressure === p }));
  }

  private pick(kind: string, id: string) {
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
    if (kind === 'sky') {
      if (id.startsWith('w:')) {
        const precip = id.slice(2);
        const valid =
          precip === '' ? null : (PRECIPS as readonly string[]).includes(precip) ? (precip as Precip) : null;
        this.desk.setWeather(valid, valid === 'storm' || valid === 'blizzard' ? 1 : valid ? 0.5 : 0);
      } else {
        const hour = HOURS.find((h) => h.id === id)?.hour;
        if (hour !== undefined) this.desk.setHour(hour);
      }
      this.prompter.settled('sky');
      this.card.hide();
      return;
    }
    if (kind === 'revive') {
      const [how, slot] = id.split(':');
      const n = Number(slot);
      if (how === 'where') this.revive.raiseWhere(n);
      else if (how === 'here') this.revive.bringHere(n);
      else this.revive.leave(n);
      this.card.hide();
      return;
    }
    if (kind === 'task') {
      if (id === '@cancel') this.tasks.cancel();
      else if ((TASK_KINDS as readonly string[]).includes(id)) this.tasks.call(id as TaskKind);
      this.card.hide();
      return;
    }
    if (kind === 'pressure' && isPressure(id)) {
      this.powers.setPressure(id);
      this.prompter.settled('pressure');
      this.card.hide();
    }
  }

  reset() {
    this.prompter.reset();
    this.card.hide();
  }
}
