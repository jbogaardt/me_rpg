const held = new Set<string>();
const virtual = new Set<string>(); // keys held by on-screen touch controls (see touch.ts)
const pressed = new Set<string>();

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

window.addEventListener('keydown', (e) => {
  // Typing or pasting a code must not move the hero, flip menu tabs (A/D) or close the menu (I). Escape still closes it.
  if (isTextField(e.target) && e.code !== 'Escape') return;
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
  // Keep the page from scrolling, but let Space/Enter click a focused button.
  const onButton = e.target instanceof HTMLButtonElement;
  if (e.code.startsWith('Arrow') || e.code === 'Tab' || (e.code === 'Space' && !onButton)) e.preventDefault();
});
window.addEventListener('keyup', (e) => held.delete(e.code));

export const input = {
  isDown: (...codes: string[]) => codes.some((c) => held.has(c) || virtual.has(c)),
  /** True once per key press; cleared by endFrame(). */
  wasPressed: (...codes: string[]) => codes.some((c) => pressed.has(c)),
  /** Hold or release a key from an on-screen control, as if it were typed on the keyboard. */
  setVirtual(code: string, down: boolean) {
    if (down && !virtual.has(code) && !held.has(code)) pressed.add(code);
    if (down) virtual.add(code);
    else virtual.delete(code);
  },
  endFrame: () => pressed.clear(),
};
