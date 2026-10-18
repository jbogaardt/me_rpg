import { gridSvg } from './gridSvg';
import type { MarkKind } from './interactThings';

// The interact key shown, not told: on touch the interact button (`#btn-use`, index.html) is hidden unless something is in
// reach, and wears a pixel glyph of what it would do (speech bubble, hand, chest). Nothing is drawn over things in the
// world (a sparkle over each person and chest was tried and dropped). No text, no per-frame allocation; cosmetic and local
// on every page (nothing is sent). Which things count: interactThings.ts. Style: src/ui.css (`#btn-use`).

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

/** Set the art once as CSS variables (one glyph per kind for the button). */
function installArt() {
  const root = document.documentElement.style;
  root.setProperty('--glyph-talk', url(gridSvg(TALK, { ...INK, x: '#f4ead0', d: '#5a3a14' })));
  root.setProperty('--glyph-hand', url(gridSvg(HAND, { ...INK, x: '#f4ead0' })));
  root.setProperty('--glyph-chest', url(gridSvg(CHEST, { ...INK, y: '#d4a24a', b: '#8a5a24', l: '#f2d38a' })));
}

export class InteractMarks {
  private button = document.getElementById('btn-use');
  private icon: MarkKind | null = null;

  constructor() {
    installArt();
  }

  /** Each frame: `button` is the glyph for the interact button, or null to hide it. */
  update(button: MarkKind | null) {
    if (button === this.icon) return;
    this.icon = button;
    if (!this.button) return;
    this.button.hidden = button === null;
    if (button) this.button.dataset.icon = button;
  }
}
