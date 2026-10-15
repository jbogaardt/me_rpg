// A player's way to ask the Dungeon Master for something without typing: a 💬 button by the menu button opens a short list
// of canned requests (We are lost, This is too hard...). The DM sees them as a count on their Requests button, never a
// popup (`systems/dmRequests.ts`). Shown online to friends only; the host is the DM. Built with textContent only.

import { REQUESTS } from '../systems/dmRequests';

export class RequestPanel {
  private button = document.getElementById('req-btn')!;
  private root = document.getElementById('request')!;
  private opts = this.root.querySelector<HTMLElement>('.opts')!;
  private shown = '';
  /** The player picked request `index` of `REQUESTS`; true if it was sent. */
  onAsk: (index: number) => boolean = () => false;

  constructor() {
    this.opts.replaceChildren(
      ...REQUESTS.map((r, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mp-btn panel thin wood';
        b.dataset.ask = String(i);
        b.textContent = r.label;
        return b;
      }),
    );
    this.button.addEventListener('click', () => (this.root.hidden = !this.root.hidden));
    this.opts.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ask]');
      if (b?.dataset.ask === undefined) return;
      if (this.onAsk(Number(b.dataset.ask))) this.root.hidden = true;
    });
    // A click or tap on the game means "never mind".
    window.addEventListener('pointerdown', (e) => {
      if (e.target instanceof HTMLCanvasElement) this.root.hidden = true;
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  close() {
    this.root.hidden = true;
  }

  /** Each frame: show the button for a friend online, and say how long until they may ask again. */
  update(available: boolean, wait: number) {
    this.button.hidden = !available;
    if (!available) this.root.hidden = true;
    const key = `${wait}`;
    if (key === this.shown) return;
    this.shown = key;
    this.button.classList.toggle('waiting', wait > 0);
    this.button.title = wait > 0 ? `Asked. You can ask again in ${wait}s` : 'Ask the Dungeon Master';
    for (const b of this.opts.querySelectorAll('button')) b.disabled = wait > 0;
  }
}
