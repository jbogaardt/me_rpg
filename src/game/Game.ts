import { Application, type Texture } from 'pixi.js';
import { MapView } from '../map/MapView';
import { CELL, type CellPoint, type MapData } from '../map/types';
import { input } from './input';
import { Character, DIR_VEC, directionToward } from './Character';
import { createTouchControls, type TouchControls } from './touch';
import { attackPower, defensePower, gainXp, MOB_KINDS, newHero, rollDamage, spellPower, type Hero } from './combat';
import { Mob, type MobWorld } from './Mob';
import { boltEffect, Effects, floatText, slashEffect } from './effects';
import { Ambient } from './ambient';
import { Hud } from './Hud';
import { Menu } from './Menu';

const SPEED = 120; // pixels per second
const DIALOG_MAX_W = 600;
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

export interface GameSprites {
  hero: Texture;
  npc: Texture;
  mobs: Map<string, Texture>; // by MobKind sheet file
}

export class Game {
  private world: MapView;
  private blocked: Set<number>;
  private player: Character;
  private npc: Character;
  private mobs: Mob[];
  private mobWorld: MobWorld;
  private hero: Hero = newHero();
  private effects: Effects;
  private ambient: Ambient;
  private hud = new Hud();
  private menu = new Menu();
  private touch: TouchControls;
  private dialog = document.getElementById('dialog')!; // HTML box (index.html); tapping it advances
  private dialogText = document.getElementById('dialog-text')!;
  private lines: string[] = [];
  private lineIndex = -1; // -1 = no dialog; the world is frozen while talking
  private zoom = 1;

  // Hero combat state
  private attackCooldown = 0;
  private castCooldown = 0;
  private invuln = 0;
  private sinceHit = HP_REGEN_DELAY;
  private knock = { x: 0, y: 0 };

  constructor(
    private app: Application,
    private data: MapData,
    textures: Map<string, Texture>,
    sprites: GameSprites,
  ) {
    this.player = new Character(sprites.hero, true);
    this.npc = new Character(sprites.npc);
    this.world = new MapView(data, textures);
    this.blocked = new Set(data.collision);
    this.effects = new Effects(this.world);
    this.ambient = new Ambient(this.world, data, app.renderer);

    // Entities are positioned by their feet so they y-sort with map objects.
    this.player.position.set(...this.cellToFeet(data.spawn));
    if (data.npc) this.npc.position.set(...this.cellToFeet(data.npc));
    else this.npc.visible = false;
    this.mobs = data.mobs.map((m) => {
      const kind = MOB_KINDS[m.kind];
      return new Mob(kind, sprites.mobs.get(kind.sheet)!, ...this.cellToFeet(m));
    });
    this.mobWorld = {
      hero: this.player,
      slide: (body, mx, my) => this.slide(body, mx, my),
      strike: (mob) => this.hurtHero(mob),
    };
    this.world.addChild(this.npc, this.player, ...this.mobs.map((m) => m.body));

    app.stage.addChild(this.world);
    this.touch = createTouchControls(() => this.layout());
    app.renderer.on('resize', () => this.layout());
    this.layout();
  }

  start() {
    this.app.ticker.add((t) => this.update(Math.min(t.deltaMS / 1000, 0.1)));
  }

  private cellToFeet(p: CellPoint): [number, number] {
    return [(p.col + 0.5) * CELL, (p.row + 0.9) * CELL];
  }

  /** Pick an integer zoom for the screen size and dock the dialog box at the bottom. */
  private layout() {
    const { width, height } = this.app.screen;
    this.zoom = Math.max(1, Math.floor(Math.min(width / 640, height / 480)));
    this.world.scale.set(this.zoom);
    this.layoutDialog();
    this.updateCamera();
  }

  /** Size the dialog box to the screen and keep it clear of the on-screen touch controls. It grows upward with its text. */
  private layoutDialog() {
    const { width, height } = this.app.screen;
    const margin = 10;
    let left = margin;
    let right = width - margin;
    let bottom = height - 20;
    const [pad, buttons] = this.touch.rects();
    if (pad && buttons) {
      // Fit between the D-pad and the buttons if there's room (landscape), otherwise sit above them.
      if (buttons.left - pad.right - 2 * margin >= 320) {
        left = pad.right + margin;
        right = buttons.left - margin;
      } else {
        bottom = Math.min(pad.top, buttons.top) - margin;
      }
    }
    const w = Math.min(DIALOG_MAX_W, right - left);
    Object.assign(this.dialog.style, {
      left: `${Math.round(left + (right - left - w) / 2)}px`,
      width: `${w}px`,
      bottom: `${Math.round(height - bottom)}px`,
    });
  }

  private say(lines: string[]) {
    this.lines = lines;
    this.lineIndex = 0;
    this.dialogText.textContent = lines[0];
    this.dialog.hidden = false;
  }

