import { damageNumbers } from '../core/damageNumbers';

// The Controls tab's "Damage numbers" switch (markup `#numbers-setting` in index.html): a debug and accessibility aid,
// off by default (the game shows a blow by its weight). The saving is in core/damageNumbers.ts; `Simulation` reads it.

export class NumbersSetting {
  private button = document.getElementById('numbers-toggle')!;
  private note = document.getElementById('numbers-note')!;

  constructor() {
    this.button.addEventListener('click', () => {
      damageNumbers.set(!damageNumbers.on);
      this.refresh();
    });
  }

  /** Called when the menu opens. */
  refresh() {
    this.button.setAttribute('aria-checked', String(damageNumbers.on));
    this.button.textContent = damageNumbers.on ? 'On' : 'Off';
    this.note.textContent = damageNumbers.on
      ? 'A number floats from each blow you land or take (solo and host only).'
      : 'Blows show by their weight: bigger sparks, a harder kick. Switch on for numbers.';
  }
}
