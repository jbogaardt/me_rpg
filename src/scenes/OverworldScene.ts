import type { Container } from 'pixi.js';
import type { Sprites, Zone } from '../assets';
import { Camera } from '../core/camera';
import { input } from '../core/input';
import type { Scene } from '../core/Scene';
import type { TouchControls } from '../core/touch';
import { Character, DIR_VEC, directionToward, type Direction } from '../entities/Character';
import { Ambient } from '../entities/ambient';
import { boltEffect, Effects, floatText, slashEffect } from '../entities/effects';
import { Mob, type MobWorld } from '../entities/Mob';
import { particleEffect } from '../entities/ParticleEffect';
import { NO_COMMAND, Player, type Command } from '../entities/Player';
import type { Dialog } from '../hud/Dialog';
import type { Hud } from '../hud/Hud';
import type { Menu } from '../hud/Menu';
import { MapView } from '../map/MapView';
import { CELL, type CellPoint } from '../map/types';
import { glide } from '../net/interp';
import {
  DIRS,
  dirIndex,
  FLAG,
  packKeys,
  round1,
  unpackKeys,
  type PlayerSnap,
  type SnapMsg,
  type FxName,
  type StatsSnap,
  type WorldEvent,
} from '../net/protocol';
import type { Role, Session } from '../net/session';
import {
  attackPower,
  defensePower,
  gainXp,
  MOB_KINDS,
  newHero,
  rollDamage,
  spellPower,
  type Hero,
  type Stats,
} from '../systems/combat';
import { Collision } from '../systems/collision';

const SPEED = 120; // pixels per second
const NPC_LINES = [
  'Greetings, traveler. This world is still being drawn.',
  'Soon there will be a story here. Come back later!',
];
const DEFEAT_LINES = ['You were struck down...', 'Time folds back, and you wake where you began.'];

// Keys (touch: A = KeyJ, B = KeyK, ☰ = Escape; see index.html).
const ACTION_KEYS = ['Space', 'KeyJ', 'Enter', 'KeyE']; // talk when next to the NPC, otherwise attack
const MAGIC_KEYS = ['KeyK', 'KeyQ'];
const MENU_KEYS = ['Escape', 'KeyI', 'Tab'];

const ATTACK_COOLDOWN = 0.35;
const CAST_COOLDOWN = 0.45;
const MELEE_REACH = 22; // radius of the sword's hit circle, centred just in front of the hero
const INVULN_TIME = 0.8; // after being hit
const BOLT_SPEED = 260;
const BOLT_RANGE = 7 * CELL;
const BOLT_HEIGHT = 14; // the bolt flies at chest height, this far above the ground it tests against
const MP_REGEN = 1.5; // per second
const HP_REGEN = 1; // per second, once HP_REGEN_DELAY seconds pass without a hit
const HP_REGEN_DELAY = 5;

// Co-op networking (see src/net/protocol.ts)
const SNAPSHOT_HZ = 25; // host -> guest world state
const INPUT_HZ = 30; // guest -> host controls (also sent at once when they change)
const EVENT_KEEP = 0.6; // seconds a one-shot world event keeps riding in snapshots, to survive packet loss
const MAX_EVENTS_SENT = 48;

/** The HTML overlays shared by every scene. They are created once in main.ts. */
export interface Ui {
  hud: Hud;
  menu: Menu;
  dialog: Dialog;
  touch: TouchControls;
  session: Session;
}

/**
 * The overworld: one zone with the hero, an NPC and mobs. Runs in one of three roles (`Session.role`):
 *  - solo: the plain single-player game.
 *  - host: the same simulation, plus a second player driven by the guest's controls; it broadcasts snapshots.
 *  - client: no simulation; it sends the local controls to the host and draws what the host's snapshots say.
 * `local` is the player at this keyboard in every role; `remote` is the other player (none when solo).
 */
