import type { Texture } from 'pixi.js';
import { PositionClaim } from '../core/claim';
import type { Hero, Ranged } from '../systems/combat';
import type { SkillId } from '../systems/skills';
import type { Direction } from '../core/direction';
import { AttackBuffer } from '../systems/inputBuffer';
import { ROLL_COOLDOWN, rollInvulnerable, type RollState } from '../systems/roll';
import type { PendingSwing } from '../systems/swing';
import { DM_COLOR, PLAYER_COLORS } from '../systems/looks';
import { Character } from './Character';
import { RollLook } from './RollLook';
import { HopLook } from './HopLook';
import type { HopState } from '../systems/ledgeDrop';

/** What a player wants to do this tick, from the keyboard / touch controls or from the network. */
export interface Command {
  dx: number; // -1, 0, 1
  dy: number;
  act: boolean; // attack button pressed (the contextual single key in that mode: talk / attack)
  /** The interact key or button was pressed (split keys only: talk, open, pick up). A guest's press arrives as the toggle bit `KEY.use`. */
  use?: boolean;
  /** A guest plays split keys, so its `act` is attack only (host only; from `KEY.split`). Absent: `act` is the contextual key. */
  split?: boolean;
  /** The roll key or button was pressed (systems/roll.ts). A guest's press arrives as the toggle bit `KEY.roll`. */
  roll?: boolean;
  /** The action button is held down (the local hero only; a guest's hold is repeated as `act` presses). */
  held?: boolean;
  combo?: number; // finished a combo of the wand or tome in hand: its index in the weapon's `focus.combos`
  /** A guest's word on where its hero stands, with the input's number (`core/claim.ts`); absent for the host and for old pages. */
  at?: { n: number; x: number; y: number };
  aim?: { x: number; y: number }; // unit vector toward the mouse / last tap (mouse aiming only); absent: aim by walking
}

export const NO_COMMAND: Command = { dx: 0, dy: 0, act: false };

/** A player character: its body in the world, its hero (stats and gear), and the timers combat keeps on it. */
export class Player {
  readonly body: Character;
  /** The DM is possessing a foe: their body is not drawn (host sets it, a guest reads it from the flags). */
  hidden = false;
  /** Judges a guest's claims about where this hero stands (host only). */
  readonly claim = new PositionClaim();
  attackCooldown = 0;
  /** An attack pressed just before `attackCooldown` ends (systems/inputBuffer.ts; host and solo own it). */
  readonly attackBuffer = new AttackBuffer();
  /** A sword swing between the press and its contact (systems/swing.ts; host and solo own it; a blow on the hero cancels it). */
  swing: PendingSwing | null = null;
  swingDir: Direction = 'down'; // the way the press aimed it (a mouse-aimed swing keeps it through startup)
  castCooldown = 0; // seconds before the next combo
  /** The dodge roll in progress (systems/roll.ts; host and solo own it), or null. */
  roll: RollState | null = null;
  /** Seconds since the last roll began, and the way it went (`rollWaitFor`: a roll back is allowed sooner). */
  rollSince = ROLL_COOLDOWN;
  rollDir: { x: number; y: number } | null = null;
  /** A roll pressed just before it was legal (the same buffer as the sword's; host and solo own it). */
  readonly rollBuffer = new AttackBuffer();
  /** How a roll looks on this body (every page: from the host's `roll` or a guest's `FLAG.roll`). */
  readonly rollLook = new RollLook();
  /** A ledge drop in progress (systems/ledgeDrop.ts; host and solo own it), or null; `dropHold` is the push into the face so far. */
  hop: HopState | null = null;
  dropHold = 0;
  /** How a hop looks on this body (every page: from the host's `hop` or a guest's `FLAG.hop`). */
  readonly hopLook = new HopLook();
  /** Host: the last roll toggle bit honoured from a network player (`KEY.roll`). */
  seenRoll = 0;
  /** Host: the last interact toggle bit honoured from a network player (`KEY.use`). */
  seenUse = 0;
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
  /** Host/solo: seconds since the hero fell (`systems/downfall.ts`), null while on their feet. A guest keeps its own copy from `FLAG.down`. */
  down: number | null = null;
  invuln = 0; // seconds of blinking immunity after a hit
  grace = 0; // seconds of silent immunity on arriving in a zone (no blink: the door transition covers the arrival)
  idle = 0; // seconds with no walking, attacking or casting (online, mobs leave a player who is away from the keyboard)
  sinceHit = Infinity; // seconds since last hurt (HP regenerates after a pause)
  knock = { x: 0, y: 0 };
  /** Hit-pause (systems/hitPause.ts): seconds this hero holds still after landing or taking a blow. Host and solo own it. */
  hitstop = 0;
  aim = { x: 0, y: 1 }; // unit vector of the last move (diagonals included): where bolts and spells go
  mouseAim = false; // `aim` comes from the mouse: the hero turns toward it only when attacking or casting
  vel = { x: 0, y: 0 }; // px/s walking velocity; only differs from the held direction while sliding on ice
  /** Immune to damage right now: a recent hit (blinking), a Ward spell (tinted), the middle of a roll, or just having come through a door (neither). */
  get safe(): boolean {
    return this.invuln > 0 || this.grace > 0 || this.ward > 0 || rollInvulnerable(this.roll);
  }
  /** The zone this player is in (a key of the scene's zones). The host moves players between zones; a guest follows. */
  zone = '';
  /** Host/solo: drinking from a pond (the water gained so far, floated when they stop), or null. */
  drinking: { gained: number } | null = null;
  /**
   * The Dungeon Master (an online game's host, player 0): seen in the world but not one of the party. No mob hunts or
   * hurts them, they share no XP, gold or quest credit, block nobody, and their action key neither attacks nor picks up.
   */
  dm = false;
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
    this.body.setAuraColor(this.dm ? DM_COLOR : (PLAYER_COLORS[slot] ?? 0x4de3ff));
  }

  /** Become (or stop being) the Dungeon Master; the ring turns gold. */
  setDm(dm: boolean) {
    this.dm = dm;
    this.setSlot(this.slot);
  }
}
