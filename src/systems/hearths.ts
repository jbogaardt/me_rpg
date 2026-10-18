import type { ParticleEffectName } from './particleEffects';

/**
 * Where a map gives off smoke, flame or bubbles (Pixi-free; `entities/Hearth.ts` draws it). Core engine, and visual
 * only: nothing here touches the rules, so a guest finds the same sources in the same map and needs no message.
 * What makes a source is map data, never a content id: an object's `tag` (`fire`, `torch`), a surface name (`lava`,
 * `caveLava`, a cave or sewer floor for drips), a bush or flower at night (fireflies).
 */
export type HearthKind = 'fire' | 'torch' | 'lava' | 'drip' | 'firefly';

export interface HearthSource {
  kind: HearthKind;
  x: number;
  y: number;
}

/** The effects a source runs while it is near the screen (each is continuous: stopped when it scrolls away). */
export const HEARTH_EFFECTS: Record<HearthKind, readonly ParticleEffectName[]> = {
  fire: ['flame', 'embers', 'smoke'],
  torch: ['flame', 'smoke'],
  lava: ['lavaBubble'],
  drip: ['drip'],
  firefly: ['fireflies'],
};

/** How far past the screen's edge a source keeps running (px), so its smoke is already up when it scrolls in. */
export const HEARTH_MARGIN: Record<HearthKind, number> = { fire: 48, torch: 48, lava: 32, drip: 16, firefly: 90 };

/** Kinds that only run at night. */
export const NIGHT_ONLY: readonly HearthKind[] = ['firefly'];

const LAVA = new Set(['lava', 'caveLava']);
const DRIPPY = new Set(['caveFloor', 'caveRubble', 'sewerFloor']);
const CELL = 32;

/** One cell in `every` is picked, the same ones each time (a map keeps its look between visits). */
const picked = (col: number, row: number, every: number, salt: number) =>
  ((Math.imul(col + salt, 73856093) ^ Math.imul(row + salt * 3, 19349663)) >>> 0) % every === 0;

interface Scan {
  width: number;
  height: number;
  surface: ArrayLike<number>;
  surfaces: readonly string[];
  objects: readonly { px: number; py: number; w: number; h: number; tag?: string }[];
  indoor: boolean;
}

/** Every source in a map. */
export function findHearths(data: Scan): HearthSource[] {
  const out: HearthSource[] = [];
  for (const o of data.objects) {
    const cx = o.px + o.w / 2;
    if (o.tag === 'fire') out.push({ kind: 'fire', x: cx, y: o.py + o.h * 0.5 });
    else if (o.tag === 'torch') out.push({ kind: 'torch', x: cx, y: o.py + 10 });
    else if ((o.tag === 'bush' || o.tag === 'flower') && !data.indoor) {
      const col = Math.floor(cx / CELL);
      const row = Math.floor((o.py + o.h) / CELL);
      if (picked(col, row, 9, 5)) out.push({ kind: 'firefly', x: cx, y: o.py + o.h * 0.4 });
    }
  }
  for (let row = 0; row < data.height; row++) {
    for (let col = 0; col < data.width; col++) {
      const name = data.surfaces[data.surface[row * data.width + col] ?? 0] ?? '';
      const lava = LAVA.has(name);
      if (!lava && !DRIPPY.has(name)) continue;
      if (lava ? picked(col, row, 6, 1) : picked(col, row, 45, 2))
        out.push({ kind: lava ? 'lava' : 'drip', x: col * CELL + CELL / 2, y: row * CELL + (lava ? CELL / 2 : 6) });
    }
  }
  return out;
}

/** Is the source close enough to the screen (`view`, world px) to be running? */
export function hearthNear(s: HearthSource, view: { x: number; y: number; w: number; h: number }): boolean {
  const m = HEARTH_MARGIN[s.kind];
  return s.x > view.x - m && s.x < view.x + view.w + m && s.y > view.y - m && s.y < view.y + view.h + m;
}
