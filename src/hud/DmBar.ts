// The Dungeon Master's bar, always in reach like the player's [I] menu: one line to speak to the party (or to write the
// running quest's instructions), the nudges a DM gives (an Epic quest, Cancel quest, the Story, the Sky, the Pressure), and beside
// it the hot buttons for the big tools (Smite, Freeze, Stop time [T], Reset zone), which stand in for the Inventory and
// Attack buttons the DM has no use for. Also the "time is stopped" notice. (The words a DM speaks are said in the one dialog
// box, `hud/Dialog.ts`, as a caption.) Built once from index.html (`#dm-bar`, `#dm-hot`, `#dm-hold`); textContent only.

import { codeLabel, FIXED_KEYS } from '../core/bindings';
import { MAX_SAY, PRESSURE_LABEL, type Pressure } from '../systems/dmPowers';

export interface DmBarHandlers {
  say(text: string): boolean;
  /** Write the running quest's instructions. */
  note(text: string): boolean;
  /** Call the running quest off. */
  cancelQuest(): void;
  /** What waits behind the Requests button: how many, and the oldest in words. */
  waiting(): { count: number; first: string };
  /** Open the oldest request or suggestion as a card. */
  openInbox(): void;
  /** Write on the signpost beside the DM (pages separated by `|`; none gives it its layout text back): what happened. */
  sign(text: string): string;
  /** Can this world's signs be rewritten (a live world, and this page runs it)? */
  canSign(): boolean;
  /** Is a quest of the DM's running (the Cancel and instructions buttons show only then)? */
  questing(): boolean;
  smite(): boolean;
  freeze(): boolean;
  stop(): boolean;
  reset(): boolean;
  /** Open the card for the sky (weather, time of day) or the pressure now, rather than waiting for the moment. */
  card(kind: 'story' | 'sky' | 'pressure' | 'revive' | 'epic' | 'suggest'): void;
  /** Answer whoever asked for the card up, with these words, privately. */
  reply(text: string): boolean;
  /** Is there someone to answer (the Reply button shows only then)? */
  canReply(): boolean;
  /** How many fallen players could be raised (the Raise button shows only then). */
  fallen(): number;
  /** Let go of the foe being possessed (the Let go button: a phone has no Esc). */
  release(): void;
  /** Is there a live story to steer (the Story button shows only then)? */
  story(): boolean;
  waits(): { smite: number; freeze: number; reset: number; stopped: boolean; pressure: Pressure };
}

const SIGN_TIPS: Record<string, string> = {
  sign: 'Write these words on the signpost beside you (separate pages with |)',
  unsign: 'Give the signpost beside you its own words back',
};
/** Why the sign buttons are off: only a live world keeps a log to write on. */
const SIGN_OFF = 'Signs can only be rewritten in a live world (?campaign=live); here they read the road as it is.';

export class DmBar {
  private bar = document.getElementById('dm-bar')!;
  private form = this.bar.querySelector('form')!;
  private input = this.bar.querySelector('input')!;
  private hot = document.getElementById('dm-hot')!;
  private hold = document.getElementById('dm-hold')!;
  private hint = this.bar.querySelector<HTMLElement>('.hint')!;
  private handlers: DmBarHandlers | null = null;
  private shown = '';
  private handle = this.bar.querySelector<HTMLButtonElement>('.handle')!;
  /** The tools start folded away (they would cover the action); the handle opens them, a click on the game folds them again. */
  private open = false;

