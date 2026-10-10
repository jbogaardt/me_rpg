const held = new Set<string>();
const pressed = new Set<string>();

window.addEventListener('keydown', (e) => {
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => held.delete(e.code));

export const input = {
  isDown: (...codes: string[]) => codes.some((c) => held.has(c)),
  /** True once per key press; cleared by endFrame(). */
  wasPressed: (...codes: string[]) => codes.some((c) => pressed.has(c)),
  endFrame: () => pressed.clear(),
};