export class OverworldScene implements Scene {
  private world: MapView;
  private camera: Camera;
  private collision: Collision;
  private local: Player;
  private remote: Player | null = null;
  private npc: Character;
  private mobs: Mob[];
  private mobWorld: MobWorld;
  private heroBodies: [Character, ...Character[]]; // everything mobs may attack
  private effects: Effects;
  private ambient: Ambient;
  private spawn: CellPoint;
  private screen = { width: 0, height: 0 };

  // Co-op
  private role: Role = 'solo';
  private clock = 0; // seconds; drives the guest's invulnerability blink and event ages
  private snapTimer = 0;
  private snapSeq = 0;
  private events: { id: number; at: number; e: WorldEvent }[] = []; // host: recent one-shot events
  private eventId = 0;
  private lastEvent = -1; // guest: newest event already shown
  private inputTimer = 0;
  private inputSeq = 0;
  private actCount = 0; // guest: action / magic presses so far, sent as counters
  private magCount = 0;
  private sent = { keys: -1, act: -1, mag: -1 };
  private solo: { stats: Stats; name: string } | null = null; // guest: the solo hero, restored on disconnect

  constructor(
    zone: Zone,
    private sprites: Sprites,
    private ui: Ui,
  ) {
    const { data } = zone;
    this.world = new MapView(data, zone.textures);
    this.camera = new Camera(this.world, data.width * CELL, data.height * CELL);
    this.collision = new Collision(data.width, data.height, data.collision);
    this.spawn = data.spawn;
    this.effects = new Effects(this.world.layer);
    this.ambient = new Ambient(this.world.layer, data);
    this.local = new Player(sprites.hero, newHero());
    this.heroBodies = [this.local.body];
    this.npc = new Character(sprites.npc);

    // Entities are positioned by their feet so they y-sort with map objects.
    this.player.position.set(...this.cellToFeet(data.spawn));
    if (data.npc) this.npc.position.set(...this.cellToFeet(data.npc));
    else this.npc.visible = false;
    this.mobs = data.mobs.map((m) => {
      const kind = MOB_KINDS[m.kind];
      if (!kind) throw new Error(`Zone "${zone.name}" spawns unknown mob kind "${m.kind}"`);
      const sheet = sprites.mobs.get(kind.sheet);
      if (!sheet) throw new Error(`No sprite sheet loaded for mob kind "${m.kind}" (${kind.sheet})`);
      return new Mob(kind, sheet, ...this.cellToFeet(m));
    });
    this.mobWorld = {
      heroes: this.heroBodies,
      slide: (body, mx, my) => this.collision.slide(body, mx, my, this.bodies()),
      strike: (mob, target) => this.hurtHero(mob, target),
    };
    this.world.layer.addChild(this.npc, this.player, ...this.mobs.map((m) => m.body));
  }

  get root(): Container {
    return this.world;
  }

  /** The local player's body and hero (also what playtest scripts poke; see .claude/skills/playtest). */
  private get player(): Character {
    return this.local.body;
  }

  private get hero(): Hero {
    return this.local.hero;
  }

  enter() {
    // Opened from a join link (#offer=...): show the Online tab with the host's code already filled in.
    if (this.ui.session.urlOffer) this.ui.menu.toggle(this.hero, 'online');
  }

  exit() {
    this.ui.dialog.close();
    if (this.ui.menu.open) this.ui.menu.toggle(this.hero);
  }

  resize(width: number, height: number) {
    this.screen = { width, height };
    this.camera.resize(width, height);
    this.ui.dialog.layout(this.screen, this.ui.touch.rects());
    this.camera.follow(width, height, this.player.x, this.player.y);
  }

  private cellToFeet(p: CellPoint): [number, number] {
    return [(p.col + 0.5) * CELL, (p.row + 0.9) * CELL];
  }

