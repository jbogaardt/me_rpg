// The Story tab (`#menu-story`): a live world's story so far and the next steps its Dungeon Master may choose, as
// story cues ("Into frost lands, over a thaw crossing"); the land itself is found to fit. Shown to whoever may choose:
// the online host (the DM), or a solo player trying a story out. Built with DOM nodes and textContent: the text is
// content.

import type { StoryView } from '../scenes/overworld/Story';
import type { VoteView } from '../scenes/overworld/DmDesk';

export interface StoryHandlers {
  /** May this page steer the story (a live world, and its DM or a solo player)? */
  canChoose(): boolean;
  view(): StoryView | null;
  choose(cue: string): void;
  /** The party's vote on the next step (null: nobody to ask, as solo). */
  vote(): VoteView | null;
  openVote(): void;
  closeVote(): void;
}

export class StoryTab {
  private handlers: StoryHandlers | null = null;
  private shown = '';

  constructor(private root: HTMLElement) {
    root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const button = target.closest<HTMLElement>('[data-cue]');
      if (button?.dataset.cue) this.handlers?.choose(button.dataset.cue);
      else if (target.closest('[data-ask]')) this.handlers?.openVote();
      else if (target.closest('[data-close]')) this.handlers?.closeVote();
    });
  }

  attach(handlers: StoryHandlers | null) {
    this.handlers = handlers;
    this.shown = '';
  }

  /** Is there a live world whose story this page may steer? */
  get available(): boolean {
    return this.handlers?.canChoose() ?? false;
  }

  /** Draw the tab, only when what it shows changed (it is called every frame while open). */
  render() {
    const view = this.handlers?.view() ?? null;
    const vote = this.handlers?.vote() ?? null;
    const key = JSON.stringify([view, vote]);
    if (key === this.shown) return;
    this.shown = key;
    if (!view) {
      this.root.replaceChildren();
      return;
    }
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    const title = el('h2', view.title);
    title.append(' ', el('small', `${view.placed.length} of ${view.total} lands`));
    const path = el('p', view.placed.join(' → '), 'story-path');
    const parts: HTMLElement[] = [title, path];
    if (view.complete) {
      parts.push(el('p', 'The story has reached its last land. Its end is for the heroes to find.'));
    } else {
      parts.push(el('p', 'Where does the story go next? Choose its road; the land is found to fit.', 'story-hint'));
      const list = el('ul', '', 'story-options');
      for (const o of view.options) {
        const item = el('li');
        const button = el('button', o.label, 'mp-btn panel thin wood');
        button.type = 'button';
        button.dataset.cue = o.cue;
        if (vote?.open) button.append(el('small', ` ${vote.tally[o.cue] ?? 0} of ${vote.voters}`, 'tally'));
        item.append(button);
        list.append(item);
      }
      if (!view.options.length) parts.push(el('p', 'No road leads on from here.'));
      parts.push(list);
      if (vote && view.options.length > 1) {
        const ask = el('button', vote.open ? 'Close the vote' : 'Ask the party', 'mp-btn panel thin wood');
        ask.type = 'button';
        ask.dataset[vote.open ? 'close' : 'ask'] = '1';
        parts.push(ask);
        if (vote.open)
          parts.push(
            el('p', 'The party is voting. Choose a road when you are ready: the choice is yours.', 'story-hint'),
          );
      }
    }
    if (view.note) parts.push(el('p', view.note, 'story-note'));
    this.root.replaceChildren(...parts);
  }
}
