import { BitmapText, Container, Graphics } from 'pixi.js';

const RING = 62; // px from the hero (screen space) to the arrow
const CLOSE = 110; // px: nearer than this to the target the arrow gives way to a bobbing marker over it

/**
 * The quest arrow, drawn over the world in screen pixels: a gold arrow circling the hero that points at where the quest
 * leads (with the name of the area it leads to, if any), and a bobbing marker over the target once it is close. The scene
 * gives it the hero's and the target's screen positions each frame; what to point at is systems/guide.ts.
 */
export class GuideArrow extends Container {
  private readonly arrow = new Graphics()
    .poly([14, 0, -8, -10, -4, 0, -8, 10])
    .fill(0xffd34d)
    .stroke({ color: 0x3a2400, width: 2, alignment: 1 });
  private readonly marker = new Graphics()
    .poly([0, 0, -9, -14, 9, -14])
    .fill(0xffd34d)
    .stroke({ color: 0x3a2400, width: 2, alignment: 1 });
  private readonly caption = new BitmapText({ text: '', anchor: 0.5, style: { fontFamily: 'FloatText', fontSize: 8 } });
  private t = 0;

  constructor() {
    super();
    this.caption.scale.set(1.6);
    this.caption.tint = 0xffe9a8;
    this.addChild(this.arrow, this.marker, this.caption);
    this.visible = false;
  }

  /** Point from `hero` at `target` (both screen px), or hide when there is nothing to point at. */
  update(dt: number, hero: { x: number; y: number }, target: { x: number; y: number } | null, label: string) {
    this.visible = target !== null;
    if (!target) return;
    this.t += dt;
    const dx = target.x - hero.x;
    const dy = target.y - hero.y;
    const dist = Math.hypot(dx, dy);
    const close = dist < CLOSE;
    this.arrow.visible = !close;
    this.marker.visible = close;
    this.caption.text = label;
    if (close) {
      this.marker.position.set(target.x, target.y - 34 + Math.sin(this.t * 6) * 4);
      this.caption.position.set(target.x, target.y - 60);
      return;
    }
    const ux = dx / dist;
    const uy = dy / dist;
    const r = RING + Math.sin(this.t * 6) * 3;
    this.arrow.position.set(hero.x + ux * r, hero.y + uy * r);
    this.arrow.rotation = Math.atan2(uy, ux);
    this.caption.position.set(hero.x + ux * (r + 22), hero.y + uy * (r + 22));
  }
}
