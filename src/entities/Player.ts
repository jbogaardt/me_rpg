import type { Texture } from 'pixi.js';
import type { Hero, Ranged } from '../systems/combat';
import type { SkillId } from '../systems/skills';
import { PLAYER_COLORS } from '../systems/looks';
import { Character } from './Character';

/** What a player wants to do this tick, from the keyboard / touch controls or from the network. */
export interface Command {
  dx: number; // -1, 0, 1
  dy: number;
  act: boolean; // action button pressed (talk / attack)
  combo?: number; // finished a combo of the wand or tome in hand: its index in the weapon's `focus.combos`
  aim?: { x: number; y: number }; // unit vector toward the mouse / last tap (mouse aiming only); absent: aim by walking
}

export const NO_COMMAND: Command = { dx: 0, dy: 0, act: false };

/** A player character: its body in the world, its hero (stats and gear), and the timers combat keeps on it. */
export class Player {
  readonly body: Character;
  attackCooldown = 0;
  castCooldown = 0; // seconds before the next combo
  /** Arcane Edge (systems/skills.ts): the next `charges` attacks carry extra magic, for `timer` more seconds. */
  edge = { charges: 0, timer: 0 };
  /** Iron Skin: seconds left of taking less damage. */
  guard = 0;
  /** The skill this player is being tested for in a training ground (host and solo; null when not in a trial). */
  trial: SkillId | null = null;
  /** Seconds until a player who passed their trial is sent back to the trainer (0: not waiting). */
  trialExit = 0;
  ward = 0; // seconds of protection left from a Ward spell (immune to damage, tinted)
  /** A bow being drawn: the arrow leaves when `timer` runs out (host and solo; a hit while drawing spoils it). */
  pendingShot: { timer: number; bow: Ranged; damage: number } | null = null;
  invuln = 0; // seconds of blinking immunity after a hit
  grace = 0; // seconds of silent immunity on arriving in a zone (no blink: the door transition covers the arrival)
  sinceHit = Infinity; // seconds since last hurt (HP regenerates after a pause)
  knock = { x: 0, y: 0 };
  aim = { x: 0, y: 1 }; // unit vector of the last move (diagonals included): where bolts and spells go
  mouseAim = false; // `aim` comes from the mouse: the hero turns toward it only when attacking or casting
  vel = { x: 0, y: 0 }; // px/s walking velocity; only differs from the held direction while sliding on ice
  /** Immune to damage right now: a recent hit (blinking), a Ward spell (tinted), or just having come through a door (neither). */
  get safe(): boolean {
    return this.invuln > 0 || this.grace > 0 || this.ward > 0;
  }
  /** The zone this player is in (a key of the scene's zones). The host moves players between zones; a guest follows. */
  zone = '';
  moving = false; // was trying to move this tick (drives the walk cycle, and the guest's copy of it)

  // Host: the last action counters honoured from a network player (see protocol.ts).
  seenAct = 0;
  seenCombo = 0; // the last combo counter honoured from a network player
  seenInv = 0; // the last Inventory action done for this friend
  /** Host: the answer to this friend's last trade request (they see it once, by its id). */
  reply: { id: number; text: string; ok: boolean; story?: string } | null = null;
  // Guest: where the host says this player is, and its FLAG bits.
  target: { x: number; y: number } | null = null;
  flags = 0;

  /** `slot` is the player's number in a co-op game (0 is the host, and the only player when solo). */
  constructor(
    sheet: Texture,
    public hero: Hero,
    public slot = 0,
  ) {
    this.body = new Character(sheet, true);
    this.setSlot(slot);
  }

  /** Become another player number (a guest is seated by the host); the ring changes colour to match. */
  setSlot(slot: number) {
    this.slot = slot;
    this.body.setAuraColor(PLAYER_COLORS[slot] ?? 0x4de3ff);
  }
}
