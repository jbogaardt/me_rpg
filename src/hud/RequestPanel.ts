// A friend's way to talk to the Dungeon Master online: one line of free-form words, no buttons. The 💬 button (or Enter)
// opens the line, Enter sends it, Esc or a tap on the game closes it. The DM sees it as a count on their Requests
// button, never a popup (`systems/dmRequests.ts`), and may answer, privately, in their own voice, or act on it (ease
// off a fight, point the way, begin a quest). Shown online to friends only; the host is the DM. textContent only.
// Enter from the game also starts the mic (`dictation.ts`): speak, then Enter sends.

import { MAX_ASK, MESSAGE_CODE } from '../systems/dmRequests';
import { Dictation } from './dictation';

export class RequestPanel {
  private button = document.getElementById('req-btn')!;
  private root = document.getElementById('request')!;
  private form = this.root.querySelector('form')!;
  private input = this.root.querySelector('input')!;
  private sentTimer = 0;
  private dictation = new Dictation(this.input, this.form);
  /** The player said `text` (`MESSAGE_CODE`); true if it was sent. */
  onAsk: (index: number, text?: string) => boolean = () => false;

  constructor() {
    this.input.maxLength = MAX_ASK;
    this.button.addEventListener('click', () => (this.root.hidden ? this.show() : this.close()));
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.onAsk(MESSAGE_CODE, this.input.value)) {
        this.input.value = '';
        this.sent();
      }
    });
    // Enter opens the line from the game and starts the mic (typing into any field is left alone); Enter again sends.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!this.button.hidden && this.root.hidden) {
        e.preventDefault();
        this.show();
        this.dictation.start();
      }
    });
    // A click or tap on the game means "never mind".
    window.addEventListener('pointerdown', (e) => {
      if (e.target instanceof HTMLCanvasElement) this.close();
    });
  }

  /** The ask is on its way: close the line and let the button say so for a moment. */
  private sent() {
    this.close();
    this.button.classList.add('sent');
    this.button.title = 'Sent to the Dungeon Master';
    this.sentTimer = 2;
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** Open the line and put the cursor in it. */
  show() {
    if (this.button.hidden) return;
    this.root.hidden = false;
    this.input.focus();
  }

  close() {
    this.root.hidden = true;
    this.input.blur();
  }

  /** Each frame: show the button for a friend online (and put the "sent" glow out after a moment). */
  update(available: boolean, dt = 0) {
    this.button.hidden = !available;
    if (!available && !this.root.hidden) this.close();
    if (this.sentTimer > 0 && (this.sentTimer -= dt) <= 0) {
      this.button.classList.remove('sent');
      this.button.title = 'Talk to the Dungeon Master';
    }
  }
}
