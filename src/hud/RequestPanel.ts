// A player's way to talk to the Dungeon Master without leaving the game: a 💬 button by the menu button opens a short list
// of canned requests (We are lost, This is too hard, Give us an epic quest...) and a line to type their own words. The DM
// sees them as a count on their Requests button, never a popup (`systems/dmRequests.ts`), and may answer, privately, in
// their own voice. There is no waiting between asks. Shown online to friends only; the host is the DM. textContent only.

import { MAX_ASK, MESSAGE_CODE, REQUESTS } from '../systems/dmRequests';

export class RequestPanel {
  private button = document.getElementById('req-btn')!;
  private root = document.getElementById('request')!;
  private opts = this.root.querySelector<HTMLElement>('.opts')!;
  private form = this.root.querySelector('form')!;
  private input = this.root.querySelector('input')!;
  private sentTimer = 0;
  /** The player picked request `index` of `REQUESTS` (or `MESSAGE_CODE` with `text`); true if it was sent. */
  onAsk: (index: number, text?: string) => boolean = () => false;

  constructor() {
    this.input.maxLength = MAX_ASK;
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
      if (b?.dataset.ask !== undefined && this.onAsk(Number(b.dataset.ask))) this.sent();
    });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.onAsk(MESSAGE_CODE, this.input.value)) {
        this.input.value = '';
        this.sent();
      }
    });
    // A click or tap on the game means "never mind".
    window.addEventListener('pointerdown', (e) => {
      if (e.target instanceof HTMLCanvasElement) this.root.hidden = true;
    });
  }

  /** The ask is on its way: close the list and let the button say so for a moment. */
  private sent() {
    this.root.hidden = true;
    this.button.classList.add('sent');
    this.button.title = 'Sent to the Dungeon Master';
    this.sentTimer = 2;
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** Open the list (the player walked up to the Dungeon Master and spoke). */
  show() {
    if (!this.button.hidden) this.root.hidden = false;
  }

  close() {
    this.root.hidden = true;
  }

  /** Each frame: show the button for a friend online (and put the "sent" glow out after a moment). */
  update(available: boolean, dt = 0) {
    this.button.hidden = !available;
    if (!available) this.root.hidden = true;
    if (this.sentTimer > 0 && (this.sentTimer -= dt) <= 0) {
      this.button.classList.remove('sent');
      this.button.title = 'Ask the Dungeon Master';
    }
  }
}
