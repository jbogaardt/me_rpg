// Which heroes a zone is for (Pixi-free, tested; core engine, content): a biome may declare a `levels` band (biomes.json,
// installed by `ContentManager.install`). The band is advice on the area banner and, where the `levelGates` capability is
// on, a door that stays shut to a hero too far under it. The same fight model that sizes the DM's bosses (`heroModel`,
// dmBoss.ts) tells the content check whether a foe placed in a zone is a fair fight at the band's lowest level, so the
// band and the monsters cannot drift apart. Co-op: the host decides at the door (it moves every hero); the guest is told
// by the floating word the host sends, and the banner note is read from the guest's own level and the shared content.

import { heroModel } from './dmBoss';

/** The levels a zone is made for: lowest and highest (a hero between them has a fair fight with everything in it). */
export type Band = readonly [min: number, max: number];

/** Each zone's band, by zone (map) name; zones with none are for everyone. Installed from biomes.json. */
export const ZONE_LEVELS: Record<string, Band> = {};

export const zoneLevels = (zone: string): Band | undefined => ZONE_LEVELS[zone];

export function setZoneLevels(bands: Record<string, Band>) {
  for (const key of Object.keys(ZONE_LEVELS)) delete ZONE_LEVELS[key];
  Object.assign(ZONE_LEVELS, bands);
}

/** A hero below the band, inside it, or above it. */
export type Standing = 'under' | 'fit' | 'over';
export const standing = (level: number, [min, max]: Band): Standing =>
  level < min ? 'under' : level > max ? 'over' : 'fit';

/** Is a hero of `level` kept out of a zone with this band? Only a hero more than `slack` levels under its lowest. */
export const gated = (level: number, [min]: Band, slack: number): boolean => level < min - slack;

/** The levels as a player reads them: "Levels 4-5" (one level: "Level 4"). */
export const bandText = ([min, max]: Band): string => (min === max ? `Level ${min}` : `Levels ${min}–${max}`);

/** The small line under a zone's name when a hero arrives: the band, and how the hero stands against it. */
export function bandNote(level: number, band: Band): string {
  const s = standing(level, band);
  return s === 'under'
    ? `${bandText(band)}: tough for you`
    : s === 'over'
      ? `${bandText(band)}: you have outgrown it`
      : bandText(band);
}

/** What floats over a hero the door keeps out. */
export const gateWords = (band: Band): string => `${bandText(band)}: come back stronger`;

// --- Is a foe a fair fight? -------------------------------------------------------------------------------------------

/** The stats of a foe the model needs. */
export interface Foe {
  hp: number;
  attack: number;
  defense: number;
}

/** The fight between a typical hero of `level` and a foe: blows the hero needs to fell it, hits it needs to fell the hero. */
export function duel(foe: Foe, level: number): { blows: number; hits: number } {
  const h = heroModel(level);
  return {
    blows: Math.ceil(foe.hp / Math.max(1, h.power - foe.defense)),
    hits: Math.ceil(h.hp / Math.max(1, foe.attack - h.defense)),
  };
}

/** The same fight for a hero as they really are: their blow (attack and weapon) and defense (stat and armour) and health. */
export function duelWith(
  foe: Foe,
  hero: { hp: number; power: number; defense: number },
): { blows: number; hits: number } {
  return {
    blows: Math.ceil(foe.hp / Math.max(1, hero.power - foe.defense)),
    hits: Math.ceil(hero.hp / Math.max(1, foe.attack - hero.defense)),
  };
}

/** How a fight reads from its numbers: deadly, a slog, hard, fair, easy, or no fight at all. */
export type Verdict = 'deadly' | 'slog' | 'hard' | 'fair' | 'easy' | 'trivial';
export function verdictOf({ blows, hits }: { blows: number; hits: number }): Verdict {
  if (hits <= DEADLY_HITS) return 'deadly';
  if (blows > SLOG_BLOWS) return 'slog';
  if (blows <= TRIVIAL_BLOWS && hits >= TRIVIAL_HITS) return 'trivial';
  if (blows <= 3 && hits >= 15) return 'easy';
  if (hits <= 4) return 'hard';
  return 'fair';
}

/** A hero that falls in this many hits or fewer is outmatched; one that needs more blows than this has a slog. */
export const DEADLY_HITS = 2;
export const SLOG_BLOWS = 14;
/** At a band's top, a foe felled in this many blows that needs this many hits to fell the hero is no fight at all. */
const TRIVIAL_BLOWS = 2;
const TRIVIAL_HITS = 30;

/** Why `foe` does not belong in a zone for `band`, or null: deadly or a slog at its lowest level, trivial at its highest. */
export function foeProblem(
  foe: Foe,
  band: Band,
): { kind: 'deadly' | 'slog' | 'trivial'; level: number; blows: number; hits: number } | null {
  const low = duel(foe, band[0]);
  if (low.hits <= DEADLY_HITS) return { kind: 'deadly', level: band[0], ...low };
  if (low.blows > SLOG_BLOWS) return { kind: 'slog', level: band[0], ...low };
  const high = duel(foe, band[1]);
  if (high.blows <= TRIVIAL_BLOWS && high.hits >= TRIVIAL_HITS) return { kind: 'trivial', level: band[1], ...high };
  return null;
}
