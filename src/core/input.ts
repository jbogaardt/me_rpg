const held = new Set<string>(); // physical: keyboard codes plus 'Mouse0'/'Mouse1'/'Mouse2' (mouse only on the game canvas)
const virtual = new Set<string>(); // keys held by on-screen touch controls (see touch.ts)
const pressed = new Set<string>();
const virtualPressed = new Set<string>();
let capture: ((code: string) => void) | null = null;

/** Form fields (the menu's multiplayer code boxes) take typing, not game input. */
function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLInputElement)
  );
}

function press(code: string) {
  if (!held.has(code)) pressed.add(code);
  held.add(code);
}

window.addEventListener('keydown', (e) => {
  if (capture) {
    // Rebinding: the next key goes to the menu, not the game (so Escape can cancel without closing it).
    e.preventDefault();
    if (e.repeat) return;
    const done = capture;
    capture = null;
    done(e.code);
    return;
  }
  // Typing or pasting a code must not move the hero, flip menu tabs (A/D) or close the menu (I). Escape still closes it.
  if (isTextField(e.target) && e.code !== 'Escape') return;
  press(e.code);
  // Keep the page from scrolling, but let Space/Enter click a focused button.
  const onButton = e.target instanceof HTMLButtonElement;
  if (e.code.startsWith('Arrow') || e.code === 'Tab' || (e.code === 'Space' && !onButton)) e.preventDefault();
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear()); // a key released in another window must not stay held

// Mouse buttons count only when pressed on the game canvas (menu, HUD and touch buttons are other elements), and only a
// real mouse: fingers use the on-screen controls.
// `PointerEvent.buttons` bit of each `button` index (left, middle, right, back, forward).
const BUTTON_BITS = [1, 4, 2, 8, 16];
const anyMouseHeld = () => [...held].some((c) => c.startsWith('Mouse'));
/**
 * Bring the held mouse buttons in line with `e.buttons`. A second button pressed (or the first released) while another is
 * down fires only `pointermove`, and `pointerup` comes once, for the last button: going by `e.button` alone left Mouse0
 * held forever after left+right chording.
 */
function syncMouse(e: PointerEvent, canPress: boolean) {
  if (e.pointerType !== 'mouse') return;
  BUTTON_BITS.forEach((bit, button) => {
    const code = `Mouse${button}`;
    if (!(e.buttons & bit)) held.delete(code);
    else if (canPress && e.target instanceof HTMLCanvasElement) press(code);
  });
}
window.addEventListener('pointerdown', (e) => syncMouse(e, true));
window.addEventListener('pointermove', (e) => syncMouse(e, anyMouseHeld())); // a chorded second button arrives as a move
window.addEventListener('pointerup', (e) => syncMouse(e, false));
// Where the pointer last was over the game (CSS px): the mouse as it moves, or the spot a finger last tapped. Used to aim.
let aimPoint: { x: number; y: number } | null = null;
const trackAimPoint = (e: PointerEvent) => {
  if (e.target instanceof HTMLCanvasElement) aimPoint = { x: e.clientX, y: e.clientY };
};
// A finger (or pen) tapping the game canvas this frame: the Dungeon Master taps a foe to possess it. Cleared by endFrame().
let tapPoint: { x: number; y: number } | null = null;
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' && e.target instanceof HTMLCanvasElement) tapPoint = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && trackAimPoint(e));
window.addEventListener('pointerdown', trackAimPoint);
window.addEventListener('pointercancel', () => {
  for (const code of [...held]) if (code.startsWith('Mouse')) held.delete(code);
});
// No browser context menu or middle-click autoscroll over the game: those buttons are controls.
window.addEventListener('contextmenu', (e) => e.target instanceof HTMLCanvasElement && e.preventDefault());
window.addEventListener(
  'mousedown',
  (e) => e.button === 1 && e.target instanceof HTMLCanvasElement && e.preventDefault(),
);

export const input = {
  isDown: (...codes: string[]) => codes.some((c) => held.has(c) || virtual.has(c)),
  /** True once per key press; cleared by endFrame(). */
  wasPressed: (...codes: string[]) => codes.some((c) => pressed.has(c) || virtualPressed.has(c)),
  /** Like isDown/wasPressed but only the keyboard and mouse, not the on-screen buttons. */
  isHeld: (...codes: string[]) => codes.some((c) => held.has(c)),
  wasHit: (...codes: string[]) => codes.some((c) => pressed.has(c)),
  /** Same, for the on-screen buttons only. */
  isTouched: (...codes: string[]) => codes.some((c) => virtual.has(c)),
  wasTouched: (...codes: string[]) => codes.some((c) => virtualPressed.has(c)),
  /** The mouse pointer, or the last tap, over the game in CSS px; null before there has been one. */
  pointer: (): { x: number; y: number } | null => aimPoint,
  /** Where a finger tapped the game this frame (CSS px), or null. */
  tap: (): { x: number; y: number } | null => tapPoint,
  /** Hold or release a key from an on-screen control, as if it were typed on the keyboard. */
  setVirtual(code: string, down: boolean) {
    if (down && !virtual.has(code)) virtualPressed.add(code);
    if (down) virtual.add(code);
    else virtual.delete(code);
  },
  /** Hand the next key press (any key, Escape included) to `done` instead of the game. Returns a cancel function. */
  captureKey(done: (code: string) => void): () => void {
    capture = done;
    return () => {
      if (capture === done) capture = null;
    };
  },
  endFrame() {
    tapPoint = null;
    pressed.clear();
    virtualPressed.clear();
  },
};
