import type { Container } from 'pixi.js';
import type { Sprites, Zone } from '../assets';
import { Camera } from '../core/camera';
import { input } from '../core/input';
import type { Scene } from '../core/Scene';
import type { TouchControls } from '../core/touch';
import { Character, DIR_VEC, directionToward } from '../entities/Character';
import { boltEffect, Effects, floatText, slashEffect } from '../entities/effects';
import { Mob, type MobWorld } from '../entities/Mob';
import type { Dialog } from '../hud/Dialog';
import type { Hud } from '../hud/Hud';
import type { Menu } from '../hud/Menu';
import { MapView } from '../map/MapView';
import { CELL, type CellPoint } from '../map/types';
import { attackPower, defensePower, gainXp, MOB_KINDS, newHero, rollDamage, spellPower } from '../systems/combat';
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
const MP_REGEN = 1.5; // per second
const HP_REGEN = 1; // per second, once HP_REGEN_DELAY seconds pass without a hit
const HP_REGEN_DELAY = 5;

/** The HTML overlays shared by every scene. They are created once in main.ts. */
export interface Ui {
  hud: Hud;
  menu: Menu;
  dialog: Dialog;
  touch: TouchControls;
}

/** The overworld: one zone with the hero, an NPC and mobs. */
export class OverworldScene implements Scene {
  private world: MapView;
  private camera: Camera;
  private collision: Collision;
  private player: Character;
  private npc: Character;
  private mobs: Mob[];
  private mobWorld: MobWorld;
  private hero = newHero();
  private effects: Effects;
  private spawn: CellPoint;
  private screen = { width: 0, height: 0 };

  // Hero combat state
  private attackCooldown = 0;
  private castCooldown = 0;
  private invuln = 0;
  private sinceHit = HP_REGEN_DELAY;
  private knock = { x: 0, y: 0 };

