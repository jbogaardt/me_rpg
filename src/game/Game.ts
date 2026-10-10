import { Application, Graphics, Text, type Texture } from 'pixi.js';
import { MapView } from '../map/MapView';
import { CELL, type MapData } from '../map/types';
import { input } from './input';
import { Character, type Direction } from './Character';

const SPEED = 120; // pixels per second
const NPC_LINES = [
  'Greetings, traveler. This world is still being drawn.',
  'Soon there will be a story here. Come back later!',
];

export class Game {
  private world: MapView;
  private blocked: Set<number>;
  private player: Character;
  private npc: Character;
  private ui = new Graphics(); // dialog box
  private dialogText = new Text({ text: '', style: { fill: 0xffffff, fontSize: 18, wordWrap: true, wordWrapWidth: 560 } });
  private lineIndex = -1;
  private zoom = 1;

  constructor(
    private app: Application,
    private data: MapData,
    textures: Map<string, Texture>,
    heroSheet: Texture,
    npcSheet: Texture,
  ) {
    this.player = new Character(heroSheet, true);
    this.npc = new Character(npcSheet);
    this.world = new MapView(data, textures);
    this.blocked = new Set(data.collision);

    // Entities are positioned by their feet so they y-sort with map objects.
    this.player.position.set((data.spawn.col + 0.5) * CELL, (data.spawn.row + 0.9) * CELL);
    if (data.npc) this.npc.position.set((data.npc.col + 0.5) * CELL, (data.npc.row + 0.9) * CELL);
    else this.npc.visible = false;
    this.world.addChild(this.npc, this.player);

    this.ui.rect(0, 0, 600, 80).fill({ color: 0x000000, alpha: 0.8 });
    this.dialogText.position.set(20, 20);
    this.ui.addChild(this.dialogText);
    this.ui.visible = false;

    app.stage.addChild(this.world, this.ui);
    app.renderer.on('resize', () => this.layout());
    this.layout();
  }

  start() {
    this.app.ticker.add((t) => this.update(t.deltaMS / 1000));
  }

  /** Pick an integer zoom for the screen size and dock the dialog box at the bottom. */
  private layout() {
    const { width, height } = this.app.screen;
    this.zoom = Math.max(1, Math.floor(Math.min(width / 640, height / 480)));
    this.world.scale.set(this.zoom);
    this.ui.position.set(Math.round((width - 600) / 2), height - 100);
    this.updateCamera();
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
    const moving = this.lineIndex < 0 && this.move(dt);
    this.player.animate(dt * 1000, moving);
    this.player.zIndex = this.player.y;
    this.npc.zIndex = this.npc.y;
    this.npc.animate(dt * 1000, false);
    this.updateCamera();
    this.handleInteract();
    input.endFrame();
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
    // Resolve axes separately so the player slides along walls.
    this.tryMove((dx / len) * step, 0);
    this.tryMove(0, (dy / len) * step);
    return true;
  }

  private isBlocked(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.data.width || row >= this.data.height) return true;
    return this.blocked.has(row * this.data.width + col);
  }

  private tryMove(mx: number, my: number) {
    const nx = this.player.x + mx;
    const ny = this.player.y + my;
    // Collision box is a small rectangle around the feet (player origin = feet).
    if (this.npc.visible && Math.abs(nx - this.npc.x) < 14 && Math.abs(ny - this.npc.y) < 8) return;
    for (const [cx, cy] of [[-6, -6], [6, -6], [-6, -1], [6, -1]]) {
      if (this.isBlocked(Math.floor((nx + cx) / CELL), Math.floor((ny + cy) / CELL))) return;
    }
    this.player.position.set(nx, ny);
  }

  private handleInteract() {
    if (!input.wasPressed('Space', 'Enter', 'KeyE')) return;
    if (this.lineIndex >= 0) {
      this.lineIndex++;
      if (this.lineIndex >= NPC_LINES.length) {
        this.lineIndex = -1;
        this.ui.visible = false;
      } else {
        this.dialogText.text = NPC_LINES[this.lineIndex];
      }
    } else if (this.npc.visible && Math.hypot(this.player.x - this.npc.x, this.player.y - this.npc.y) < CELL * 1.5) {
      this.lineIndex = 0;
      this.npc.face(this.directionToward(this.player.x - this.npc.x, this.player.y - this.npc.y));
      this.dialogText.text = NPC_LINES[0];
      this.ui.visible = true;
    }
  }

  private directionToward(dx: number, dy: number): Direction {
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }
}
