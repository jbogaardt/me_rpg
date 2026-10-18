import type { HearthKind, HearthSource } from './hearths';

/**
 * Pools of light (Pixi-free, tested; `entities/DarknessLayer.ts` cuts them out of the underground's dark). Core engine and
 * visual only. What gives light is the same map data that gives smoke (`hearths.ts`): a fire, a torch, lava; every hero
 * carries a light of their own (the `darkness` capability's `radius`). Every page works the same lights out from its own
 * copy of the map and the players' positions, so a co-op guest needs nothing from the host.
 */
export interface Light {
  x: number;
  y: number;
  /** World px. */
  r: number;
  /** How bright the flame burns now, 0.7 (a gutter) to 1; absent is steady. */
  f?: number;
}

/** How far each kind of source lights the ground round it (px). A lake of lava is lit by many small sources. */
export const LIGHT_RADIUS: Partial<Record<HearthKind, number>> = { fire: 150, torch: 112, lava: 84 };

/** The warm unsteadiness of a flame: a factor near 1 that wanders with time `t` (seconds) and differs per source. */
export function flicker(t: number, seed: number): number {
  return (
    1 +
    0.04 * Math.sin(t * 7.3 + seed) +
    0.03 * Math.sin(t * 13.1 + seed * 2.7) +
    0.02 * Math.sin(t * 3.1 + seed * 0.4) +
    0.008 * Math.sin(t * 29 + seed * 5.3) // the quick crackle
  );
}

/** The lights of the sources whose pool touches the screen (`view`, world px), flickering at time `t`. */
export function visibleLights(
  sources: readonly HearthSource[],
  view: { x: number; y: number; w: number; h: number },
  t: number,
): Light[] {
  const out: Light[] = [];
  sources.forEach((s, i) => {
    const r = LIGHT_RADIUS[s.kind];
    if (r === undefined) return;
    if (s.x < view.x - r || s.x > view.x + view.w + r || s.y < view.y - r || s.y > view.y + view.h + r) return;
    const fl = s.kind === 'lava' ? 1 : flicker(t, i);
    out.push({ x: s.x, y: s.y, r: r * fl, f: Math.min(1, 0.9 + (fl - 1) * 2.4) });
  });
  return out;
}

/** How much the warm glow of lights shows: none in full daylight, all of it by night (`sky` is the day clock's 0xRRGGBB multiply colour). */
export function glowStrength(sky: number): number {
  const lum = (((sky >> 16) & 255) * 0.3 + ((sky >> 8) & 255) * 0.59 + (sky & 255) * 0.11) / 255;
  return Math.max(0, Math.min(1, (1 - lum) * 1.8));
}
