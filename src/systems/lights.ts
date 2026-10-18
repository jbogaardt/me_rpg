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
  /** How bright it burns, near 1 (a flame's flicker; `LightGlow` scales the glow by it). */
  k: number;
}

/** How far each kind of source lights the ground round it (px). A lake of lava is lit by many small sources. */
export const LIGHT_RADIUS: Partial<Record<HearthKind, number>> = { fire: 150, torch: 112, lava: 84 };

/** A stable per-source phase from where it stands, so neighbouring torches never flicker in step. */
export function flickerSeed(x: number, y: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (h - Math.floor(h)) * 100; // 0..100 radians
}

/** The warm unsteadiness of a flame's reach: a factor near 1 that wanders with time `t` (seconds) and differs per source. */
export function flicker(t: number, seed: number): number {
  return (
    1 +
    0.06 * Math.sin(t * 7.3 + seed) +
    0.04 * Math.sin(t * 13.1 + seed * 2.7) +
    0.025 * Math.sin(t * 3.1 + seed * 0.4)
  );
}

/** How bright the flame burns: a faster, deeper wobble than the reach (phases differ), with a quick gutter now and then. */
export function flameBrightness(t: number, seed: number): number {
  const gutter = Math.max(0, Math.sin(t * 2.3 + seed * 1.3) * Math.sin(t * 3.7 + seed * 0.9) - 0.55) * 0.5;
  return (
    1 +
    0.09 * Math.sin(t * 17.3 + seed * 1.9) +
    0.06 * Math.sin(t * 29.7 + seed * 3.3) +
    0.04 * Math.sin(t * 5.1 + seed * 0.7) -
    gutter
  );
}

/**
 * The lights of the sources whose pool touches the screen (`view`, world px), flickering at time `t`. Fills `out` (its
 * `Light` objects are reused, so a frame allocates nothing once it has grown to the most lights seen) and returns it;
 * `seeds` holds each source's phase (`flickerSeed`).
 */
export function visibleLights(
  sources: readonly HearthSource[],
  view: { x: number; y: number; w: number; h: number },
  t: number,
  out: Light[] = [],
  seeds?: readonly number[],
): Light[] {
  let n = 0;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]!;
    const r = LIGHT_RADIUS[s.kind];
    if (r === undefined) continue;
    if (s.x < view.x - r || s.x > view.x + view.w + r || s.y < view.y - r || s.y > view.y + view.h + r) continue;
    const seed = seeds?.[i] ?? flickerSeed(s.x, s.y);
    const lava = s.kind === 'lava';
    const l = (out[n] ??= { x: 0, y: 0, r: 0, k: 1 });
    l.x = s.x;
    l.y = s.y;
    l.r = lava ? r : r * flicker(t, seed);
    l.k = lava ? 1 : flameBrightness(t, seed);
    n++;
  }
  out.length = n;
  return out;
}

/** How much the warm glow of lights shows: none in full daylight, all of it by night (`sky` is the day clock's 0xRRGGBB multiply colour). */
export function glowStrength(sky: number): number {
  const lum = (((sky >> 16) & 255) * 0.3 + ((sky >> 8) & 255) * 0.59 + (sky & 255) * 0.11) / 255;
  return Math.max(0, Math.min(1, (1 - lum) * 1.8));
}
