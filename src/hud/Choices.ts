import type { Choice } from '../content/schema';

/** One choice as offered: its text, what it asks for (shown under it), and whether the hero meets that. */
export interface ChoiceOffer {
  choice: Choice;
  needs: string | null;
  /** The story's reason the way is shut (shown while it is). */
  hint?: string;
  allowed: boolean;
}

/**
 * The scenario's choices (markup `#choices` in index.html): a button per choice at the right edge of the screen. A
 * choice the hero does not meet the requirement of is shown, disabled, with what it needs.
 */
export class Choices {
  private box = document.getElementById('choices')!;
  private list = this.box.querySelector<HTMLElement>('.list')!;
  private shown = ''; // what the buttons were last drawn from, so they are only rebuilt when it changes
  /** Set by the scene: a choice was picked. */
  onPick: (choice: Choice) => void = () => {};

  /** Show these offers (null or none hides the panel). Cheap to call every frame. */
  show(offers: ChoiceOffer[] | null) {
    const key = offers?.length
      ? JSON.stringify(offers.map((o) => [o.choice.text, o.choice.next, o.needs, o.hint, o.allowed]))
      : '';
    if (key === this.shown) return;
    this.shown = key;
    this.box.hidden = !key;
    this.list.replaceChildren(
      ...(offers ?? []).map((o) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mp-btn panel thin wood';
        button.textContent = o.choice.text;
        if (o.needs) {
          const needs = document.createElement('span');
          needs.className = 'needs';
          needs.textContent = `Needs ${o.needs}`;
          button.append(needs);
        }
        if (o.hint && !o.allowed) {
          const why = document.createElement('span');
          why.className = 'hint';
          why.textContent = o.hint;
          button.append(why);
        }
        button.disabled = !o.allowed;
        // Never keep focus: Space is the attack key, and on a focused button it would pick the choice again.
        button.addEventListener('mousedown', (e) => e.preventDefault());
        button.addEventListener('click', () => {
          button.blur();
          this.onPick(o.choice);
        });
        return button;
      }),
    );
  }
}
