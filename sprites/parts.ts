// Catalog of character parts: the source of truth for which Universal LPC art ships with the game.
// `npm run sprites -- build` packs each entry into public/sprites/lpc/ (see .claude/skills/add-sprite-part).
//
// An id is `<slot>.<name>`; outfits (src/systems/looks.ts, items) refer to parts by id. `item` is a sheet
// definition from the LPC generator (sheet_definitions/<item>.json), `body` the body type it is worn on.
// Only list what the game uses: every entry costs a few tens of KB and needs a credit line.

import type { PartSpec } from '../tools/sprites/lpc';

export const PARTS: Record<string, PartSpec> = {};

function add(id: string, item: string, color?: string, extra: Partial<PartSpec> = {}) {
  if (PARTS[id]) throw new Error(`Duplicate part id ${id}`);
  PARTS[id] = { item, body: 'male', ...(color ? { color } : {}), ...extra };
}

// --- Bodies and heads. The head's skin must match the body's, so each skin tone adds both. ---
const SKINS = ['light', 'olive', 'bronze', 'brown'];
for (const skin of SKINS) {
  add(`body.${skin}`, 'body/body', skin);
  add(`head.human_${skin}`, 'head/heads/human/heads_human_male', skin, { color2: 'brown' });
}
// Female bodies for varied NPCs.
for (const skin of SKINS) {
  add(`body.f_${skin}`, 'body/body', skin, { body: 'female' });
  add(`head.human_f_${skin}`, 'head/heads/human/heads_human_female', skin, { body: 'female', color2: 'brown' });
}

// Monsters: body skin and matching head.
add('body.green', 'body/body', 'green');
add('head.orc', 'head/heads/fantasy/heads_orc_male', 'green');
add('head.goblin', 'head/heads/fantasy/heads_goblin', 'green');
add('head.troll', 'head/heads/fantasy/heads_troll', 'green');
add('body.dark_green', 'body/body', 'dark_green');
add('head.orc_dark', 'head/heads/fantasy/heads_orc_male', 'dark_green');
add('body.fur_grey', 'body/body', 'fur_grey');
add('head.wolf', 'head/heads/beast/heads_wolf_male', 'fur_grey');
add('body.skeleton', 'body/special/body_skeleton', 'white');
add('head.skeleton', 'head/heads/undead/heads_skeleton', 'white');
add('body.shade', 'body/special/body_skeleton', 'charcoal');
add('head.shade', 'head/heads/undead/heads_skeleton', 'charcoal');
add('body.frost', 'body/special/body_skeleton', 'sky');
add('head.frost', 'head/heads/undead/heads_skeleton', 'sky');
add('body.zombie', 'body/special/body_zombie');
add('head.zombie', 'head/heads/undead/heads_zombie');

// --- Whole-character art that is not from the LPC generator ---
// A ready-made doll sheet (832x1600, see src/sprites/doll.ts) copied as one layer by `npm run sprites -- build`. It
// replaces body *and* head, so an outfit built on it needs no head (`WHOLE_BODIES`).
export interface CustomPart {
  /** The doll sheet, relative to the repo root. */
  source: string;
  /** Draw order (LPC bodies sit at 10). */
  z: number;
  notes: string;
  authors: string[];
  licenses: string[];
  urls: string[];
}

export const CUSTOM_PARTS: Record<string, CustomPart> = {
  'body.mummy': {
    source: 'art/mummy/mummy_doll.png',
    z: 10,
    notes: 'Mummy mob, pixel art made for this game (generated, cleaned up and exported by tools in game-graphics)',
    authors: ['jbogaardt'],
    licenses: ['Project art'],
    urls: ['https://github.com/jbogaardt/game-graphics'],
  },
  'body.snowman': {
    source: 'art/snowman/abominable-snowman_doll.png',
    z: 10,
    notes:
      'Abominable Snowman mob, pixel art made for this game (generated, cleaned up and exported by tools in game-graphics)',
    authors: ['jbogaardt'],
    licenses: ['Project art'],
    urls: ['https://github.com/jbogaardt/game-graphics'],
  },
};

/** Bodies that already include their head. */
export const WHOLE_BODIES: ReadonlySet<string> = new Set(Object.keys(CUSTOM_PARTS));

// --- Hair ---
for (const color of ['dark_brown', 'blonde', 'red', 'black', 'gray', 'white']) {
  add(`hair.plain_${color}`, 'hair/short/hair_plain', color);
  add(`hair.messy_${color}`, 'hair/short/hair_messy2', color);
  add(`hair.long_${color}`, 'hair/long/hair_long', color);
  add(`hair.spiked_${color}`, 'hair/spiky/hair_spiked', color);
}
add('beard.gray', 'hair/beards/beards_beard', 'gray');
add('beard.brown', 'hair/beards/beards_beard', 'dark_brown');

