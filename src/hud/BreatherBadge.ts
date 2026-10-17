import { MOODS, MOOD_FACES, clockText, type Mood } from '../systems/breather';

/**
 * The breather, said on screen (markup `#breather` in index.html): a mug, "Breather", the clock and a line about what the
 * time is for, with three faces to say how the last quest felt. Local to each page; it takes no input but the faces and never
 * covers the fight (bottom left, above the pickup toasts). The faces go away once one is tapped, or when the breather ends.
 */
export class BreatherBadge {
  private root = document.getElementById('breather')!;
  private time = this.root.querySelector<HTMLElement>('.time')!;
  private faces = this.root.querySelector<HTMLElement>('.moods')!;
  private shown = '';
  /** Set by the scene: the player tapped a face. */
  onMood: (m: Mood) => void = () => {};

  constructor() {
    this.faces.replaceChildren(
      ...MOODS.map((m) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.mood = m;
        b.textContent = MOOD_FACES[m];
        b.setAttribute('aria-label', `This went ${m === 'good' ? 'well' : m === 'ok' ? 'so-so' : 'badly'}`);
        b.addEventListener('click', () => {
          this.onMood(m);
          this.faces.hidden = true;
        });
        return b;
      }),
    );
  }

  /** Show it with `seconds` left (0 hides it); `askMood` offers the faces. Cheap to call every frame. */
  update(seconds: number, askMood: boolean) {
    const text = seconds > 0 ? clockText(seconds) : '';
    if (text === this.shown) return;
    if (!this.shown && text && askMood) this.faces.hidden = false;
    this.shown = text;
    this.root.hidden = !text;
    this.time.textContent = text;
  }
}
