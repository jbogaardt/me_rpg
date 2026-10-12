import { Container, Graphics, Rectangle, Sprite, type Renderer } from 'pixi.js';
import { coverRadius, IRIS_CLOSE, irisAt, rimAlpha, settleAt, TRANSITION_LENGTH } from '../map/transition';

const BACKGROUND = 0x000000; // the app's clear colour (main.ts): outside a zone is black

interface Point {
  x: number;
  y: number;
}

/** How the live world is to be pushed this frame: scaled by `scale` about the hero and slid by (x, y) screen px. */
export interface Punch {
  scale: number;
  x: number;
  y: number;
}

const NONE: Readonly<Punch> = { scale: 1, x: 0, y: 0 };

/**
 * What the screen does when the local player goes through any door (the look and timing are map/transition.ts). The
 * scene has already moved the player when it calls `begin`, so the old view is kept as a still picture of the stage,
 * taken just before the swap, and drawn over the live new zone: a black screen with a round hole closes on the hero in
 * the still picture, stays shut a moment (or as long as `hold` says, while the next zone loads), then opens around the
 * hero in the live zone, which `update` returns a `Punch` for (it settles in from a closer shot). The edge of the
 * circle glows in the colour of the zone being entered. `view` is screen space and goes above the world.
 */
export class ZoneTransition {
  readonly view = new Container();
  private shade = new Graphics();
  private shot: Sprite | null = null;
  private tint = 0xffffff;
  private t = 0;
  private active = false;
  private held = false;
  private centre: Point = { x: 0, y: 0 }; // the hero on the old view (screen px): where it closes, where it rushes in on

  constructor(private renderer: Renderer) {
    this.shade.visible = false;
    this.view.addChild(this.shade);
  }

  /** Is a transition playing? The local player stands still meanwhile. */
  get busy(): boolean {
    return this.active;
  }

  /**
   * Start a transition. `stage` is pictured as the old view (`null`: nothing has moved yet, so close on the live one).
   * `centre` is the hero on screen and `tint` the colour of the circle's rim.
   */
  begin(stage: Container | null, screen: { width: number; height: number }, centre: Point, tint = 0xffffff) {
    this.finish();
    this.tint = tint;
    this.centre = { ...centre };
    this.t = 0;
    this.active = true;
    if (!stage) return;
    const texture = this.renderer.generateTexture({
      target: stage,
      frame: new Rectangle(0, 0, Math.max(1, screen.width), Math.max(1, screen.height)),
      clearColor: BACKGROUND,
    });
    this.shot = new Sprite(texture);
    this.view.addChildAt(this.shot, 0);
  }

  /** Keep the iris shut (the next zone is still loading), or let it open. */
  hold(on: boolean) {
    this.held = on;
    if (!on) this.t = Math.min(this.t, IRIS_CLOSE); // from shut: the dark beat, then open
  }

  get holding(): boolean {
    return this.active && this.held;
  }

  /**
   * Advance by `dt` seconds. `centre` is the hero on screen now (the iris opens round them). Returns how to push the
   * live world this frame (nothing but during a warp).
   */
  update(dt: number, screen: { width: number; height: number }, centre: Point): Readonly<Punch> {
    if (!this.active) return NONE;
    this.t += dt;
    const { width: w, height: h } = screen;
    const { open, closing } = irisAt(this.t, this.held);
    if (!closing) this.dropShot();
    const c = closing ? this.centre : centre;
    const cover = coverRadius(c.x, c.y, w, h);
    const r = open * cover;
    // The black is a ring from the circle's edge out past the farthest corner (a stroke), not a rectangle with a hole
    // cut in it: a hole that crosses the rectangle's edge (a circle larger than the screen, as at the start of the
    // close and the end of the open) is not drawn as the shape it should be and flashes the whole screen black.
    this.shade.clear();
    if (r < 0.5) this.shade.rect(0, 0, w, h).fill(0x000000);
    else if (r < cover) {
      this.shade.circle(c.x, c.y, r + cover / 2).stroke({ width: cover, color: 0x000000 });
      this.shade.circle(c.x, c.y, r).stroke({ width: 5, color: this.tint, alpha: rimAlpha(open) });
    }
    this.shade.visible = r < cover;
    if (!this.held && this.t >= TRANSITION_LENGTH) {
      this.finish();
      return NONE;
    }
    return { scale: settleAt(this.t, this.held), x: 0, y: 0 };
  }

  private dropShot() {
    if (!this.shot) return;
    this.shot.destroy({ texture: true, textureSource: true });
    this.shot = null;
  }

  private finish() {
    this.dropShot();
    this.shade.visible = false;
    this.active = false;
    this.held = false;
  }
}
