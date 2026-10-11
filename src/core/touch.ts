import { input } from './input';

// On-screen controls: a D-pad (drag your thumb for 8-way movement) plus buttons. Any element with a
// `data-key` attribute (the A/B buttons, the HUD menu button, the menu's close button) acts as that
// keyboard key while held. Markup is in index.html, styles in src/ui.css. The D-pad and A/B cluster
// follow the input actually in use: shown on phones/tablets or after a touch, hidden again as soon as
// a physical key is pressed (keyboard play works either way).

const DEADZONE = 0.25; // fraction of the pad radius where the thumb does nothing
const DIAGONAL = Math.sin(Math.PI / 8); // axis share needed to count, giving 8 equal 45° sectors
const PAD_KEYS = { right: 'ArrowRight', left: 'ArrowLeft', down: 'ArrowDown', up: 'ArrowUp' } as const;
type PadDir = keyof typeof PAD_KEYS;

export interface TouchControls {
  readonly active: boolean;
  /** Screen rects (CSS px) of the D-pad and the button cluster, so the HUD can stay clear. Empty when hidden. */
  rects(): DOMRect[];
}

/** Make every `[data-key]` element press its key while a pointer (finger or mouse) holds it. */
function bindKeyButtons() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-key]')) {
    const code = el.dataset.key!;
    const press = (down: boolean) => {
      input.setVirtual(code, down);
      el.classList.toggle('pressed', down);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      press(true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      el.addEventListener(type, () => press(false));
    }
    // Long-presses shouldn't pop up the context menu or text selection.
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

/** `onChange` fires when the controls appear or disappear, so the caller can re-layout around them. */
export function createTouchControls(onChange: () => void): TouchControls {
  bindKeyButtons();
  const root = document.getElementById('touch-controls');
  const pad = document.getElementById('dpad');
  const knob = document.getElementById('dpad-knob');
  const buttons = document.getElementById('buttons');
  if (!root || !pad || !knob || !buttons) return { active: false, rects: () => [] };

  // Start shown only when the primary pointer is a finger (phones, tablets). A touchscreen laptop or
  // desktop starts hidden; touching the screen shows the controls and typing a key hides them again.
  let active = false;
  const setActive = (on: boolean) => {
    if (on === active) return;
    active = on;
    root.hidden = !on;
    if (!on) releaseAll();
    onChange();
  };
  window.addEventListener('pointerdown', (e) => e.pointerType === 'touch' && setActive(true), { capture: true });
  window.addEventListener('keydown', () => setActive(false));
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  let padPointer: number | null = null;
  const setDirs = (on: Set<PadDir>) => {
    for (const dir of Object.keys(PAD_KEYS) as PadDir[]) {
      input.setVirtual(PAD_KEYS[dir], on.has(dir));
      pad.classList.toggle(dir, on.has(dir));
    }
  };
  const steer = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    const radius = r.width / 2;
    const dx = e.clientX - (r.left + radius);
    const dy = e.clientY - (r.top + radius);
    const dist = Math.hypot(dx, dy);
    const on = new Set<PadDir>();
    if (dist > radius * DEADZONE) {
      if (dx > dist * DIAGONAL) on.add('right');
      if (dx < -dist * DIAGONAL) on.add('left');
      if (dy > dist * DIAGONAL) on.add('down');
      if (dy < -dist * DIAGONAL) on.add('up');
    }
    setDirs(on);
    const k = Math.min(1, (radius * 0.55) / (dist || 1)); // keep the knob inside the pad
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };
  const releasePad = (e: PointerEvent) => {
    if (e.pointerId !== padPointer) return;
    padPointer = null;
    setDirs(new Set());
    knob.style.transform = '';
  };
  const releaseAll = () => {
    padPointer = null;
    setDirs(new Set());
    knob.style.transform = '';
  };
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    padPointer = e.pointerId;
    pad.setPointerCapture(e.pointerId);
    steer(e);
  });
  pad.addEventListener('pointermove', (e) => e.pointerId === padPointer && steer(e));
  pad.addEventListener('pointerup', releasePad);
  pad.addEventListener('pointercancel', releasePad);
  pad.addEventListener('lostpointercapture', releasePad);
  setActive(matchMedia('(pointer: coarse)').matches);

  return {
    get active() {
      return active;
    },
    rects: () => (active ? [pad.getBoundingClientRect(), buttons.getBoundingClientRect()] : []),
  };
}
