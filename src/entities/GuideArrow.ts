import { BitmapText, Container, Graphics } from 'pixi.js';
import { newCaption, stepCaption } from '../systems/hudRules';

const RING = 64; // px from the hero (screen space) to the arrow
const ARRIVED = 130; // px: this close to the target the arrow goes away (you are there)
const CAPTION_ABOVE = 90; // px above the hero's chest: over the head, clear of the feet and the swing
const CAPTION_TOP = 100; // but never higher than this (under the HUD's buttons)
const EDGE = 8; // px kept clear at the screen's sides
const RESERVE = 60; // px kept clear on the right of a narrow screen (the quick-slot column)
const NARROW = 600;
const TURN = 10; // how fast the arrow swings round to a new heading (per second)

/**
 * The arrow for a known place (a person, or the door that leads towards the quest's area), drawn over the world in screen
 * pixels: a gold arrow on a ring round the hero, with the name of where it leads. Things to be *found* get no arrow: they
 * are an area on the map instead (systems/guide.ts). The scene gives it the hero's and the target's screen positions every
 * frame; the arrow swings smoothly rather than jumping, and stays steady (no bobbing) so it never reads as a glitch.
 * It is quiet: arrow and caption fade in only while the hero stands still (about a second) or for a few seconds when the
 * target is new, fade out when they move, and give way to a name label the caption would cover (`stepCaption`,
 * systems/hudRules.ts). The edge compass for partners is a separate thing (hud/PartnerArrows.ts).
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
  private readonly shown = newCaption(); // when the caption is wanted (see stepCaption)

  constructor() {
    super();
    this.caption.scale.set(1.6);
    this.caption.tint = 0xffe9a8;
    this.addChild(this.arrow, this.caption);
    this.visible = false;
  }

  /**
   * Point from `hero` at `target` (both screen px), or hide when there is nothing to point at or you are there. `id` names
   * the target without its direction (a new one shows the caption again), `moved` is whether the hero walked this frame,
   * `avoid` the screen boxes of name labels (centre and half size) the caption must not cover.
   */
  update(
    dt: number,
    hero: { x: number; y: number },
    target: { x: number; y: number } | null,
    label: string,
    screen: { width: number; height: number },
    id = label,
    moved = false,
    avoid: readonly { x: number; y: number; hw: number; hh: number }[] = [],
  ) {
    const dx = target ? target.x - hero.x : 0;
    const dy = target ? target.y - hero.y : 0;
    const dist = Math.hypot(dx, dy);
    const there = target !== null && dist > ARRIVED;
    if (!there) {
      stepCaption(this.shown, dt, moved, target ? id : '', false);
      this.visible = false;
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
    // Not by the arrow (under the hero's feet it covers the swing, and near an edge it is clipped): a line above the
    // hero's head, centred, kept inside the screen and shrunk to fit a narrow one.
    const right = screen.width < NARROW ? RESERVE : EDGE;
    const room = Math.max(1, screen.width - EDGE - right);
    this.caption.scale.set(1.6);
    if (this.caption.width > room) this.caption.scale.set((1.6 * room) / this.caption.width);
    const half = this.caption.width / 2;
    const cx = Math.min(Math.max(screen.width / 2, EDGE + half), screen.width - right - half);
    const cy = Math.round(Math.max(CAPTION_TOP, hero.y - CAPTION_ABOVE));
    this.caption.position.set(Math.round(cx), cy);
    const hh = this.caption.height / 2;
    const blocked = avoid.some((a) => Math.abs(a.x - cx) < a.hw + half && Math.abs(a.y - cy) < a.hh + hh);
    stepCaption(this.shown, dt, moved, id, blocked);
    this.alpha = this.shown.alpha;
    this.visible = this.alpha > 0;
  }
}
