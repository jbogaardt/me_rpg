// Team colours (cosmetic, Pixi-free). A seat is drawn in its race's colour; seats of one race get lighter and darker shades of it, so
// two goblins (allies or rivals) still tell apart. The unit sheets carry Wyrmsun's default player colour (purple) baked in:
// `recolorTeam` swaps those pixels for the seat's colour, keeping their light and dark.

/** Scale each channel of a 0xRRGGBB colour by `k` (above 1 lightens towards white, below 1 darkens). */
export function shade(color: number, k: number): number {
  const ch = (shift: number) => {
    const c = (color >> shift) & 255;
    return Math.round(k <= 1 ? c * k : c + (255 - c) * (k - 1));
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** The brightness steps for the 1st, 2nd, 3rd... seat of one race. */
const STEPS = [1, 0.62, 1.38, 0.8];

/** `base` (the race's colour) for the `index`-th of the seats that share its race. */
export const seatShade = (base: number, index: number): number => shade(base, STEPS[index % STEPS.length] ?? 1);

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
