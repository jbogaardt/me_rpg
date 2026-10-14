// A player's view of the Dungeon Master's open vote (`#vote`, a panel at the right edge): the choices, how many chose
// each, and theirs lit. A tap chooses (or changes the choice); the DM decides when to close it. HTML so a tap never
// reaches the canvas; built with textContent (the choices are story text).

import type { VoteWire } from '../net/protocol';

export class VotePanel {
  private root = document.getElementById('vote')!;
  private list = this.root.querySelector<HTMLElement>('.opts')!;
  private shown = '';
  /** Set by the scene: the player chose option `index`. */
  onChoose: (index: number) => void = () => {};

  constructor() {
    this.list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (b) this.onChoose(Number(b.dataset.index));
    });
  }

  /** Show `vote` (null hides the panel); `mine` is this player's choice (-1: none yet). */
  sync(vote: (VoteWire & { mine: number }) | null) {
    const key = JSON.stringify(vote);
    if (key === this.shown) return;
    this.shown = key;
    this.root.hidden = !vote;
    if (!vote) return;
    this.list.replaceChildren(
      ...vote.options.map((label, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `mp-btn panel thin wood${vote.mine === i ? ' active' : ''}`;
        b.dataset.index = String(i);
        b.textContent = label;
        const count = document.createElement('small');
        count.textContent = ` ${vote.tally[i] ?? 0}`;
        b.append(count);
        return b;
      }),
    );
  }
}
