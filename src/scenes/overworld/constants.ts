// Numbers and lines the overworld's parts share (the simulation, the visuals and the co-op links).

import { CELL } from '../../map/types';

export const SPEED = 120; // pixels per second
export const ATTACK_COOLDOWN = 0.35;
export const CAST_COOLDOWN = 0.45;
export const MELEE_REACH = 22; // radius of the sword's hit circle, centred just in front of the hero
export const INVULN_TIME = 0.8; // after being hit
export const BOLT_SPEED = 260;
export const BOLT_RANGE = 7 * CELL;
export const BOLT_HEIGHT = 14; // a bolt flies at chest height, this far above the ground it tests against
export const MP_REGEN = 1.5; // per second
export const HP_REGEN = 1; // per second, once HP_REGEN_DELAY seconds pass without a hit
export const HP_REGEN_DELAY = 5;

export const DEFEAT_LINES = ['You were struck down...', 'Time folds back, and you wake where you began.'];
