// What characters look like: the hero's base clothes (gear is laid over them) and the NPC wardrobe. Outfits are part
// ids from sprites/parts.ts; mob kinds carry their own `look` (systems/combat.ts). Pixi-free.

import { withGear, type Outfit } from '../sprites/doll';
import type { Hero } from './combat';
import { ITEMS } from './items';

/** The hero without gear: a boy in a green tunic. Weapon and armor looks are drawn over this. */
export const HERO_BASE: Outfit = {
  body: 'body.light',
  head: 'head.human_light',
  hair: 'hair.messy_dark_brown',
  torso: 'torso.tunic_forest',
  legs: 'legs.pants_brown',
  feet: 'feet.boots_brown',
};

/** The hero's outfit for the gear they carry. */
export function heroOutfit(hero: Pick<Hero, 'weapon' | 'armor'>): Outfit {
  return withGear(withGear(HERO_BASE, hero.armor.look ?? {}), hero.weapon.look ?? {});
}

/** Player 2 in a co-op game, without gear: the villager look (a girl in a teal tunic). */
export function guestBase(): Outfit {
  const { weapon: _weapon, shield: _shield, ...base } = npcLook('villager');
  return base;
}

/** Player 2's outfit for the gear they carry. */
export function guestOutfit(hero: Pick<Hero, 'weapon' | 'armor'>): Outfit {
  return withGear(withGear(guestBase(), hero.armor.look ?? {}), hero.weapon.look ?? {});
}

/** Every outfit a player can wear (starter gear and all items, as the hero or as player 2), so the game can load their parts up front. */
export function allHeroOutfits(): Outfit[] {
  const weapons = Object.values(ITEMS).filter((i) => i.slot === 'weapon');
  const armors = Object.values(ITEMS).filter((i) => i.slot === 'armor');
  return weapons.flatMap((weapon) =>
    armors.flatMap((armor) => [heroOutfit({ weapon, armor }), guestOutfit({ weapon, armor })]),
  );
}

/** NPC looks by name. Each pairs a body with a matching head (and body-shaped garments); hair, hats and weapons mix freely. */
export const NPC_LOOKS: Record<string, Outfit> = {
  elder: {
    body: 'body.light',
    head: 'head.human_light',
    hair: 'hair.plain_white',
    beard: 'beard.gray',
    torso: 'torso.tunic_tan',
    legs: 'legs.pants_brown',
    feet: 'feet.boots_brown',
    cape: 'cape.forest',
  },
  merchant: {
    body: 'body.bronze',
    head: 'head.human_bronze',
    hair: 'hair.spiked_black',
    beard: 'beard.brown',
    torso: 'torso.tunic_maroon',
    legs: 'legs.pants_charcoal',
    feet: 'feet.boots_black',
  },
  guard: {
    body: 'body.olive',
    head: 'head.human_olive',
    torso: 'torso.plate_steel',
    legs: 'legs.plate_steel',
    feet: 'feet.boots_black',
    headwear: 'headwear.nasal',
    weapon: 'weapon.arming_steel',
    shield: 'shield.round_brown',
  },
  sage: {
    body: 'body.f_light',
    head: 'head.human_f_light',
    hair: 'hair.long_gray',
    torso: 'torso.robe_blue',
    headwear: 'headwear.wizard_navy',
    weapon: 'weapon.staff',
  },
  villager: {
    body: 'body.f_brown',
    head: 'head.human_f_brown',
    hair: 'hair.long_black',
    torso: 'torso.f_tunic_teal',
    legs: 'legs.f_pants_white',
    feet: 'feet.f_boots_brown',
  },
  farmhand: {
    body: 'body.light',
    head: 'head.human_light',
    hair: 'hair.messy_blonde',
    torso: 'torso.tunic_white',
    legs: 'legs.pants_tan',
    feet: 'feet.boots_brown',
  },
};

/** The NPC the overworld places (maps carry one NPC cell; the look is chosen here). */
export const OVERWORLD_NPC = 'elder';

/** An NPC look by name, or a clear error for a typo. */
export function npcLook(name: string): Outfit {
  const look = NPC_LOOKS[name];
  if (!look) throw new Error(`Unknown NPC look "${name}" (known: ${Object.keys(NPC_LOOKS).join(', ')})`);
  return look;
}