  /** Follow the player, but never show past the map edge (center the map if it's smaller than the screen). */
  private updateCamera() {
    const { width, height } = this.app.screen;
    const mapW = this.data.width * CELL * this.zoom;
    const mapH = this.data.height * CELL * this.zoom;
    const follow = (screen: number, map: number, target: number) =>
      map <= screen ? (screen - map) / 2 : Math.min(0, Math.max(screen - map, screen / 2 - target * this.zoom));
    this.world.position.set(
      Math.round(follow(width, mapW, this.player.x)),
      Math.round(follow(height, mapH, this.player.y)),
    );
  }

  private update(dt: number) {
    if (this.lineIndex < 0 && input.wasPressed(...MENU_KEYS)) this.menu.toggle(this.hero);
    if (this.menu.open) {
      this.menu.update(); // the world is paused
      input.endFrame();
      return;
    }

    if (this.lineIndex < 0) {
      this.updateHero(dt);
      for (const mob of this.mobs) mob.update(dt, this.mobWorld);
      if (input.wasPressed(...MAGIC_KEYS)) this.cast();
    } else {
      this.player.animate(dt * 1000, false);
    }
    this.handleAction();
    this.effects.update(dt);
    this.ambient.update(dt, this.player, [this.player, ...this.mobs.filter((m) => m.alive).map((m) => m.body)]);

    this.npc.animate(dt * 1000, false);
    for (const body of this.bodies()) body.zIndex = body.y;
    this.hud.update(this.hero);
    this.updateCamera();
    input.endFrame();
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
      this.slide(this.player, this.knock.x * dt, this.knock.y * dt);
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
    this.slide(this.player, (dx / len) * step, (dy / len) * step);
    return true;
  }

  private handleAction() {
    if (!input.wasPressed(...ACTION_KEYS)) return;
    if (this.lineIndex >= 0) {
      this.lineIndex++;
      if (this.lineIndex >= this.lines.length) {
        this.lineIndex = -1;
        this.dialog.hidden = true;
      } else {
        this.dialogText.textContent = this.lines[this.lineIndex];
      }
    } else if (this.npc.visible && Math.hypot(this.player.x - this.npc.x, this.player.y - this.npc.y) < CELL * 1.5) {
      this.npc.face(directionToward(this.player.x - this.npc.x, this.player.y - this.npc.y));
      this.say(NPC_LINES);
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
    this.ambient.shake(cx, cy - 6, MELEE_REACH); // swinging at a tree or bush shakes leaves loose
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
        if (this.isBlocked(Math.floor(bx / CELL), Math.floor((by + hitY) / CELL))) return true;
        const mob = this.mobs.find((m) => m.alive && Math.abs(bx - m.body.x) < 12 && Math.abs(by + hitY - m.body.y) < 16);
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
    this.player.position.set(...this.cellToFeet(this.data.spawn));
    this.player.face('down');
    this.knock = { x: 0, y: 0 };
    this.invuln = 0;
    this.mobs.forEach((m) => m.reset());
    this.say(DEFEAT_LINES);
  }

  // --- Collision ---

  /** Every character that blocks others. */
  private bodies(): Character[] {
    return [this.player, this.npc, ...this.mobs.filter((m) => m.alive).map((m) => m.body)];
  }

  private isBlocked(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.data.width || row >= this.data.height) return true;
    return this.blocked.has(row * this.data.width + col);
  }

  /** Whether feet at (x, y) fit the map. The collision box is a small rectangle around the feet. */
  private fitsMap(x: number, y: number): boolean {
    for (const [cx, cy] of [[-6, -6], [6, -6], [-6, -1], [6, -1]]) {
      if (this.isBlocked(Math.floor((x + cx) / CELL), Math.floor((y + cy) / CELL))) return false;
    }
    return true;
  }

  /** Whether `body` may step to (x, y): on open ground, and not pushing further into another character. */
  private canMove(body: Character, x: number, y: number): boolean {
    if (!this.fitsMap(x, y)) return false;
    for (const other of this.bodies()) {
      if (other === body || !other.visible) continue;
      const overlaps = Math.abs(x - other.x) < 14 && Math.abs(y - other.y) < 8;
      // Moving apart is always allowed, so bodies that end up overlapping (e.g. via knockback) can't get stuck.
      if (overlaps && Math.hypot(x - other.x, y - other.y) < Math.hypot(body.x - other.x, body.y - other.y)) return false;
    }
    return true;
  }

  /** Move with collision, resolving axes separately so bodies slide along walls. Returns true if it moved. */
  private slide(body: Character, mx: number, my: number): boolean {
    let moved = false;
    if (mx && this.canMove(body, body.x + mx, body.y)) {
      body.x += mx;
      moved = true;
    }
    if (my && this.canMove(body, body.x, body.y + my)) {
      body.y += my;
      moved = true;
    }
    return moved;
  }
}
