// Numbers and lines the overworld's parts share (the simulation, the visuals, the zones and the co-op links).

import { CELL } from '../../map/types';

export const SPEED = 120; // pixels per second
export const ATTACK_COOLDOWN = 0.35;
export const COMBO_COOLDOWN = 0.5; // seconds between two combos
export const MELEE_REACH = 22; // radius of the sword's hit circle, centred just in front of the hero
export const INVULN_TIME = 0.8; // after being hit
export const BOLT_SPEED = 260;
export const BOLT_RANGE = 7 * CELL;
export const BOLT_HEIGHT = 14; // a bolt flies at chest height, this far above the ground it tests against
export const MP_REGEN = 1.5; // per second
export const HP_REGEN = 1; // per second, once HP_REGEN_DELAY seconds pass without a hit
export const HP_REGEN_DELAY = 5;
export const LIGHTNING_RADIUS = 28; // px from where a bolt lands that still burns
export const LIGHTNING_DAMAGE = 0.35; // fraction of a player's max HP a direct hit takes (armour doesn't help)

export const KEEPER_REACH = CELL * 2.3; // how close the action key must be to talk to a shopkeeper (across a counter)
export const SIGN_REACH = CELL * 1.5; // how close (to its foot) the action key reads a signpost: like an NPC, facing does not matter
export const PICKUP_REACH = 26; // how close the action key must be to an item on the ground
export const SITE_REACH = CELL * 1.3; // how close the action key must be to a quest site
export const CROP_REACH = CELL * 1.5; // how close the action key must be to a crop plot (feet to the plot's cell centre)
export const CHEST_REACH = CELL * 1.4; // how close the action key must be to a chest (feet to the chest's cell centre)

export const DEFEAT_LINES = ['You were struck down...', 'Time folds back, and you wake where you began.'];

// Spells (Casting.ts)
export const SPELL_SPEED = 300; // a combo's bolts fly faster than a wand's plain bolt
export const FAN_STEP = 0.22; // radians between the bolts of a Spark Fan
export const NOVA_RADIUS = 3.2 * CELL;
export const BLAST_REACH = 4.5 * CELL; // how far ahead a Meteor lands (nearer if a wall is in the way)
export const BLAST_RADIUS = 2.2 * CELL;
export const CHAIN_RANGE = 5.5 * CELL;
export const DASH_DISTANCE = 4.5 * CELL;
export const DASH_GRACE = 0.35; // seconds of immunity after a Blink
export const WARD_TINT = 0xa8d8ff; // a warded player is tinted pale blue
export const EDGE_TINT = 0xe3c4ff; // a hero with Arcane Edge charges is tinted violet
export const GUARD_TINT = 0xc8d4e4; // Iron Skin: steel grey

/** The tint a hero wears for the effects on them (the first that applies; plain white otherwise). The guest gets the same from the snapshot's flags. */
export const auraTint = (on: { ward: boolean; edge: boolean; guard: boolean }): number =>
  on.ward ? WARD_TINT : on.edge ? EDGE_TINT : on.guard ? GUARD_TINT : 0xffffff;

export const HELP_RADIUS = 4 * CELL; // Mend and Ward reach friends this close