  update(dt: number) {
    const { menu, dialog, hud, session } = this.ui;
    this.syncRole(session.role);
    this.clock += dt;
    const online = this.role !== 'solo';
    if (!dialog.active && input.wasPressed(...MENU_KEYS)) menu.toggle(this.hero);
    if (menu.open) {
      menu.update();
      if (!online) return; // solo: the world is paused. Online it keeps running behind the menu (the other player can't be paused).
    }

    if (this.role === 'client') this.updateClient(dt);
    else this.updateSimulation(dt);

    this.effects.update(dt);
    this.ambient.update(dt, this.player, [
      ...this.players().map((p) => p.body),
      ...this.mobs.filter((m) => m.alive).map((m) => m.body),
    ]);

    this.npc.animate(dt * 1000, false);
    for (const body of this.bodies()) body.zIndex = body.y;
    hud.update(this.hero);
    this.camera.follow(this.screen.width, this.screen.height, this.player.x, this.player.y);
  }

  /** Solo and host: the authoritative game. The host additionally runs the guest's player and sends snapshots. */
  private updateSimulation(dt: number) {
    const { menu, dialog } = this.ui;
    const host = this.role === 'host';
    const raw = this.readCommand();
    // Reading a dialog or the menu: the player stands still (a solo dialog freezes the whole world instead).
    const reading = menu.open || dialog.active;
    const cmd = reading ? { ...raw, dx: 0, dy: 0, mag: false } : raw;
    const guest = this.remote ? this.remoteCommand(this.remote) : NO_COMMAND;

    if (host || !dialog.active) {
      this.updatePlayer(this.local, cmd, dt);
      if (this.remote) this.updatePlayer(this.remote, guest, dt);
      for (const mob of this.mobs) mob.update(dt, this.mobWorld);
      if (cmd.mag) this.cast(this.local);
      if (this.remote && guest.mag) this.cast(this.remote);
    } else {
      this.player.animate(dt * 1000, false); // the world is frozen while talking
    }
    if (!menu.open) this.handleAction(cmd.act, () => this.attack(this.local));
    if (this.remote && guest.act) this.attack(this.remote);
    if (host) this.broadcast(dt);
  }

  /** Guest: no simulation. Show what the host last said, and tell it what this player is doing. */
  private updateClient(dt: number) {
    const { menu, dialog, session } = this.ui;
    const snap = session.takeSnapshot();
    if (snap) this.applySnapshot(snap);
    for (const p of this.players()) this.drawRemotePlayer(p, dt);
    for (const mob of this.mobs) mob.updateRemote(dt);

    const cmd = this.readCommand();
    const reading = menu.open || dialog.active;
    if (!menu.open) this.handleAction(cmd.act, () => this.actCount++);
    if (!reading && cmd.mag) this.magCount++;
    this.sendInput(dt, reading ? 0 : packKeys(cmd.dx, cmd.dy));
  }

  // --- Roles ---

  /** Switch to `role` (a peer connected or dropped), setting the world up for it. */
  private syncRole(role: Role) {
    if (role === this.role) return;
    if (this.role !== 'solo') this.leaveCoop();
    if (role === 'host') this.enterHost();
    else if (role === 'client') this.enterClient();
    this.role = role;
  }

  private addRemote(sheet: Sprites['hero'], hero: Hero) {
    const remote = new Player(sheet, hero);
    this.world.layer.addChild(remote.body);
    this.remote = remote;
    this.heroBodies.splice(1);
    this.heroBodies.push(remote.body);
    return remote;
  }

  private enterHost() {
    const hero = newHero();
    hero.name = 'Player 2';
    const guest = this.addRemote(this.sprites.guest, hero);
    guest.body.position.set(...this.cellToFeet(this.spawn));
    this.events = [];
    this.snapTimer = 0;
  }

  private enterClient() {
    // This machine's hero becomes Player 2 in the host's world. The solo hero is put back on disconnect.
    this.solo = { stats: { ...this.hero.stats }, name: this.hero.name };
    this.hero.name = 'Player 2';
    this.player.setSheet(this.sprites.guest);
    const host = this.addRemote(this.sprites.hero, newHero());
    host.body.visible = false; // until the first snapshot says where it is
    this.local.target = null;
    this.lastEvent = -1;
    this.actCount = this.magCount = this.inputSeq = 0;
    this.sent = { keys: -1, act: -1, mag: -1 };
    this.inputTimer = 0;
  }

