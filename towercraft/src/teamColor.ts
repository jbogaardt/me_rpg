// Team colours (cosmetic, Pixi-free). A seat is drawn in its race's colour; seats of one race get other hues, so
// two goblins (allies or rivals) still tell apart. The unit sheets carry Wyrmsun's default player colour (purple) baked in:
// `recolorTeam` swaps those pixels for the seat's colour, keeping their light and dark.

/** The colours for the 2nd, 3rd... seat of one race: other hues, none purple (the sheets' own colour), kept apart from the race colours. */
const ALTERNATES = [0xe8d23a, 0x4cc46a, 0x2ec4c4, 0xf08cc0];

/** `base` (the race's colour) for the `index`-th of the seats that share its race, then an alternate hue for each further one. */
export const seatColor = (base: number, index: number): number =>
  index <= 0 ? base : (ALTERNATES[(index - 1) % ALTERNATES.length] ?? base);

/** Is this pixel part of the sheets' purple player colour (red and blue near each other, green well below both)? */
export function isTeamPixel(r: number, g: number, b: number): boolean {
  const hi = Math.max(r, b);
  return hi >= 24 && g < hi * 0.6 && Math.min(r, b) > hi * 0.6;
}

/** Recolour the purple pixels of RGBA `data` (in place) to `color`, keeping each pixel's brightness. */
export function recolorTeam(data: Uint8ClampedArray, color: number): void {
  const cr = (color >> 16) & 255;
  const cg = (color >> 8) & 255;
  const cb = color & 255;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (data[i + 3] === 0 || !isTeamPixel(r, g, b)) continue;
    const k = Math.min(1.7, (Math.max(r, b) + 8) / 96);
    data[i] = Math.min(255, cr * k);
    data[i + 1] = Math.min(255, cg * k);
    data[i + 2] = Math.min(255, cb * k);
  }
}
