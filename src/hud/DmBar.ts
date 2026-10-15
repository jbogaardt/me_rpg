// The Dungeon Master's bar, always in reach like the player's [I] menu: one line to speak to the party, and the few
// big things a DM does (Stop time [T], Smite, Freeze, Reset zone, the Sky, the Pressure). Also where the words a DM
// speaks appear, for everyone, and the "time is stopped" notice. Built once from index.html (`#dm-bar`, `#dm-speech`,
// `#dm-hold`); textContent only.

import { codeLabel, FIXED_KEYS } from '../core/bindings';
import { MAX_SAY, PRESSURE_LABEL, SAY_SHOW, type Pressure } from '../systems/dmPowers';

export interface DmBarHandlers {
  say(text: string): boolean;
  smite(): boolean;
  freeze(): boolean;
  stop(): boolean;
  reset(): boolean;
  /** Open the card for the sky (weather, time of day) or the pressure now, rather than waiting for the moment. */
  card(kind: 'story' | 'sky' | 'pressure' | 'task' | 'revive'): void;
  /** How many fallen players could be raised (the Raise button shows only then). */
  fallen(): number;
  /** Let go of the foe being possessed (the Let go button: a phone has no Esc). */
  release(): void;
  /** Is there a live story to steer (the Story button shows only then)? */
  story(): boolean;
  waits(): { smite: number; freeze: number; reset: number; stopped: boolean; pressure: Pressure };
}

export class DmBar {
  private bar = document.getElementById('dm-bar')!;
  private form = this.bar.querySelector('form')!;
  private input = this.bar.querySelector('input')!;
  private speech = document.getElementById('dm-speech')!;
  private hold = document.getElementById('dm-hold')!;
  private hint = this.bar.querySelector<HTMLElement>('.hint')!;
  private handlers: DmBarHandlers | null = null;
  private hideAt = 0;
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
    const power = (name: string) => this.bar.querySelector<HTMLButtonElement>(`[data-power="${name}"]`)!;
    power('smite').addEventListener('click', () => this.handlers?.smite());
    power('freeze').addEventListener('click', () => this.handlers?.freeze());
    power('stop').addEventListener('click', () => this.handlers?.stop());
    power('reset').addEventListener('click', () => this.handlers?.reset());
    power('release').addEventListener('click', () => this.handlers?.release());
    window.addEventListener('pointerdown', (e) => {
      if (e.target instanceof HTMLCanvasElement && this.open) {
        this.open = false; // the DM went back to the game
        this.shown = '';
      }
    });
    this.handle.addEventListener('click', () => {
      this.open = !this.open;
      this.shown = ''; // draw again
    });
    power('revive').addEventListener('click', () => this.handlers?.card('revive'));
    power('task').addEventListener('click', () => this.handlers?.card('task'));
    power('story').addEventListener('click', () => this.handlers?.card('story'));
    power('sky').addEventListener('click', () => this.handlers?.card('sky'));
    power('pressure').addEventListener('click', () => this.handlers?.card('pressure'));
  }

  attach(handlers: DmBarHandlers | null) {
    this.handlers = handlers;
    if (!handlers) this.bar.hidden = true;
  }

  /** Each frame: the bar for a DM (with each power's wait), the stopped-time notice for all, the speech fading. */
  update(dm: boolean, now: number, stopped: boolean, possessing = '', touch = false) {
    this.bar.hidden = !dm || !this.handlers;
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
    this.bar.querySelector<HTMLElement>('[data-power="release"]')!.hidden = !possessing;
    if (this.hint.textContent !== possess) this.hint.textContent = possess;
    this.hold.textContent = dm
      ? touch
        ? 'Time is stopped. Tap Resume time to carry on.'
        : `Time is stopped. Press ${FIXED_KEYS.stop.map(codeLabel).join(' / ')} to carry on.`
      : 'The Dungeon Master has stopped time.';
    if (!this.bar.hidden) {
      const w = this.handlers!.waits();
      const story = this.handlers!.story();
      const fallen = this.handlers!.fallen();
      const key = `${w.smite} ${w.freeze} ${w.reset} ${w.stopped} ${w.pressure} ${story} ${fallen} ${touch}`;
      if (key !== this.shown) {
        this.shown = key;
        const set = (name: string, text: string, wait = 0, lit = false) => {
          const b = this.bar.querySelector<HTMLButtonElement>(`[data-power="${name}"]`)!;
          b.disabled = wait > 0;
          b.textContent = wait > 0 ? `${text} (${wait})` : text;
          b.classList.toggle('on', lit);
        };
        set('smite', 'Smite', w.smite);
        set('freeze', 'Freeze', w.freeze);
        set('reset', 'Reset zone', w.reset);
        set(
          'stop',
          w.stopped ? 'Resume time' : touch ? 'Stop time' : `Stop time [${codeLabel(FIXED_KEYS.stop[0])}]`,
          0,
          w.stopped,
        );
        set('story', 'Story');
        this.bar.querySelector<HTMLElement>('[data-power="revive"]')!.hidden = fallen === 0;
        set('revive', fallen > 1 ? `Raise (${fallen})` : 'Raise');
        this.bar.querySelector<HTMLElement>('[data-power="story"]')!.hidden = !story;
        set('sky', 'Sky');
        set('pressure', `Pressure: ${PRESSURE_LABEL[w.pressure]}`);
      }
    }
    if (!this.speech.hidden && now >= this.hideAt) this.speech.hidden = true;
  }

  /** Show what the Dungeon Master said (on every player's screen for a few seconds). */
  speak(text: string, now: number) {
    this.speech.textContent = text;
    this.speech.hidden = false;
    this.hideAt = now + SAY_SHOW;
  }
}