  private leaveCoop() {
    const { remote } = this;
    if (remote) {
      this.world.layer.removeChild(remote.body);
      this.ambient.forget(remote.body);
      remote.body.destroy({ children: true });
    }
    this.remote = null;
    this.heroBodies.splice(1);

    const left = this.role === 'host' ? 'Player 2 left' : 'Disconnected';
    if (this.role === 'client') {
      // Back to the solo hero, standing where it ended up, with the mobs carrying on on their own.
      if (this.solo) Object.assign(this.hero.stats, this.solo.stats);
      this.hero.name = this.solo?.name ?? 'Hero';
      this.solo = null;
      this.player.setSheet(this.sprites.hero);
      this.local.target = null;
      this.local.flags = 0;
      this.local.invuln = 0;
      this.local.knock = { x: 0, y: 0 };
      this.player.alpha = 1;
      this.player.setOffset(0, 0);
      for (const mob of this.mobs) mob.release();
    }
    this.role = 'solo'; // so the notice below isn't broadcast
    this.effects.add(floatText(this.player.x, this.player.y - 40, left, 0xffffff));
  }

  // --- Co-op: host side ---

  /** The guest's controls for this tick. Action presses arrive as a running count, so none is lost or doubled. */
  private remoteCommand(p: Player): Command {
    const peer = this.ui.session.peerInput();
    if (!peer) return NO_COMMAND;
    const { dx, dy } = peer.fresh ? unpackKeys(peer.keys) : { dx: 0, dy: 0 };
    const act = peer.act > p.seenAct;
    const mag = peer.mag > p.seenMag;
    p.seenAct = peer.act;
    p.seenMag = peer.mag;
    return { dx, dy, act, mag };
  }

  /** Something the guest should also see (it is shown there, never simulated). Only a host records these. */
  private emit(e: WorldEvent) {
    if (this.role === 'host') this.events.push({ id: ++this.eventId, at: this.clock, e });
  }

  private broadcast(dt: number) {
    const { remote } = this;
    this.snapTimer += dt;
    if (!remote || this.snapTimer < 1 / SNAPSHOT_HZ) return;
    this.snapTimer = 0;
    this.events = this.events.filter((ev) => this.clock - ev.at < EVENT_KEEP);
    this.ui.session.send({
      k: 'snap',
      n: ++this.snapSeq,
      players: [this.snapPlayer(this.local), this.snapPlayer(remote)],
      mobs: this.mobs.map((m) => m.snapshot()),
      me: this.snapStats(remote.hero.stats),
      events: this.events.slice(-MAX_EVENTS_SENT).map(({ id, e }) => ({ id, e })),
    });
  }

  private snapPlayer(p: Player): PlayerSnap {
    const swinging = p.attackCooldown > ATTACK_COOLDOWN - 0.1;
    const flags = (p.moving ? FLAG.moving : 0) | (p.invuln > 0 ? FLAG.invuln : 0) | (swinging ? FLAG.swing : 0);
    return [round1(p.body.x), round1(p.body.y), dirIndex(p.body.facing), flags];
  }

  private snapStats(s: Stats): StatsSnap {
    return [s.level, s.xp, round1(s.hp), s.maxHp, round1(s.mp), s.maxMp, s.attack, s.defense, s.magic];
  }

  // --- Co-op: guest side ---

  /** Send the controls: when they change, and otherwise at INPUT_HZ so a lost packet is soon corrected. */
  private sendInput(dt: number, keys: number) {
    this.inputTimer += dt;
    const changed = keys !== this.sent.keys || this.actCount !== this.sent.act || this.magCount !== this.sent.mag;
    if (!changed && this.inputTimer < 1 / INPUT_HZ) return;
    this.inputTimer = 0;
    const msg = { k: 'in', n: ++this.inputSeq, keys, act: this.actCount, mag: this.magCount } as const;
    if (this.ui.session.send(msg)) this.sent = { keys, act: this.actCount, mag: this.magCount };
  }

