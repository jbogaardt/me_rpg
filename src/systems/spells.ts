// Wands and tomes cast spells by combo: tap a short string of directions (W W A D, or up up left right on the on-screen
// pad) and the weapon you hold does something stronger than its plain attack, for mana. Pure data and rules; the
// simulation (scenes/overworld/Casting.ts) carries a spell out and the input side (core/combo.ts) reads the keys.
//
// A combo is a string over u/d/l/r (up, down, left, right): five taps on a first-tier weapon, six on a second-tier one.
// Two taps of the same direction never follow each other (on the on-screen pad a repeat means going back through the
// middle, and the reader ignores a repeated tap), no combo is hidden inside another of the same weapon or inside a skill's
// (systems/skills.ts), and **no spell is on two weapons**: each wand and tome has its own set, see each campaign's items.json.

export type ComboKey = 'u' | 'd' | 'l' | 'r';

export const COMBO_KEYS: readonly ComboKey[] = ['u', 'd', 'l', 'r'];

/** What a combo can do. `power` and `count` on a `Combo` mean something slightly different for each (see `SPELLS`). */
export const SPELL_IDS = [
  'bolt',
  'fan',
  'dash',
  'chain',
  'lance',
  'smite',
  'gale',
  'heal',
  'ward',
  'nova',
  'blast',
  'drain',
  'freeze',
  'vortex',
] as const;
export type SpellId = (typeof SPELL_IDS)[number];

export interface SpellInfo {
  name: string;
  /** One line for the item description. */
  about: string;
}

export const SPELLS: Record<SpellId, SpellInfo> = {
  bolt: { name: 'Arcane Bolt', about: 'A heavy bolt flies the way you aim.' },
  fan: { name: 'Spark Fan', about: 'A fan of bolts spreads out ahead.' },
  chain: { name: 'Chain Lightning', about: 'Lightning leaps to the nearest foes.' },
  dash: { name: 'Blink', about: 'Blink forward, cutting through foes on the way.' },
  nova: { name: 'Nova', about: 'A burst of force hits every foe around you.' },
  blast: { name: 'Meteor', about: 'A crash of fire where you aim, hitting everything near it.' },
  heal: { name: 'Mend', about: 'Heals you and friends close by.' },
  ward: { name: 'Ward', about: 'A shell of light: you and friends close by take no damage for a while.' },
  lance: { name: 'Storm Lance', about: 'A bolt of lightning pierces every foe in a long line ahead.' },
  smite: { name: 'Smite', about: 'A heavy lightning strike on the nearest foe.' },
  gale: { name: 'Gale', about: 'A gust blows foes in front of you back, hurting them as they go.' },
  drain: { name: 'Soul Drain', about: 'Foes around you lose health, and you gain some of it.' },
  freeze: { name: 'Stasis', about: 'Foes around you take a little damage and are frozen still for a moment.' },
  vortex: { name: 'Vortex', about: 'Foes nearby are dragged in toward you and hurt.' },
};

export interface Combo {
  /** The directions to tap, in order: letters of `COMBO_KEYS`. */
  keys: string;
  spell: SpellId;
  /** Mana it takes. */
  cost: number;
  /**
   * How strong: a multiple of the caster's spell power for damage (every attack spell) and healing (heal); the seconds it
   * lasts for a ward.
   */
  power: number;
  /** Bolts in a fan, foes a chain reaches, seconds a freeze holds. */
  count?: number;
}

/** What makes a weapon a wand or a tome: it fires a free bolt as its plain attack and has combos. */
export interface Focus {
  kind: 'wand' | 'tome';
  /** Added to the caster's magic stat for the damage and healing of the combos. */
  power: number;
  /** Seconds between plain bolts (a wand is quick, a tome heavy and slow). */
  cooldown: number;
  combos: readonly Combo[];
}

const ARROWS: Record<ComboKey, string> = { u: '↑', d: '↓', l: '←', r: '→' };

/** "uulr" as arrows, for the screen. */
export const arrows = (keys: string): string => [...keys].map((k) => ARROWS[k as ComboKey] ?? k).join('');

/** How many of a combo's first keys the player has just typed (so the screen can light them). */
export function progress(typed: string, keys: string): number {
  for (let n = Math.min(typed.length, keys.length - 1); n > 0; n--) {
    if (typed.endsWith(keys.slice(0, n))) return n;
  }
  return 0;
}

const WORDS: Record<string, string> = { u: 'up', d: 'down', l: 'left', r: 'right' };

/** "ruld" as words: "right, up, left, down". */
export const directionWords = (keys: string): string => [...keys].map((k) => WORDS[k] ?? k).join(', ');

/** A combo as one line: "↑↑←→ Arcane Bolt (4 MP)". */
export const comboLine = (c: Combo): string => `${arrows(c.keys)} ${SPELLS[c.spell].name} (${c.cost} MP)`;
