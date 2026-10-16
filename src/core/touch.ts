import { TOUCH_CODES } from './bindings';
import { input } from './input';

// On-screen controls: a D-pad (drag your thumb for 8-way movement) plus buttons. Any element with a
// `data-key` attribute (the A/B buttons, the HUD menu button, the menu's close button) acts as that
// keyboard key while held. Markup is in index.html, styles in src/ui.css. The D-pad and A/B cluster
// follow the input actually in use: shown on phones/tablets or after a touch, hidden again as soon as
// a physical key is pressed (keyboard play works either way).

const DEADZONE = 0.25; // fraction of the pad radius where the thumb does nothing
const DIAGONAL = Math.sin(Math.PI / 8); // axis share needed to count, giving 8 equal 45° sectors
const PAD_KEYS = {
  right: TOUCH_CODES.right[0]!,
  left: TOUCH_CODES.left[0]!,
  down: TOUCH_CODES.down[0]!,
  up: TOUCH_CODES.up[0]!,
};
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

/**
 * iOS Safari ignores `user-scalable=no`: pinching, or tapping buttons in quick succession (a double-tap), zooms the page
 * and leaves the fixed controls off screen. Block both; `touch-action: manipulation` on html/body (index.html) covers
 * the double-tap, these cover pinch gestures and a second tap that lands on a non-interactive gap.
 */
function blockPageZoom() {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault());
  }
  // Outside the menu, shop, trade and choice screens, the Dungeon Master's bar and cards and the party's vote (whose buttons and code box need the browser's taps, focus and
  // synthesized clicks) a touch is only ever game input, which reads pointer events (those still fire). Cancelling the touch's default action disables
  // double-tap zoom, pinch and the long-press callout on the canvas, D-pad, buttons and the gaps between them.
  const keepDefault = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest(
      '#menu, #shop, #trade, #trade-request, #choices, #dm-bar, #dm-card, #dm-hot, #dialog .close, #dialog .voice, #request, #req-btn, #problem, #vote, input, textarea, select, a',
    );
  for (const type of ['touchstart', 'touchmove'] as const) {
    document.addEventListener(type, (e) => !keepDefault(e.target) && e.preventDefault(), { passive: false });
  }
  document.addEventListener('touchend', (e) => !keepDefault(e.target) && e.preventDefault(), { passive: false });

  // Safety net: if the page still ends up zoomed (scale > 1), reset it by re-applying the viewport tag.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const viewport = window.visualViewport;
  if (meta && viewport) {
    const content = meta.content;
    viewport.addEventListener('resize', () => {
      if (viewport.scale <= 1.01 || document.activeElement instanceof HTMLInputElement) return;
      meta.content = `${content}, minimum-scale=1`;
      requestAnimationFrame(() => (meta.content = content));
    });
  }
}

/** `onChange` fires when the controls appear or disappear, so the caller can re-layout around them. */
export function createTouchControls(onChange: () => void): TouchControls {
  bindKeyButtons();
  blockPageZoom();
  const root = document.getElementById('touch-controls');
  const pad = document.getElementById('dpad');
  const knob = document.getElementById('dpad-knob');
  const buttons = document.getElementById('buttons');
  if (!root || !pad || !knob || !buttons) return { active: false, rects: () => [] };

  // Start shown only when the primary pointer is a finger (phones, tablets). A touchscreen laptop or
  // desktop starts hidden; touching the screen shows the controls and typing a key hides them again.
  let active = false;
  // `notify` is false for the initial state: the caller hasn't finished constructing yet (its `touch`
  // field isn't assigned), and it lays out once itself right after.
  const setActive = (on: boolean, notify = true) => {
    if (on === active) return;
    active = on;
    root.hidden = !on;
    if (!on) releaseAll();
    if (notify) onChange();
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
  setActive(matchMedia('(pointer: coarse)').matches, false);

  return {
    get active() {
      return active;
    },
    rects: () => (active ? [pad.getBoundingClientRect(), buttons.getBoundingClientRect()] : []),
  };
}
