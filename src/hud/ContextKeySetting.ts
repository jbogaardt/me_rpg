import { contextKey } from '../core/contextKey';

// The Controls tab's "Contextual action key" switch (markup `#context-setting` in index.html). Off (the default) the attack key
// only attacks and the interact key (R, right click, the touch button) talks, opens and picks up; on, the one key does both
// the old way (a foe near makes it a sword). Saving and the rule: core/contextKey.ts; local to this page.

export class ContextKeySetting {
  private button = document.getElementById('context-toggle')!;
  private note = document.getElementById('context-note')!;

  constructor() {
    this.button.addEventListener('click', () => {
      contextKey.set(!contextKey.on);
      this.refresh();
    });
  }

  /** Called when the menu opens. */
  refresh() {
    this.button.setAttribute('aria-checked', String(contextKey.on));
    this.button.textContent = contextKey.on ? 'On' : 'Off';
    this.note.textContent = contextKey.on
      ? 'One key attacks, talks, opens and picks up, by what is near. A foe within ten tiles makes it a sword.'
      : 'Attack only attacks. Interact (R, right click, the round button that appears near things) talks, opens and picks up.';
  }
}
