import { gridSvg } from './heartArt';
import { glow, MAX_MARKS, type MarkKind, type Thing } from './interactThings';

// The interact key shown, not told. (1) In the world: a soft pixel glint that bobs over each chest, person or pickup the hero
// could use (at most MAX_MARKS, the nearest), faint at two tiles and brighter as they come, full when the key would act.
// (2) On touch: the interact button (`#btn-use`, index.html) is hidden unless something is in reach, and wears a pixel glyph
// of what it would do (speech bubble, hand, chest). Pooled DOM elements with inline styles, pointer-events none, no text,
// no per-frame allocation; cosmetic and local on every page (nothing is sent). Which things count and how bright:
// interactThings.ts. Styles: src/ui.css (`#interact-marks`, `#btn-use`).

const GLINT = ['..h..', '..h..', 'hhwhh', '..h..', '..h..'];
const TALK = [
  '.ooooooooo.',
  'oxxxxxxxxxo',
  'oxxxxxxxxxo',
  'oxdxxdxxdxo',
  'oxxxxxxxxxo',
  'oxxxxxxxxxo',
  '.oooxxoooo.',
  '...oxxo....',
  '...oxo.....',
  '...oo......',
];
const HAND = [
  '..o.o.o....',
  '.oxoxoxo...',
  '.oxxxxxxoo.',
  '.oxxxxxxxxo',
  '.oxxxxxxxxo',
  '..oxxxxxxo.',
  '..oxxxxxxo.',
  '...oxxxxo..',
  '...oooooo..',
];
const CHEST = [
  '.ooooooooo.',
  'oyyyyyyyyyo',
  'oyyyyyyyyyo',
  'ooooolooooo',
  'obbbbbbbbbo',
  'obbbbbbbbbo',
  'obbbbbbbbbo',
  'ooooooooooo',
];
const INK = { o: '#2b1a05' };

const url = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** Set the art once as CSS variables (the glint, and one glyph per kind for the button). */
function installArt() {
  const root = document.documentElement.style;
  root.setProperty('--glint', url(gridSvg(GLINT, { h: '#f2d38a', w: '#fff8d8' })));
  root.setProperty('--glyph-talk', url(gridSvg(TALK, { ...INK, x: '#f4ead0', d: '#5a3a14' })));
  root.setProperty('--glyph-hand', url(gridSvg(HAND, { ...INK, x: '#f4ead0' })));
  root.setProperty('--glyph-chest', url(gridSvg(CHEST, { ...INK, y: '#d4a24a', b: '#8a5a24', l: '#f2d38a' })));
}

export class InteractMarks {
  private root = document.createElement('div');
  private glints: HTMLElement[] = [];
  private shown = 0;
  private button = document.getElementById('btn-use');
  private icon: MarkKind | null = null;

  constructor() {
    installArt();
    this.root.id = 'interact-marks';
    this.root.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < MAX_MARKS; i++) {
      const el = document.createElement('div');
      el.className = 'glint';
      el.style.opacity = '0';
      this.root.appendChild(el);
      this.glints.push(el);
    }
    document.body.appendChild(this.root);
  }

  /**
   * Each frame. `marks` (the first `count` entries) are the things to glint over, placed through the world's screen offset
   * and scale; `count` 0 hides them all. `button` is the glyph for the interact button, or null to hide it.
   */
  update(
    marks: readonly Thing[],
    count: number,
    world: { x: number; y: number; scale: number },
    button: MarkKind | null,
    seconds: number,
  ) {
    for (let i = 0; i < count; i++) {
      const t = marks[i]!;
      const el = this.glints[i]!;
      const near = t.dist <= t.reach;
      const bob = Math.round(Math.sin(seconds * 4 + i * 1.7) * 2); // whole pixels: it stays crisp
      const twinkle = near ? 1 : 0.85 + 0.15 * Math.sin(seconds * 7 + i);
      el.style.opacity = (glow(t.dist, t.reach) * twinkle).toFixed(2);
      el.style.transform = `translate(${Math.round(world.x + t.x * world.scale - 8)}px,${Math.round(world.y + t.y * world.scale - 8 + bob)}px)${near ? ' scale(1.25)' : ''}`;
    }
    for (let i = count; i < this.shown; i++) this.glints[i]!.style.opacity = '0';
    this.shown = count;
    if (button !== this.icon) {
      this.icon = button;
      if (this.button) {
        this.button.hidden = button === null;
        if (button) this.button.dataset.icon = button;
      }
    }
  }
}
