// What each attacker fires and how it lands (cosmetic, Pixi-free, so it is tested). The rules say only where a shot came from and
// went to, whether it was a blow, and its blast radius; the picture is chosen here from who made it: a bowman's arrow, a ballista's
// bolt, a cannon's ball, a catapult's rock, a spitter's slime. The sheets (art/fx/) are Wyrmsun's; `fxArt.ts` cuts them.

export type MissileId = 'arrow' | 'goblin_arrow' | 'bolt' | 'javelin' | 'cannon' | 'rock' | 'slime' | 'bullet';
/** How a missile ends: a small puff of dust, the siege impact, a fireball, or a green splash. */
export type ImpactId = 'puff' | 'impact' | 'explosion' | 'splash';

export interface MissileSpec {
  /** Flies straight and points along its flight (a lobbed one rises, falls and grows with its height instead). */
  lob: boolean;
  /** Its drawn size (px of the picture's longer side, before the camera's zoom). */
  size: number;
  impact: ImpactId;
  /** A lobbed shot's height over its path as a share of the distance, and its cap (px). */
  arc: number;
  arcMax: number;
}

export const MISSILES: Record<MissileId, MissileSpec> = {
  arrow: { lob: false, size: 40, impact: 'puff', arc: 0.07, arcMax: 28 },
  goblin_arrow: { lob: false, size: 36, impact: 'puff', arc: 0.07, arcMax: 28 },
  bolt: { lob: false, size: 60, impact: 'puff', arc: 0.03, arcMax: 12 },
  javelin: { lob: false, size: 60, impact: 'puff', arc: 0.09, arcMax: 30 },
  bullet: { lob: false, size: 14, impact: 'puff', arc: 0, arcMax: 0 },
  cannon: { lob: true, size: 30, impact: 'explosion', arc: 0.2, arcMax: 60 },
  rock: { lob: true, size: 34, impact: 'impact', arc: 0.28, arcMax: 90 },
  slime: { lob: true, size: 30, impact: 'splash', arc: 0.24, arcMax: 70 },
};

/** What fired: a unit's sheet (art/units/<sheet>), or a tower's picture (art/<art>). */
export interface Shooter {
  kind: 'unit' | 'tower' | 'castle';
  sheet?: string;
  art?: string;
}

/** Which missile a shot is. `splash` is the shot's blast radius (cells): a blast is a lobbed ball, rock or glob, never an arrow. */
export function missileFor(who: Shooter | undefined, splash: number): MissileId {
  const name = who?.kind === 'unit' ? (who.sheet ?? '') : (who?.art ?? '');
  if (who?.kind === 'castle') return 'bolt';
  if (/ballista/.test(name)) return 'bolt';
  if (/cannon/.test(name)) return 'cannon';
  if (/catapult/.test(name)) return 'rock';
  if (/thunderer|musketeer/.test(name)) return 'bullet';
  if (who?.kind === 'tower' && /goblin_guard_tower/.test(name)) return 'slime';
  if (who?.kind === 'tower' && /goblin_market/.test(name)) return 'javelin';
  if (/goblin/.test(name)) return splash > 0 ? 'slime' : 'goblin_arrow';
  if (splash > 0) return 'rock';
  return 'arrow';
}

/** The frame (0..n-1) of an animation that lasts `life` seconds, `age` in; the last frame holds. */
export const frameAt = (n: number, age: number, life: number) =>
  Math.max(0, Math.min(n - 1, Math.floor((age / life) * n)));

/** The picture size a lobbed missile has at flight fraction `f` (0..1): small on the ground, larger at its height. 0..2 indexes the sheet's three sizes. */
export const lobSize = (f: number) => {
  const h = Math.sin(Math.PI * Math.max(0, Math.min(1, f)));
  return h < 0.4 ? 0 : h < 0.8 ? 1 : 2;
};

/** The impact a shot ends in, by what it carried: bigger blasts for bigger radii. `radius` is in px. */
export function impactFor(id: MissileId, splash: number): ImpactId {
  if (splash <= 0) return 'puff';
  return MISSILES[id].impact === 'puff' ? 'impact' : MISSILES[id].impact;
}

/** The (x, y) of frame `i` in a sheet of `cols` columns and square cells of `size` px. */
export const cellOf = (i: number, cols: number, size: number): [number, number] => [
  (i % cols) * size,
  Math.floor(i / cols) * size,
];
