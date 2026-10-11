// What characters look like: the hero's base clothes (gear is laid over them) and the NPC wardrobe. Outfits are part
// ids from sprites/parts.ts; mob kinds carry their own `look` (systems/combat.ts). Pixi-free.

import { withGear, type Outfit } from '../sprites/doll';
import { wornGear, type Hero } from './combat';
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

/** The hero's outfit for the gear they carry (player 0). */
export function heroOutfit(hero: Hero): Outfit {
  return playerOutfit(0, hero);
}

/**
 * Who is who in a co-op game: player 0 is the host (the hero above), players 1 to 3 are friends. Each gets their own
 * clothes, so four heroes on one screen are easy to tell apart.
 */
export const PLAYER_BASES: readonly Outfit[] = [
  HERO_BASE,
  // A girl with long black hair and a teal tunic (the look player 2 has always had).
  {
    body: 'body.f_brown',
    head: 'head.human_f_brown',
    hair: 'hair.long_black',
    torso: 'torso.f_tunic_teal',
    legs: 'legs.f_pants_white',
    feet: 'feet.f_boots_brown',
  },
  // A boy with bronze skin, red spiky hair and a maroon tunic.
  {
    body: 'body.bronze',
    head: 'head.human_bronze',
    hair: 'hair.spiked_red',
    torso: 'torso.tunic_maroon',
    legs: 'legs.pants_charcoal',
    feet: 'feet.boots_black',
  },
  // A girl with long blonde hair and a navy tunic.
  {
    body: 'body.f_light',
    head: 'head.human_f_light',
    hair: 'hair.long_blonde',
    torso: 'torso.f_tunic_navy',
    legs: 'legs.f_pants_tan',
    feet: 'feet.f_boots_brown',
  },
];

/** The ring under each player's feet and the tag over their head, by player number. */
export const PLAYER_COLORS: readonly number[] = [0x4de3ff, 0xffb13f, 0xff6fb5, 0x8fe36a];

/** "Player 1" for the host, "Player 2" for the first friend, and so on. */
export const playerName = (slot: number) => `Player ${slot + 1}`;

/** The short tag shown over a player's head in a co-op game. */
export const playerTag = (slot: number) => `P${slot + 1}`;

/** Player `slot`'s outfit for the gear they carry (their base clothes with gear laid over them). */
export function playerOutfit(slot: number, hero: Hero): Outfit {
  const base = PLAYER_BASES[slot];
  if (!base) throw new Error(`There is no player ${slot} (players are 0 to ${PLAYER_BASES.length - 1})`);
  return wornGear(hero).reduce((outfit, item) => withGear(outfit, item.look ?? {}), base);
}

/**
 * Every outfit a player can wear, as any player: each item of gear on its own over each base look. Gear in different
 * slots draws different parts, so this covers every part a player can show without listing every combination (the
 * game loads them all up front, and the tests check them).
 */
export function allPlayerOutfits(): Outfit[] {
  return PLAYER_BASES.flatMap((base) => Object.values(ITEMS).map((item) => withGear(base, item.look ?? {})));
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
