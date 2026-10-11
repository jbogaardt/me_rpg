import { Container, Graphics, Rectangle, Sprite, type Renderer } from 'pixi.js';
import type { Direction } from '../core/direction';
import { coverRadius, IRIS_CLOSE, irisAt, slideAt, transitionLength, type TransitionKind } from '../map/transition';

const BACKGROUND = 0x1a1a2e; // the app's clear colour (main.ts), behind a map smaller than the screen

interface Point {
  x: number;
  y: number;
}

const STILL: Readonly<Point> = { x: 0, y: 0 };

/**
 * What the screen does when the local player goes through a door (the timing is map/transition.ts). The scene has
 * already moved the player when it calls `begin`, so the old view is kept as a still picture of the stage, taken just
 * before the swap, and drawn over the live new zone:
 *  - iris: a black screen with a round hole closes on the hero in the still picture, stays shut a moment (or as long
 *    as `hold` says, while the next zone loads), then opens around the hero in the live zone;
 *  - slide: the still picture slides off toward `dir` while the live zone, shifted by what `update` returns, slides in
 *    behind it, a screen apart.
 * `view` is screen space and goes above the world.
 */
export class ZoneTransition {
  readonly view = new Container();
  private shade = new Graphics();
  private shot: Sprite | null = null;
  private kind: TransitionKind = 'iris';
  private dir: Direction = 'down';
  private t = 0;
  private active = false;
  private held = false;
  private centre: Point = { x: 0, y: 0 }; // where the iris closes, on the old view (screen px)

  constructor(private renderer: Renderer) {
    this.shade.visible = false;
    this.view.addChild(this.shade);
  }

  /** Is a transition playing? The local player stands still meanwhile. */
  get busy(): boolean {
    return this.active;
  }

  /**
   * Start a transition. `stage` is pictured as the old view (`null`: nothing has moved yet, so close on the live one);
   * `hide` is left out of that picture (in a slide: the hero, who slides in with the new zone, and the weather, which
   * stays on the screen). `centre` is the hero on screen.
   */
  begin(
    kind: TransitionKind,
    dir: Direction,
    stage: Container | null,
    screen: { width: number; height: number },
    centre: Point,
    hide: Container[] = [],
  ) {
    this.finish();
    this.kind = kind;
    this.dir = dir;
    this.centre = { ...centre };
    this.t = 0;
    this.active = true;
    if (!stage) return;
    const shown = hide.map((c) => c.visible);
    for (const c of hide) c.visible = false;
    const texture = this.renderer.generateTexture({
      target: stage,
      frame: new Rectangle(0, 0, Math.max(1, screen.width), Math.max(1, screen.height)),
      clearColor: BACKGROUND,
    });
    hide.forEach((c, i) => (c.visible = shown[i] ?? true));
    this.shot = new Sprite(texture);
    this.view.addChildAt(this.shot, 0);
  }

  /** Keep the iris shut (the next zone is still loading), or let it open. */
  hold(on: boolean) {
    this.held = on;
    if (!on && this.kind === 'iris') this.t = Math.min(this.t, IRIS_CLOSE); // from shut: the dark beat, then open
  }

  get holding(): boolean {
    return this.active && this.held;
  }

  /**
   * Advance by `dt` seconds. `centre` is the hero on screen now (the iris opens around them). Returns how far to
   * shift the live world this frame (screen px; zero except during a slide).
   */
  update(dt: number, screen: { width: number; height: number }, centre: Point): Readonly<Point> {
    if (!this.active) return STILL;
    this.t += dt;
    const { width: w, height: h } = screen;
    if (this.kind === 'slide') {
      const { old, fresh } = slideAt(this.t, this.dir, w, h);
      this.shot?.position.set(old.x, old.y);
      if (this.t >= transitionLength('slide')) {
        this.finish();
        return STILL;
      }
      return fresh;
    }

    const { open, closing } = irisAt(this.t, this.held);
    if (!closing) this.dropShot();
    const c = closing ? this.centre : centre;
    const r = open * coverRadius(c.x, c.y, w, h);
    this.shade.clear().rect(0, 0, w, h).fill(0x000000);
    if (r > 0.5) this.shade.circle(c.x, c.y, r).cut();
    this.shade.visible = true;
    if (!this.held && this.t >= transitionLength('iris')) this.finish();
    return STILL;
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
