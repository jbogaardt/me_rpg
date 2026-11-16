// The effects library: every sound the page can make, as data (Pixi-free, cosmetic). Each kind is a set of Ogg variants
// `public/audio/sfx/<kind>-<n>.ogg` (credits in `public/audio/CREDITS.md`, build recipes in the sound agent's scratch script).
// A kind says how many variants it has, how loud it plays (`gain`, on top of the loudness the files were normalised to), how many
// may start in one tick (`max`), how soon it may repeat (`gap`, seconds), how it ranks when a fight is too busy (`prio`), how much
// its pitch drifts (`pitch`) and whether it dips the music and the ambience (`duck`). `audio.ts` plays from this table.

/** Why a sound exists: the groups are mixed alike (a fight's blows, the deaths, the world's buildings, alerts, the interface). */
export type Group = 'combat' | 'impact' | 'death' | 'world' | 'alert' | 'ui' | 'sting';

export interface Spec {
  variants: number;
  gain: number;
  max: number;
  gap: number;
  prio: number;
  pitch: number;
  group: Group;
  duck?: { by: number; for: number };
}

const s = (
  group: Group,
  variants: number,
  gain: number,
  max: number,
  prio: number,
  gap = 0.05,
  pitch = 0.06,
  duck?: Spec['duck'],
): Spec => ({
  group,
  variants,
  gain,
  max,
  prio,
  gap,
  pitch,
  ...(duck ? { duck } : {}),
});

export const BANK = {
  // weapons: the swing or release, heard where the attacker is
  sword: s('combat', 4, 0.8, 3, 2),
  axe: s('combat', 4, 0.9, 3, 2),
  spear: s('combat', 4, 0.8, 3, 2),
  dagger: s('combat', 3, 0.7, 2, 1),
  bow: s('combat', 4, 0.7, 3, 1),
  ballista: s('combat', 3, 0.9, 2, 4),
  gun: s('combat', 4, 0.8, 2, 3),
  cannon: s('combat', 4, 0.9, 2, 5),
  catapult: s('combat', 3, 0.9, 2, 5),
  flame: s('combat', 3, 0.7, 1, 3, 0.12),
  bat: s('combat', 4, 0.6, 2, 1),
  gryphon: s('combat', 4, 0.7, 2, 2),
  charge: s('combat', 3, 0.8, 2, 3),
  spit: s('combat', 3, 0.7, 2, 2),
  // where it lands
  arrowhit: s('impact', 4, 0.7, 3, 1, 0.04),
  hitwood: s('impact', 4, 0.9, 2, 3),
  hitstone: s('impact', 4, 0.9, 2, 3),
  blast: s('impact', 4, 0.9, 2, 6, 0.08, 0.05),
  // the fallen
  deathgoblin: s('death', 4, 0.8, 2, 2, 0.06, 0.08),
  deathdwarf: s('death', 4, 0.8, 2, 2, 0.06, 0.08),
  deathhuman: s('death', 4, 0.8, 2, 2, 0.06, 0.08),
  deathbeast: s('death', 4, 0.8, 1, 3, 0.1, 0.06),
  deathflyer: s('death', 4, 0.7, 2, 2, 0.06, 0.08),
  // the world
  build: s('world', 5, 0.8, 2, 4, 0.1),
  razedSmall: s('world', 4, 0.9, 2, 6, 0.1),
  razedLarge: s('world', 4, 0.9, 1, 7, 0.1),
  fall: s('world', 3, 1, 1, 9, 1, 0.02, { by: 0.6, for: 3 }),
  upgrade: s('world', 3, 0.8, 1, 5, 0.2),
  castle: s('world', 2, 0.9, 1, 8, 0.5, 0, { by: 0.4, for: 2.5 }),
  bunker: s('world', 3, 0.7, 1, 3, 0.15),
  // alerts the player must hear
  alarm: s('alert', 2, 0.9, 1, 10, 2, 0.02, { by: 0.55, for: 3 }),
  warn: s('alert', 2, 0.8, 1, 9, 2, 0.02),
  clock: s('alert', 1, 0.8, 1, 9, 5, 0),
  clockLast: s('alert', 1, 0.8, 1, 9, 5, 0),
  coin: s('alert', 3, 0.8, 1, 1, 1, 0.04),
  win: s('sting', 1, 0.9, 1, 10, 4, 0, { by: 0.7, for: 9 }),
  lose: s('sting', 1, 0.9, 1, 10, 4, 0, { by: 0.7, for: 12 }),
  // the interface
  click: s('ui', 3, 0.9, 1, 1, 0.04, 0.04),
  tick: s('ui', 2, 0.9, 1, 1, 0.06, 0.04),
  refuse: s('ui', 2, 0.9, 1, 1, 0.2, 0.02),
  confirm: s('ui', 3, 0.8, 1, 1, 0.1, 0.02),
} as const satisfies Record<string, Spec>;

export type FileKind = keyof typeof BANK;
export const KINDS = Object.keys(BANK) as FileKind[];
/** The interface sounds: loaded on the first gesture, because the title's buttons need them before any match. */
export const UI_KINDS: readonly FileKind[] = ['click', 'tick', 'refuse', 'confirm'];
/** What every match may need whatever the races: loaded when a match starts (a race's weapons and deaths come with `kindsForMatch`). */
export const COMMON_KINDS: readonly FileKind[] = KINDS.filter(
  (k) => BANK[k].group !== 'ui' && BANK[k].group !== 'combat' && BANK[k].group !== 'death',
).concat('bow');

/** The file of a kind's `n`th variant (1-based), relative to the page. */
export const sfxFile = (kind: FileKind, n: number) => `audio/sfx/${kind}-${n}.ogg`;
/** Every file the bank names. */
export const bankFiles = (): string[] =>
  KINDS.flatMap((k) => Array.from({ length: BANK[k].variants }, (_, i) => sfxFile(k, i + 1)));

/** Pick a variant index of `n`, never the one just played (`last`, -1 for none); `rnd` is 0..1. */
export function pickVariant(n: number, last: number, rnd: number): number {
  if (n <= 1) return 0;
  const i = Math.min(n - 2, Math.floor(rnd * (n - 1)));
  return i >= last && last >= 0 ? i + 1 : i;
}

/** The pitch factor for a kind: 1 +- its drift (`rnd` 0..1). */
export const pitchOf = (kind: FileKind, rnd: number): number => 1 + (rnd * 2 - 1) * BANK[kind].pitch;
