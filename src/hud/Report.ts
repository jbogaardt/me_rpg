import { MOODS, MOOD_FACES, NOTE_MAX, span, type Engagement, type Mood } from '../systems/engagement';

/**
 * The Report tab of the menu (`#menu-report`): how this session is going, in numbers the player can read and copy for
 * whoever runs the game (`Engagement`, systems/engagement.ts). Built with DOM nodes and textContent. It reads the counters
 * kept on this page only; nothing is sent. A guest's kills and knockouts are counted by the host, so they read 0 there and
 * the tab says so.
 */
/** What the scene gives the tab while it runs. */
export interface ReportHandlers {
  engagement: Engagement;
  /** The text to copy (the scene adds the build and visit number). */
  text(): string;
  /** A zone key as the player sees it. */
  name(zone: string): string;
  /** A guest's page cannot count kills or knockouts: the host does. */
  guest(): boolean;
  /** A mood or stuck press was made: the scene logs it. */
  onSay(what: Mood | 'stuck'): void;
}

export class Report {
  private shown = '';
  private h: ReportHandlers | null = null;
  private note: HTMLTextAreaElement;
  private status: HTMLElement;

  constructor(private root: HTMLElement) {
    this.note = document.createElement('textarea');
    this.note.maxLength = NOTE_MAX;
    this.note.rows = 2;
    this.note.placeholder = 'Anything to add? Too hard, too slow, loved the cave...';
    this.note.addEventListener('input', () => this.h?.engagement.setNote(this.note.value));
    this.status = document.createElement('p');
    this.status.className = 'report-status';
    this.status.setAttribute('role', 'status');
  }

  attach(handlers: ReportHandlers | null) {
    this.h = handlers;
    this.shown = '';
  }

  /** Draw the tab, only when what it shows changed (it is called every frame while open). */
  render() {
    const h = this.h;
    if (!h) return;
    const e = h.engagement;
    const key = `${Math.floor(e.seconds)}|${e.kills}|${e.knockouts}|${JSON.stringify(e.quests)}|${e.breathers}|${e.stuck}|${JSON.stringify(e.moods)}`;
    if (key === this.shown) return;
    this.shown = key;
    const row = (label: string, value: string) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      return [dt, dd];
    };
    const list = document.createElement('dl');
    list.append(
      ...row('Playing', `${span(e.seconds)} (busy ${span(e.active)})`),
      ...row(
        'Level',
        e.levelStart !== null && e.level > e.levelStart ? `${e.level} (from ${e.levelStart})` : String(e.level),
      ),
      ...row('Kills', h.guest() ? 'counted by the host' : String(e.kills)),
      ...row('Knockouts', h.guest() ? 'counted by the host' : String(e.knockouts)),
      ...row('Quests', `${e.quests.started} started, ${e.quests.done} done, ${e.quests.lost} lost`),
      ...row('Breathers', `${e.breathers} (${span(e.breatherSeconds)})`),
      ...row('Longest stall', span(e.longestStall)),
      ...row(
        'Where',
        [...e.zones]
          .sort((a, b) => b[1].seconds - a[1].seconds)
          .map(([z, s]) => `${h.name(z)} ${span(s.seconds)}`)
          .join(', ') || 'nowhere yet',
      ),
    );
    const title = document.createElement('h2');
    title.textContent = 'Report';
    const intro = document.createElement('p');
    intro.textContent =
      'How this session is going. Nothing leaves your device unless you copy it: paste it to whoever runs the game.';
    const moods = document.createElement('div');
    moods.className = 'report-moods';
    const ask = document.createElement('span');
    ask.textContent = 'How is it going? ';
    moods.append(
      ask,
      ...MOODS.map((m) => this.button(MOOD_FACES[m], () => this.say(m, `Noted ${MOOD_FACES[m]}`))),
      this.button('I am stuck', () => this.say('stuck', 'Noted: you are stuck. Say where in the note.')),
    );
    const copy = this.button('Copy report', () => void this.copy());
    const prev = this.note.value;
    this.root.replaceChildren(title, intro, list, moods, this.note, copy, this.status);
    this.note.value = prev || e.note;
  }

  private button(label: string, on: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mp-btn panel thin wood';
    b.textContent = label;
    b.addEventListener('click', on);
    return b;
  }

  private say(what: Mood | 'stuck', words: string) {
    if (!this.h) return;
    if (what === 'stuck') this.h.engagement.stuckPressed();
    else this.h.engagement.mood(what);
    this.h.onSay(what);
    this.status.textContent = words;
    this.shown = ''; // the counts changed
  }

  private async copy() {
    const text = this.h?.text() ?? '';
    try {
      await navigator.clipboard.writeText(text);
      this.status.textContent = 'Copied. Paste it where you report.';
    } catch {
      // No clipboard (an insecure page, a locked-down browser): select the words so Ctrl+C works.
      this.note.value = text;
      this.note.select();
      this.status.textContent = 'Press Ctrl+C to copy what is selected.';
    }
  }
}