  constructor(
    zone: Zone,
    sprites: Sprites,
    private ui: Ui,
  ) {
    const { data } = zone;
    this.world = new MapView(data, zone.textures);
    this.camera = new Camera(this.world, data.width * CELL, data.height * CELL);
    this.collision = new Collision(data.width, data.height, data.collision);
    this.spawn = data.spawn;
    this.effects = new Effects(this.world.layer);
    this.player = new Character(sprites.hero, true);
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
      hero: this.player,
      slide: (body, mx, my) => this.collision.slide(body, mx, my, this.bodies()),
      strike: (mob) => this.hurtHero(mob),
    };
    this.world.layer.addChild(this.npc, this.player, ...this.mobs.map((m) => m.body));
  }

  get root(): Container {
    return this.world;
  }

  enter() {}

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
    const { menu, dialog, hud } = this.ui;
    if (!dialog.active && input.wasPressed(...MENU_KEYS)) menu.toggle(this.hero);
    if (menu.open) {
      menu.update(); // the world is paused
      return;
    }

    if (!dialog.active) {
      this.updateHero(dt);
      for (const mob of this.mobs) mob.update(dt, this.mobWorld);
      if (input.wasPressed(...MAGIC_KEYS)) this.cast();
    } else {
      this.player.animate(dt * 1000, false); // the world is frozen while talking
    }
    this.handleAction();
    this.effects.update(dt);

    this.npc.animate(dt * 1000, false);
    for (const body of this.bodies()) body.zIndex = body.y;
    hud.update(this.hero);
    this.camera.follow(this.screen.width, this.screen.height, this.player.x, this.player.y);
  }

  // --- Hero ---

  private updateHero(dt: number) {
    const s = this.hero.stats;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.castCooldown = Math.max(0, this.castCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.sinceHit += dt;
    s.mp = Math.min(s.maxMp, s.mp + MP_REGEN * dt);
    if (this.sinceHit > HP_REGEN_DELAY) s.hp = Math.min(s.maxHp, s.hp + HP_REGEN * dt);

    if (this.knock.x || this.knock.y) {
      this.collision.slide(this.player, this.knock.x * dt, this.knock.y * dt, this.bodies());
      const decay = Math.exp(-12 * dt);
      this.knock.x *= decay;
      this.knock.y *= decay;
      if (Math.hypot(this.knock.x, this.knock.y) < 5) this.knock = { x: 0, y: 0 };
    }

    const moving = this.move(dt);
    // Lunge into a swing; blink while invulnerable.
    const [fx, fy] = DIR_VEC[this.player.facing];
    const swinging = this.attackCooldown > ATTACK_COOLDOWN - 0.1;
    this.player.setOffset(swinging ? fx * 3 : 0, swinging ? fy * 3 : 0);
    this.player.alpha = this.invuln > 0 && Math.floor(this.invuln * 16) % 2 === 0 ? 0.35 : 1;
    this.player.animate(dt * 1000, moving);
  }

  /** Returns true if the player is trying to move. */
  private move(dt: number): boolean {
    const dx = (input.isDown('ArrowRight', 'KeyD') ? 1 : 0) - (input.isDown('ArrowLeft', 'KeyA') ? 1 : 0);
    const dy = (input.isDown('ArrowDown', 'KeyS') ? 1 : 0) - (input.isDown('ArrowUp', 'KeyW') ? 1 : 0);
    if (!dx && !dy) return false;
    if (dx) this.player.face(dx > 0 ? 'right' : 'left');
    else this.player.face(dy > 0 ? 'down' : 'up');
    const len = Math.hypot(dx, dy);
    const step = SPEED * dt;
    this.collision.slide(this.player, (dx / len) * step, (dy / len) * step, this.bodies());
    return true;
  }

  private handleAction() {
    if (!input.wasPressed(...ACTION_KEYS)) return;
    const { dialog } = this.ui;
    if (dialog.active) {
      dialog.advance();
    } else if (this.npc.visible && Math.hypot(this.player.x - this.npc.x, this.player.y - this.npc.y) < CELL * 1.5) {
      this.npc.face(directionToward(this.player.x - this.npc.x, this.player.y - this.npc.y));
      dialog.say(NPC_LINES);
    } else {
      this.attack();
    }
  }

  private attack() {
    if (this.attackCooldown > 0) return;
    this.attackCooldown = ATTACK_COOLDOWN;
    const dir = this.player.facing;
    const [vx, vy] = DIR_VEC[dir];
    this.effects.add(slashEffect(this.player.x + vx * 6, this.player.y - 12 + vy * 6, dir));
    const cx = this.player.x + vx * 16;
    const cy = this.player.y + vy * 16;
    for (const mob of this.mobs) {
      if (mob.alive && Math.hypot(mob.body.x - cx, mob.body.y - cy) < MELEE_REACH) {
        this.hitMob(mob, rollDamage(attackPower(this.hero), mob.kind.defense), vx, vy);
      }
    }
  }

  private cast() {
    if (this.castCooldown > 0) return;
    this.castCooldown = CAST_COOLDOWN;
    const { spell, stats } = this.hero;
    const { x, y } = this.player;
    if (stats.mp < spell.cost) {
      this.effects.add(floatText(x, y - 40, 'No MP', 0x8fb3ff));
      return;
    }
    stats.mp -= spell.cost;
    const [vx, vy] = DIR_VEC[this.player.facing];
    const hitY = 14; // the bolt flies at chest height, this far above the ground it tests against
    this.effects.add(
      boltEffect(x + vx * 10, y - hitY + vy * 8, vx * BOLT_SPEED, vy * BOLT_SPEED, BOLT_RANGE, (bx, by) => {
        if (this.collision.isBlocked(Math.floor(bx / CELL), Math.floor((by + hitY) / CELL))) return true;
        const mob = this.mobs.find(
          (m) => m.alive && Math.abs(bx - m.body.x) < 12 && Math.abs(by + hitY - m.body.y) < 16,
        );
        if (!mob) return false;
        this.hitMob(mob, rollDamage(spellPower(this.hero), mob.kind.defense), vx, vy);
        return true;
      }),
    );
  }

  private hitMob(mob: Mob, damage: number, vx: number, vy: number) {
    const killed = mob.hit(damage, vx, vy);
    this.effects.add(floatText(mob.body.x, mob.body.y - 40, String(damage), 0xffffff));
    if (!killed) return;
    this.effects.add(floatText(mob.body.x, mob.body.y - 52, `+${mob.kind.xp} XP`, 0xffb13f));
    if (gainXp(this.hero.stats, mob.kind.xp)) {
      this.effects.add(floatText(this.player.x, this.player.y - 48, 'LEVEL UP!', 0xffb13f));
    }
  }

  private hurtHero(mob: Mob) {
    if (this.invuln > 0) return;
    const damage = rollDamage(mob.kind.attack, defensePower(this.hero));
    const s = this.hero.stats;
    s.hp -= damage;
    this.invuln = INVULN_TIME;
    this.sinceHit = 0;
    this.effects.add(floatText(this.player.x, this.player.y - 40, String(damage), 0xff5a5a));
    const dx = this.player.x - mob.body.x;
    const dy = this.player.y - mob.body.y;
    const len = Math.hypot(dx, dy) || 1;
    this.knock = { x: (dx / len) * 220, y: (dy / len) * 220 };
    if (s.hp <= 0) this.defeat();
  }

  /** Out of HP: back to the spawn point, fully restored (XP and levels are kept). */
  private defeat() {
    const s = this.hero.stats;
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    this.player.position.set(...this.cellToFeet(this.spawn));
    this.player.face('down');
    this.knock = { x: 0, y: 0 };
    this.invuln = 0;
    this.mobs.forEach((m) => m.reset());
    this.ui.dialog.say(DEFEAT_LINES);
  }

  /** Every character that blocks others. */
  private bodies(): Character[] {
    return [this.player, this.npc, ...this.mobs.filter((m) => m.alive).map((m) => m.body)];
  }
}