  private applySnapshot(snap: SnapMsg) {
    const { remote } = this;
    if (!remote) return;
    const [hostPlayer, guestPlayer] = snap.players;
    this.setPlayerState(remote, hostPlayer);
    this.setPlayerState(this.local, guestPlayer);

    if (snap.mobs.length === this.mobs.length) snap.mobs.forEach((m, i) => this.mobs[i]?.setRemote(m));

    const [level, xp, hp, maxHp, mp, maxMp, attack, defense, magic] = snap.me;
    if (maxHp > 0 && maxMp > 0)
      Object.assign(this.hero.stats, { level, xp, hp, maxHp, mp, maxMp, attack, defense, magic });

    let newest = this.lastEvent;
    for (const { id, e } of snap.events) {
      if (id <= this.lastEvent) continue; // already shown (events repeat across snapshots)
      newest = Math.max(newest, id);
      this.showEvent(e);
    }
    this.lastEvent = newest;
  }

  private setPlayerState(p: Player, [x, y, dir, flags]: PlayerSnap) {
    p.body.face(DIRS[dir] ?? 'down');
    p.flags = flags;
    if (!p.target) p.body.position.set(x, y); // first word from the host: appear there
    p.body.visible = true;
    p.target = { x, y };
  }

  /** Guest: draw a player from what the host last said (position glides; the rest comes from the flags). */
  private drawRemotePlayer(p: Player, dt: number) {
    if (p.target) glide(p.body, p.target.x, p.target.y, dt);
    const [fx, fy] = DIR_VEC[p.body.facing];
    const swinging = (p.flags & FLAG.swing) !== 0;
    p.body.setOffset(swinging ? fx * 3 : 0, swinging ? fy * 3 : 0);
    p.body.alpha = p.flags & FLAG.invuln && Math.floor(this.clock * 16) % 2 === 0 ? 0.35 : 1;
    p.body.animate(dt * 1000, (p.flags & FLAG.moving) !== 0);
  }

  private showEvent(e: WorldEvent) {
    switch (e.type) {
      case 'slash':
        this.swing(e.x, e.y, DIRS[e.dir] ?? 'down');
        break;
      case 'bolt':
        this.shoot(e.x, e.y, e.vx, e.vy);
        break;
      case 'text':
        this.effects.add(floatText(e.x, e.y, e.text, e.color));
        break;
      case 'fx':
        this.effects.add(particleEffect(e.name, e.x, e.y, { dir: e.dir }));
        break;
      case 'defeat':
        if (e.player === 1) this.ui.dialog.say(DEFEAT_LINES); // this machine is the guest
        break;
    }
  }

  // --- Players ---

  private readCommand(): Command {
    return {
      dx: (input.isDown('ArrowRight', 'KeyD') ? 1 : 0) - (input.isDown('ArrowLeft', 'KeyA') ? 1 : 0),
      dy: (input.isDown('ArrowDown', 'KeyS') ? 1 : 0) - (input.isDown('ArrowUp', 'KeyW') ? 1 : 0),
      act: input.wasPressed(...ACTION_KEYS),
      mag: input.wasPressed(...MAGIC_KEYS),
    };
  }

