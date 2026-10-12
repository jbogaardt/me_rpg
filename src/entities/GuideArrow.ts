import { BitmapText, Container, Graphics } from 'pixi.js';

const RING = 64; // px from the hero (screen space) to the arrow
const ARRIVED = 130; // px: this close to the target the arrow goes away (you are there)
const TURN = 10; // how fast the arrow swings round to a new heading (per second)

/**
 * The arrow for a known place (a person, or the door that leads towards the quest's area), drawn over the world in screen
 * pixels: a gold arrow on a ring round the hero, with the name of where it leads. Things to be *found* get no arrow: they
 * are an area on the map instead (systems/guide.ts). The scene gives it the hero's and the target's screen positions every
 * frame; the arrow swings smoothly rather than jumping, and stays steady (no bobbing) so it never reads as a glitch.
 */
export class GuideArrow extends Container {
  private readonly arrow = new Graphics()
    .poly([13, 0, -7, -9, -3, 0, -7, 9])
    .fill(0xffd34d)
    .stroke({ color: 0x3a2400, width: 2 });
  private readonly caption = new BitmapText({ text: '', anchor: 0.5, style: { fontFamily: 'FloatText', fontSize: 8 } });
  private ux = 1; // the heading the arrow shows (a unit vector)
  private uy = 0;
  private fresh = true; // the next heading is taken at once (no swing from wherever it was)

  constructor() {
    super();
    this.caption.scale.set(1.6);
    this.caption.tint = 0xffe9a8;
    this.addChild(this.arrow, this.caption);
    this.visible = false;
  }

  /** Point from `hero` at `target` (both screen px), or hide when there is nothing to point at or you are there. */
  update(dt: number, hero: { x: number; y: number }, target: { x: number; y: number } | null, label: string) {
    const dx = target ? target.x - hero.x : 0;
    const dy = target ? target.y - hero.y : 0;
    const dist = Math.hypot(dx, dy);
    this.visible = target !== null && dist > ARRIVED;
    if (!this.visible) {
      this.fresh = true;
      return;
    }
    const [tx, ty] = [dx / dist, dy / dist];
    if (this.fresh) [this.ux, this.uy, this.fresh] = [tx, ty, false];
    else {
      const k = Math.min(1, TURN * dt);
      const [nx, ny] = [this.ux + (tx - this.ux) * k, this.uy + (ty - this.uy) * k];
      const len = Math.hypot(nx, ny) || 1;
      [this.ux, this.uy] = [nx / len, ny / len];
    }
    this.arrow.position.set(Math.round(hero.x + this.ux * RING), Math.round(hero.y + this.uy * RING));
    this.arrow.rotation = Math.atan2(this.uy, this.ux);
    this.caption.text = label;
    this.caption.position.set(Math.round(hero.x + this.ux * (RING + 24)), Math.round(hero.y + this.uy * (RING + 24)));
  }
}