// --- Clothes and armour (cloth colours are the generator's `cloth` palette; metals its `metal` palette) ---
for (const color of ['brown', 'forest', 'maroon', 'navy', 'tan', 'white', 'charcoal', 'teal']) {
  add(`torso.tunic_${color}`, 'torso/shirts/longsleeve/torso_clothes_longsleeve', color);
  add(`legs.pants_${color}`, 'legs/pants/legs_pants', color);
  add(`cape.${color}`, 'torso/cape/cape_solid', color);
  // Body-shaped garments need their own art on a female body; hair, hats and weapons are shared.
  add(`torso.f_tunic_${color}`, 'torso/shirts/longsleeve/torso_clothes_longsleeve', color, { body: 'female' });
  add(`legs.f_pants_${color}`, 'legs/pants/legs_pants', color, { body: 'female' });
}
add('torso.robe_blue', 'torso/shirts/torso_clothes_robe', 'blue', { body: 'female' });
add('torso.robe_red', 'torso/shirts/torso_clothes_robe', 'red', { body: 'female' });
add('torso.leather', 'torso/armour/torso_armour_leather', 'leather');
add('torso.legion_iron', 'torso/armour/torso_armour_legion', 'iron');
add('torso.plate_steel', 'torso/armour/torso_armour_plate', 'steel');
add('torso.plate_gold', 'torso/armour/torso_armour_plate', 'gold');
add('legs.plate_steel', 'legs/legs_armour', 'steel');
add('legs.plate_iron', 'legs/legs_armour', 'iron');
add('legs.leggings_charcoal', 'legs/leggings/legs_leggings', 'charcoal');
add('feet.boots_brown', 'feet/boots/feet_boots_basic', 'brown');
add('feet.boots_black', 'feet/boots/feet_boots_basic', 'black');
add('feet.f_boots_brown', 'feet/boots/feet_boots_basic', 'brown', { body: 'female' });
add('feet.boots_fold_tan', 'feet/boots/feet_boots_fold', 'tan');
add('feet.plate_iron', 'feet/feet_armour', 'iron');
add('feet.plate_steel', 'feet/feet_armour', 'steel');
add('headwear.nasal', 'headwear/helmets/helmets/hat_helmet_nasal', 'iron');
add('headwear.barbarian', 'headwear/helmets/helmets/hat_helmet_barbarian_viking', 'iron');
add('headwear.greathelm', 'headwear/helmets/helmets/hat_helmet_greathelm', 'steel');
add('headwear.legion', 'headwear/helmets/helmets/hat_helmet_legion', 'iron');
add('headwear.kettle', 'headwear/helmets/helmets/hat_helmet_kettle', 'iron', { color2: 'brown' }); // colour 2: the lining
add('headwear.wizard_navy', 'headwear/hats/magic/hat_magic_wizard', 'navy');
add('headwear.hood_brown', 'headwear/coverings/hoods/hat_hood_cloth', 'brown');
add('headwear.bandana_tan', 'headwear/coverings/bandana/hat_bandana', 'tan');

// --- Weapons and shields ---
// Only weapons whose swing art is 128px frames fit the doll sheet (the arming sword family, the dagger). Weapons with
// "oversize" swings (longsword, mace, axe, scythe, ...) use 192px frames; supporting them means a bigger slash block.
for (const metal of ['iron', 'bronze', 'steel', 'silver', 'gold']) {
  add(`weapon.arming_${metal}`, 'weapons/sword/weapon_sword_arming', metal);
}
add('weapon.dagger', 'weapons/sword/weapon_sword_dagger');
add('weapon.staff', 'weapons/magic/weapon_magic_simple'); // held only: it has no swing art (NPC prop)
// Bows: drawn only in the `shoot` and `hurt` poses (LPC has no held-bow art for walking), so the bow appears as the
// hero draws it. Wood colours or metals (`light`, `medium`, `red`, `dark`; `bronze`, `iron`, `steel`, ...).
add('weapon.bow_light', 'weapons/ranged/bow/weapon_ranged_bow_normal', 'light');
add('weapon.bow_recurve', 'weapons/ranged/bow/weapon_ranged_bow_recurve', 'medium');
add('weapon.bow_great', 'weapons/ranged/bow/weapon_ranged_bow_great', 'dark');
add('shield.round_brown', 'weapons/shields/shield_round', 'brown');
add('shield.round_silver', 'weapons/shields/shield_round', 'silver');
add('shield.round_black', 'weapons/shields/shield_round', 'black');
add('shield.kite_gray', 'weapons/shields/shield_kite', 'kite gray gray');
// An off-hand weapon: the dagger flipped into the left hand (it swings along with the main weapon, like dual wielding).
add('shield.dagger_left', 'weapons/sword/weapon_sword_dagger', undefined, { mirror: true });