  private updatePlayer(p: Player, cmd: Command, dt: number) {
    const s = p.hero.stats;
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.castCooldown = Math.max(0, p.castCooldown - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.sinceHit += dt;
    s.mp = Math.min(s.maxMp, s.mp + MP_REGEN * dt);
    if (p.sinceHit > HP_REGEN_DELAY) s.hp = Math.min(s.maxHp, s.hp + HP_REGEN * dt);

    if (p.knock.x || p.knock.y) {
      this.collision.slide(p.body, p.knock.x * dt, p.knock.y * dt, this.bodies());
      const decay = Math.exp(-12 * dt);
      p.knock.x *= decay;
      p.knock.y *= decay;
      if (Math.hypot(p.knock.x, p.knock.y) < 5) p.knock = { x: 0, y: 0 };
    }

    p.moving = this.move(p, cmd, dt);
    // Lunge into a swing; blink while invulnerable.
    const [fx, fy] = DIR_VEC[p.body.facing];
    const swinging = p.attackCooldown > ATTACK_COOLDOWN - 0.1;
    p.body.setOffset(swinging ? fx * 3 : 0, swinging ? fy * 3 : 0);
    p.body.alpha = p.invuln > 0 && Math.floor(p.invuln * 16) % 2 === 0 ? 0.35 : 1;
    p.body.animate(dt * 1000, p.moving);
  }

  /** Returns true if the player is trying to move. */
  private move(p: Player, { dx, dy }: Command, dt: number): boolean {
    if (!dx && !dy) return false;
    if (dx) p.body.face(dx > 0 ? 'right' : 'left');
    else p.body.face(dy > 0 ? 'down' : 'up');
    const len = Math.hypot(dx, dy);
    const step = SPEED * dt;
    this.collision.slide(p.body, (dx / len) * step, (dy / len) * step, this.bodies());
    return true;
  }

  /** The local player's action button: advance the dialog, talk when next to the NPC, otherwise `attack`. */
  private handleAction(pressed: boolean, attack: () => void) {
    if (!pressed) return;
    const { dialog } = this.ui;
    if (dialog.active) {
      dialog.advance();
    } else if (this.npc.visible && Math.hypot(this.player.x - this.npc.x, this.player.y - this.npc.y) < CELL * 1.5) {
      this.npc.face(directionToward(this.player.x - this.npc.x, this.player.y - this.npc.y));
      dialog.say(NPC_LINES);
    } else {
      attack();
    }
  }

  private attack(p: Player) {
    if (p.attackCooldown > 0) return;
    p.attackCooldown = ATTACK_COOLDOWN;
    const dir = p.body.facing;
    const [vx, vy] = DIR_VEC[dir];
    this.swing(p.body.x, p.body.y, dir);
    this.emit({ type: 'slash', x: round1(p.body.x), y: round1(p.body.y), dir: dirIndex(dir) });
    const cx = p.body.x + vx * 16;
    const cy = p.body.y + vy * 16;
    for (const mob of this.mobs) {
      if (mob.alive && Math.hypot(mob.body.x - cx, mob.body.y - cy) < MELEE_REACH) {
        this.hitMob(mob, rollDamage(attackPower(p.hero), mob.kind.defense), vx, vy);
      }
    }
  }

  /** A sword swing by a player standing at (x, y) facing `dir`: the arc, and leaves shaken from any canopy it reaches. */
  private swing(x: number, y: number, dir: Direction) {
    const [vx, vy] = DIR_VEC[dir];
    this.effects.add(slashEffect(x + vx * 6, y - 12 + vy * 6, dir));
    this.ambient.shake(x + vx * 16, y + vy * 16 - 6, MELEE_REACH);
  }

  private cast(p: Player) {
    if (p.castCooldown > 0) return;
    p.castCooldown = CAST_COOLDOWN;
    const { spell, stats } = p.hero;
    const { x, y } = p.body;
    if (stats.mp < spell.cost) {
      this.text(x, y - 40, 'No MP', 0x8fb3ff);
      return;
    }
    stats.mp -= spell.cost;
    const [vx, vy] = DIR_VEC[p.body.facing];
    this.shoot(x + vx * 10, y - BOLT_HEIGHT + vy * 8, vx * BOLT_SPEED, vy * BOLT_SPEED, (mob) => {
      this.hitMob(mob, rollDamage(spellPower(p.hero), mob.kind.defense), vx, vy, true);
    });
  }

  /** Launch a bolt. `onHit` applies the damage (the host); without it the bolt is only for show (the guest). */
  private shoot(x: number, y: number, vx: number, vy: number, onHit?: (mob: Mob) => void) {
    const trail = particleEffect('boltTrail', x, y);
    this.effects.add(trail);
    this.effects.add(
      boltEffect(
        x,
        y,
        vx,
        vy,
        BOLT_RANGE,
        (bx, by) => {
          trail.moveTo(bx, by);
          if (this.collision.isBlocked(Math.floor(bx / CELL), Math.floor((by + BOLT_HEIGHT) / CELL))) return true;
          const mob = this.mobs.find(
            (m) => m.alive && Math.abs(bx - m.body.x) < 12 && Math.abs(by + BOLT_HEIGHT - m.body.y) < 16,
          );
          if (!mob) return false;
          onHit?.(mob);
          return true;
        },
        (bx, by, hit) => {
          trail.stop();
          if (hit) this.effects.add(particleEffect('boltImpact', bx, by));
        },
      ),
    );
    this.emit({ type: 'bolt', x: round1(x), y: round1(y), vx, vy });
  }

  /** A one-shot particle effect, also shown to the guest. `dir` is an angle in radians. */
  private fx(name: FxName, x: number, y: number, dir?: number) {
    this.effects.add(particleEffect(name, x, y, { dir }));
    this.emit({ type: 'fx', name, x: round1(x), y: round1(y), ...(dir === undefined ? {} : { dir: round1(dir) }) });
  }

  /** A floating number or word, also shown to the guest. */
  private text(x: number, y: number, text: string, color: number) {
    this.effects.add(floatText(x, y, text, color));
    this.emit({ type: 'text', x: round1(x), y: round1(y), text, color });
  }

  /** Every player takes the kill's XP (in solo, just the one). */
  private hitMob(mob: Mob, damage: number, vx: number, vy: number, bolt = false) {
    const killed = mob.hit(damage, vx, vy);
    // Sparks fly on from the blow (the bolt has its own impact burst), at chest height.
    if (!bolt) this.fx('hitSpark', mob.body.x, mob.body.y - 14, Math.atan2(vy, vx));
    this.text(mob.body.x, mob.body.y - 40, String(damage), 0xffffff);
    if (!killed) return;
    this.fx('mobPoof', mob.body.x, mob.body.y - 12);
    this.text(mob.body.x, mob.body.y - 52, `+${mob.kind.xp} XP`, 0xffb13f);
    for (const p of this.players()) {
      if (!gainXp(p.hero.stats, mob.kind.xp)) continue;
      this.text(p.body.x, p.body.y - 48, 'LEVEL UP!', 0xffb13f);
      this.fx('levelUp', p.body.x, p.body.y - 14);
    }
  }

  private hurtHero(mob: Mob, victim: Character) {
    const p = this.players().find((q) => q.body === victim);
    if (!p || p.invuln > 0) return;
    const damage = rollDamage(mob.kind.attack, defensePower(p.hero));
    const s = p.hero.stats;
    s.hp -= damage;
    p.invuln = INVULN_TIME;
    p.sinceHit = 0;
    this.text(p.body.x, p.body.y - 40, String(damage), 0xff5a5a);
    this.fx('heroHurt', p.body.x, p.body.y - 14);
    const dx = p.body.x - mob.body.x;
    const dy = p.body.y - mob.body.y;
    const len = Math.hypot(dx, dy) || 1;
    p.knock = { x: (dx / len) * 220, y: (dy / len) * 220 };
    if (s.hp <= 0) this.defeat(p);
  }

  /** Out of HP: back to the spawn point, fully restored (XP and levels are kept). */
  private defeat(p: Player) {
    const s = p.hero.stats;
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    p.body.position.set(...this.cellToFeet(this.spawn));
    p.body.face('down');
    p.knock = { x: 0, y: 0 };
    p.invuln = 0;
    if (this.role === 'solo') this.mobs.forEach((m) => m.reset()); // in co-op the other player is still fighting them
    if (p === this.local) this.ui.dialog.say(DEFEAT_LINES);
    else this.emit({ type: 'defeat', player: 1 });
  }

  /** The local player, then the other one if there is one. */
  private players(): Player[] {
    return this.remote ? [this.local, this.remote] : [this.local];
  }

  /** Every character that blocks others. */
  private bodies(): Character[] {
    return [...this.players().map((p) => p.body), this.npc, ...this.mobs.filter((m) => m.alive).map((m) => m.body)];
  }
}
