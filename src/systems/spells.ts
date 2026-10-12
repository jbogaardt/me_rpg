// Wands and tomes cast spells by combo: tap a short string of directions (W W A D, or up up left right on the on-screen
// pad) and the weapon you hold does something stronger than its plain attack, for mana. Pure data and rules; the
// simulation (scenes/overworld/Casting.ts) carries a spell out and the input side (core/combo.ts) reads the keys.
//
// A combo is a string over u/d/l/r (up, down, left, right). Every combo of one weapon is the same length, so none can
// be hidden inside another; the same string may do something else on another weapon (that is the point of the weapon).

export type ComboKey = 'u' | 'd' | 'l' | 'r';

export const COMBO_KEYS: readonly ComboKey[] = ['u', 'd', 'l', 'r'];

/** What a combo can do. `power` and `count` on a `Combo` mean something slightly different for each (see `SPELLS`). */
export const SPELL_IDS = ['bolt', 'fan', 'chain', 'dash', 'nova', 'blast', 'heal', 'ward'] as const;
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
};

export interface Combo {
  /** The directions to tap, in order: letters of `COMBO_KEYS`. */
  keys: string;
  spell: SpellId;
  /** Mana it takes. */
  cost: number;
  /**
   * How strong: a multiple of the caster's spell power for damage (bolt, fan, chain, dash, nova, blast) and healing
   * (heal); the seconds it lasts for a ward.
   */
  power: number;
  /** Bolts in a fan, foes a chain reaches. */
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

/** A combo as one line: "↑↑←→ Arcane Bolt (4 MP)". */
export const comboLine = (c: Combo): string => `${arrows(c.keys)} ${SPELLS[c.spell].name} (${c.cost} MP)`;
