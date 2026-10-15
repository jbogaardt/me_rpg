// The Dungeon Master's bar: one line to speak to the party, and the two big buttons (Smite, Freeze). Also where the
// words a DM speaks appear, for everyone. Built once from index.html (`#dm-bar`, `#dm-speech`); textContent only.

import { MAX_SAY, SAY_SHOW } from '../systems/dmPowers';

export interface DmBarHandlers {
  say(text: string): boolean;
  smite(): boolean;
  freeze(): boolean;
  /** Seconds each power still has to wait (0: ready). */
  waits(): { smite: number; freeze: number };
}

export class DmBar {
  private bar = document.getElementById('dm-bar')!;
  private form = this.bar.querySelector('form')!;
  private input = this.bar.querySelector('input')!;
  private smiteBtn = this.bar.querySelector<HTMLButtonElement>('[data-power="smite"]')!;
  private freezeBtn = this.bar.querySelector<HTMLButtonElement>('[data-power="freeze"]')!;
  private speech = document.getElementById('dm-speech')!;
  private handlers: DmBarHandlers | null = null;
  private hideAt = 0;
  private shown = '';

  constructor() {
    this.input.maxLength = MAX_SAY;
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.handlers?.say(this.input.value)) this.input.value = '';
    });
    this.smiteBtn.addEventListener('click', () => this.handlers?.smite());
    this.freezeBtn.addEventListener('click', () => this.handlers?.freeze());
  }

  attach(handlers: DmBarHandlers | null) {
    this.handlers = handlers;
    if (!handlers) this.bar.hidden = true;
  }

  /** Each frame: show the bar to a DM, with each power's wait; fade the speech when its time is up. */
  update(dm: boolean, now: number) {
    this.bar.hidden = !dm || !this.handlers;
    if (!this.bar.hidden) {
      const w = this.handlers!.waits();
      const key = `${w.smite} ${w.freeze}`;
      if (key !== this.shown) {
        this.shown = key;
        this.label(this.smiteBtn, 'Smite', w.smite);
        this.label(this.freezeBtn, 'Freeze', w.freeze);
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

  private label(b: HTMLButtonElement, name: string, wait: number) {
    b.disabled = wait > 0;
    b.textContent = wait > 0 ? `${name} (${wait})` : name;
  }
}
