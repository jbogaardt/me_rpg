const held = new Set<string>();
const virtual = new Set<string>(); // keys held by on-screen touch controls (see touch.ts)
const pressed = new Set<string>();

window.addEventListener('keydown', (e) => {
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
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
