import { Application, Container, Graphics, Text } from 'pixi.js';
import { input } from './input';
import { BLOCKED, MAP, TILE, findTile, tileAt } from './map';

const COLORS: Record<string, number> = {
  '#': 0x4a4a5e,
  '.': 0x3d7a3d,
  '~': 0x2f5f9e,
  N: 0x3d7a3d,
  '@': 0x3d7a3d,
};
const SPEED = 120; // pixels per second
const NPC_LINES = [
  'Greetings, traveler. This world is still being drawn.',
  'Soon there will be a story here. Come back later!',
];

export class Game {
  private world = new Container();
  private ui = new Container();
  private player = new Graphics().rect(-10, -10, 20, 20).fill(0xffd166);
  private npc = new Graphics().rect(-10, -10, 20, 20).fill(0xef476f);
  private dialogBox = new Graphics();
  private dialogText = new Text({ text: '', style: { fill: 0xffffff, fontSize: 18, wordWrap: true, wordWrapWidth: 560 } });
  private lineIndex = -1;

  constructor(private app: Application) {
    this.buildMap();
    const p = findTile('@');
    const n = findTile('N');
    this.player.position.set((p.col + 0.5) * TILE, (p.row + 0.5) * TILE);
    this.npc.position.set((n.col + 0.5) * TILE, (n.row + 0.5) * TILE);
    this.world.addChild(this.npc, this.player);

    this.dialogBox.rect(0, 0, 600, 80).fill({ color: 0x000000, alpha: 0.8 });
    this.dialogText.position.set(20, 20);
    this.dialogBox.addChild(this.dialogText);
    this.dialogBox.visible = false;
    this.ui.addChild(this.dialogBox);

    app.stage.addChild(this.world, this.ui);
    app.renderer.on('resize', () => this.layout());
    this.layout();
  }

  start() {
    this.app.ticker.add((t) => this.update(t.deltaMS / 1000));
  }

  private buildMap() {
    const g = new Graphics();
    MAP.forEach((row, r) =>
      [...row].forEach((ch, c) => g.rect(c * TILE, r * TILE, TILE, TILE).fill(COLORS[ch] ?? 0xff00ff)),
    );
    this.world.addChild(g);
  }

  /** Center the map and dock the dialog box at the bottom. */
  private layout() {
    const { width, height } = this.app.screen;
    this.world.position.set(
      Math.round((width - MAP[0].length * TILE) / 2),
      Math.round((height - MAP.length * TILE) / 2),
    );
    this.dialogBox.position.set(Math.round((width - 600) / 2), height - 100);
  }

  private update(dt: number) {
    if (this.lineIndex < 0) this.move(dt);
    this.handleInteract();
    input.endFrame();
  }

  private move(dt: number) {
    const dx = (input.isDown('ArrowRight', 'KeyD') ? 1 : 0) - (input.isDown('ArrowLeft', 'KeyA') ? 1 : 0);
    const dy = (input.isDown('ArrowDown', 'KeyS') ? 1 : 0) - (input.isDown('ArrowUp', 'KeyW') ? 1 : 0);
    if (!dx && !dy) return;
    const len = Math.hypot(dx, dy);
    const step = SPEED * dt;
    // Resolve axes separately so the player slides along walls.
    this.tryMove((dx / len) * step, 0);
    this.tryMove(0, (dy / len) * step);
  }

  private tryMove(mx: number, my: number) {
    const nx = this.player.x + mx;
    const ny = this.player.y + my;
    const half = 10;
    for (const [cx, cy] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
      if (BLOCKED.has(tileAt(Math.floor((nx + cx) / TILE), Math.floor((ny + cy) / TILE)))) return;
    }
    this.player.position.set(nx, ny);
  }

  private handleInteract() {
    if (!input.wasPressed('Space', 'Enter', 'KeyE')) return;
    if (this.lineIndex >= 0) {
      this.lineIndex++;
      if (this.lineIndex >= NPC_LINES.length) {
        this.lineIndex = -1;
        this.dialogBox.visible = false;
      } else {
        this.dialogText.text = NPC_LINES[this.lineIndex];
      }
    } else if (Math.hypot(this.player.x - this.npc.x, this.player.y - this.npc.y) < TILE * 1.5) {
      this.lineIndex = 0;
      this.dialogText.text = NPC_LINES[0];
      this.dialogBox.visible = true;
    }
  }
}
