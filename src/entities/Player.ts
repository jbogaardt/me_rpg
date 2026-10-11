import type { Texture } from 'pixi.js';
import type { Hero } from '../systems/combat';
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
  invuln = 0; // seconds of blinking immunity after a hit
  sinceHit = Infinity; // seconds since last hurt (HP regenerates after a pause)
  knock = { x: 0, y: 0 };
  moving = false; // was trying to move this tick (drives the walk cycle, and the guest's copy of it)

  // Host: the last action counters honoured from a network player (see protocol.ts).
  seenAct = 0;
  seenMag = 0;
  // Guest: where the host says this player is, and its FLAG bits.
  target: { x: number; y: number } | null = null;
  flags = 0;

  constructor(
    sheet: Texture,
    public hero: Hero,
    aura = true,
  ) {
    this.body = new Character(sheet, aura);
  }
}
