// Each seat's colour, and the building pictures painted in it (Pixi-free, cosmetic: lockstep never sees it).
//
// Wyrmsun's buildings carry their player colour as purple: roofs, banners, cloth. `recolor` turns those pixels to a seat's hue and
// leaves the wood, stone and gold alone, so a building keeps its shading and only its colour changes. A seat's colour is its race's
// hue in a duel (`RACE_HUE`), its side's with more seats (`SIDE_HUE`), and a shade of that hue for each further seat that shares it
// (`shadeOf`), so two seats of one race still tell apart.

export interface Hsl {
  /** Degrees, 0 to 360. */
  h: number;
  /** 0 to 1. */
  s: number;
  /** 0 to 1. */
  l: number;
}

/** The hue of each race's colour in a duel: Goblins green, Dwarves blue, Germanic red. */
export const RACE_HUE: Record<string, number> = { swarm: 112, titan: 212, legion: 2 };
/** The hue of each side's colour with more seats: yours blue, the foe's red. */
export const SIDE_HUE = { mine: 212, foe: 2 } as const;

/** The purple the pictures are painted in, and how far either side of it a pixel may be and still count as the player colour. */
const PAINT_HUE = 290;
const PAINT_SPAN = 52;
/** Below this saturation a pixel is grey (stone, shadow), whatever its hue. */
const PAINT_MIN_SAT = 0.12;

/** How each further seat of one hue is shaded: lighter, darker, then a little toward the next hue. */
const SHADES: { dh: number; dl: number }[] = [
  { dh: 0, dl: 0 },
  { dh: 0, dl: 0.16 },
  { dh: 0, dl: -0.14 },
  { dh: 18, dl: 0.06 },
];

/** The colour of the `index`-th seat (0 first) of a hue: the base colour, then its shades. */
export function shadeOf(hue: number, index: number): Hsl {
  const step = SHADES[index % SHADES.length]!;
  return { h: (hue + step.dh + 360) % 360, s: 0.62, l: 0.5 + step.dl };
}

export function hexToHsl(rgb: number): Hsl {
  const r = ((rgb >> 16) & 255) / 255;
  const g = ((rgb >> 8) & 255) / 255;
  const b = (rgb & 255) / 255;
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex({ h, s, l }: Hsl): number {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const channel = (n: number) => Math.round(f(n) * 255);
  return ((channel(0) << 16) | (channel(8) << 8) | channel(4)) >>> 0;
}

/**
 * Paint the purple pixels of a picture (RGBA, in place) the colour `to`: their hue moves to the seat's, keeping how far each sits
 * from the purple, and their lightness moves by `to.l - 0.5` so a lighter shade stays lighter. Other pixels, and all alpha, are left.
 */
export function recolor(data: Uint8ClampedArray, to: Hsl): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! === 0) continue;
    const c = hexToHsl((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    const off = ((c.h - PAINT_HUE + 540) % 360) - 180; // -180..180 from the purple
    if (c.s < PAINT_MIN_SAT || Math.abs(off) > PAINT_SPAN) continue;
    const painted = hslToHex({
      h: (to.h + off + 360) % 360,
      s: c.s,
      l: Math.max(0, Math.min(1, c.l + to.l - 0.5)),
    });
    data[i] = painted >> 16;
    data[i + 1] = (painted >> 8) & 255;
    data[i + 2] = painted & 255;
  }
}
