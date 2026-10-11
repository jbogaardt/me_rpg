import type { Texture } from 'pixi.js';
import type { Hero, Ranged } from '../systems/combat';
import { PLAYER_COLORS } from '../systems/looks';
import { Character } from './Character';

/** What a player wants to do this tick, from the keyboard / touch controls or from the network. */
export interface Command {
  dx: number; // -1, 0, 1
  dy: number;
  act: boolean; // action button pressed (talk / attack)
  mag: boolean; // magic button pressed
}

export const NO_COMMAND: Command = { dx: 0, dy: 0, act: false, mag: false };

/** A player character: its body in the world, its hero (stats and gear), and the timers combat keeps on it. */
export class Player {
  readonly body: Character;
  attackCooldown = 0;
  castCooldown = 0;
  /** A bow being drawn: the arrow leaves when `timer` runs out (host and solo; a hit while drawing spoils it). */
  pendingShot: { timer: number; bow: Ranged; damage: number } | null = null;
  invuln = 0; // seconds of blinking immunity after a hit
  sinceHit = Infinity; // seconds since last hurt (HP regenerates after a pause)
  knock = { x: 0, y: 0 };
  aim = { x: 0, y: 1 }; // unit vector of the last move (diagonals included): where magic bolts fly
  vel = { x: 0, y: 0 }; // px/s walking velocity; only differs from the held direction while sliding on ice
  moving = false; // was trying to move this tick (drives the walk cycle, and the guest's copy of it)

  // Host: the last action counters honoured from a network player (see protocol.ts).
  seenAct = 0;
  seenMag = 0;
  seenInv = 0; // the last pack action done for this player
  invKey = ''; // what their gear and pack looked like when last sent
  invUntil = 0; // keep sending their gear and pack until this time (a change rides in several snapshots)
  invBeat = 0; // ... and at least once a second
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