  constructor() {
    this.input.maxLength = MAX_SAY;
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.handlers?.say(this.input.value)) this.input.value = '';
    });
    const power = (name: string) => document.querySelector<HTMLButtonElement>(`[data-power="${name}"]`)!;
    power('smite').addEventListener('click', () => this.handlers?.smite());
    power('freeze').addEventListener('click', () => this.handlers?.freeze());
    power('stop').addEventListener('click', () => this.handlers?.stop());
    power('reset').addEventListener('click', () => this.handlers?.reset());
    power('cancel').addEventListener('click', () => this.handlers?.cancelQuest());
    power('note').addEventListener('click', () => {
      if (this.handlers?.note(this.input.value)) this.input.value = '';
    });
    power('sign').addEventListener('click', () => {
      const text = this.input.value;
      if (!text.trim()) return this.flash('Type what the sign should say first.');
      this.flash(this.handlers?.sign(text) ?? '');
    });
    power('unsign').addEventListener('click', () => this.flash(this.handlers?.sign('') ?? ''));
    power('inbox').addEventListener('click', () => this.handlers?.openInbox());
    power('reply').addEventListener('click', () => {
      if (this.handlers?.reply(this.input.value)) this.input.value = '';
    });
    power('suggest').addEventListener('click', () => this.handlers?.card('suggest'));
    power('epic').addEventListener('click', () => this.handlers?.card('epic'));
    power('release').addEventListener('click', () => this.handlers?.release());
    window.addEventListener('pointerdown', (e) => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      if (this.open) {
        this.open = false; // the DM went back to the game
        this.shown = '';
      }
    });
    this.handle.addEventListener('click', () => {
      this.open = !this.open;
      this.shown = ''; // draw again
    });
    power('revive').addEventListener('click', () => this.handlers?.card('revive'));
    power('story').addEventListener('click', () => this.handlers?.card('story'));
    power('sky').addEventListener('click', () => this.handlers?.card('sky'));
    power('pressure').addEventListener('click', () => this.handlers?.card('pressure'));
  }

  /** A few words to the DM in the hint line (what a sign did), until it goes back to its usual text. */
  private flash(text: string) {
    this.hint.textContent = text;
    this.flashed = performance.now() + 4000;
  }
  private flashed = 0;

  attach(handlers: DmBarHandlers | null) {
    this.handlers = handlers;
    if (!handlers) this.bar.hidden = true;
  }

  /** Each frame: the bar for a DM (with each power's wait), the stopped-time notice for all. */
  update(dm: boolean, stopped: boolean, possessing = '', touch = false) {
    this.bar.hidden = !dm || !this.handlers;
    this.hot.hidden = this.bar.hidden;
    const folded = !this.open;
    this.bar.classList.toggle('folded', folded);
    this.bar.classList.toggle('holding', possessing !== ''); // a folded bar still shows the way out while a foe is held
    this.handle.setAttribute('aria-expanded', String(!folded));
    this.hold.hidden = !stopped;
    this.hint.hidden = !dm || !this.handlers;
    const possess = possessing
      ? touch
        ? `You are the ${possessing}. The pad moves it, A strikes.`
        : `You are the ${possessing}. Move and strike as it would. Esc lets go.`
      : touch
        ? 'Tap a foe to possess it.'
        : 'Click a foe to possess it.';
    document.querySelector<HTMLElement>('[data-power="release"]')!.hidden = !possessing;
    if (performance.now() >= this.flashed && this.hint.textContent !== possess) this.hint.textContent = possess;
    this.hold.textContent = dm
      ? touch
        ? 'Time is stopped. Tap Resume time to carry on.'
        : `Time is stopped. Press ${FIXED_KEYS.stop.map(codeLabel).join(' / ')} to carry on.`
      : 'The Dungeon Master has stopped time.';
    if (!this.bar.hidden) {
      const w = this.handlers!.waits();
      const story = this.handlers!.story();
      const fallen = this.handlers!.fallen();
      const questing = this.handlers!.questing();
      const waiting = this.handlers!.waiting();
      const key = `${waiting.count}${waiting.first} ${w.smite} ${w.freeze} ${w.reset} ${w.stopped} ${w.pressure} ${story} ${fallen} ${touch} ${questing} ${this.handlers!.canReply()} ${this.handlers!.canSign()}`;
      if (key !== this.shown) {
        this.shown = key;
        const set = (name: string, text: string, wait = 0, lit = false) => {
          const b = document.querySelector<HTMLButtonElement>(`[data-power="${name}"]`)!;
          b.disabled = wait > 0;
          b.textContent = wait > 0 ? `${text} (${wait})` : text;
          b.classList.toggle('on', lit);
        };
        set('smite', '⚡ Smite', w.smite);
        set('freeze', '❄ Freeze', w.freeze);
        set('reset', '↺ Reset zone', w.reset);
        set(
          'stop',
          w.stopped ? '▶ Resume time' : touch ? '⏸ Stop time' : `⏸ Stop time [${codeLabel(FIXED_KEYS.stop[0])}]`,
          0,
          w.stopped,
        );
        const inbox = document.querySelector<HTMLButtonElement>('[data-power="inbox"]')!;
        inbox.hidden = waiting.count === 0;
        inbox.textContent = waiting.count > 1 ? `💬 Requests (${waiting.count})` : '💬 Request';
        inbox.title = waiting.first;
        document.querySelector<HTMLElement>('[data-power="reply"]')!.hidden = !this.handlers!.canReply();
        document.querySelector<HTMLElement>('[data-power="cancel"]')!.hidden = !questing;
        document.querySelector<HTMLElement>('[data-power="note"]')!.hidden = !questing;
        const canSign = this.handlers!.canSign();
        for (const name of ['sign', 'unsign']) {
          const b = document.querySelector<HTMLButtonElement>(`[data-power="${name}"]`)!;
          b.disabled = !canSign;
          b.title = canSign ? SIGN_TIPS[name]! : SIGN_OFF;
        }
        set('story', 'Story');
        document.querySelector<HTMLElement>('[data-power="revive"]')!.hidden = fallen === 0;
        set('revive', fallen > 1 ? `Raise (${fallen})` : 'Raise');
        document.querySelector<HTMLElement>('[data-power="story"]')!.hidden = !story;
        set('sky', 'Sky');
        set('pressure', `Pressure: ${PRESSURE_LABEL[w.pressure]}`);
      }
    }
  }
}
