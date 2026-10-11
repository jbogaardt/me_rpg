import { input } from './input';

// On-screen controls for phones/tablets: a D-pad (drag your thumb for 8-way movement) and an action button.
// The markup and styles live in index.html; they stay hidden until the device has a touchscreen.

const DEADZONE = 0.25; // fraction of the pad radius where the thumb does nothing
const DIAGONAL = Math.sin(Math.PI / 8); // axis share needed to count, giving 8 equal 45° sectors
const PAD_KEYS = { right: 'ArrowRight', left: 'ArrowLeft', down: 'ArrowDown', up: 'ArrowUp' } as const;
type PadDir = keyof typeof PAD_KEYS;

export interface TouchControls {
  readonly active: boolean;
  /** Screen rects (CSS px) the controls cover, so the HUD can stay clear of them. Empty when hidden. */
  rects(): DOMRect[];
}

/** `onShow` fires if the controls appear later than creation, so the caller can re-layout around them. */
export function createTouchControls(onShow: () => void): TouchControls {
  const root = document.getElementById('touch-controls');
  const pad = document.getElementById('dpad');
  const knob = document.getElementById('dpad-knob');
  const action = document.getElementById('action-btn');
  if (!root || !pad || !knob || !action) return { active: false, rects: () => [] };

  // Show up front on touch devices, or as soon as a touch lands (e.g. a laptop with a touchscreen).
  let active = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  root.hidden = !active;
  window.addEventListener('pointerdown', (e) => {
    if (active || e.pointerType !== 'touch') return;
    active = true;
    root.hidden = false;
    onShow();
  });

  // Long-presses shouldn't pop up the context menu or text selection.
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- D-pad ---
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

  // --- Action button (talk / advance dialog) ---
  const press = (down: boolean) => {
    input.setVirtual('Enter', down);
    action.classList.toggle('pressed', down);
  };
  action.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    action.setPointerCapture(e.pointerId);
    press(true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    action.addEventListener(type, () => press(false));
  }

  return {
    get active() {
      return active;
    },
    rects: () => (active ? [pad.getBoundingClientRect(), action.getBoundingClientRect()] : []),
  };
}
