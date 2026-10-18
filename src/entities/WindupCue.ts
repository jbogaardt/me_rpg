import { Container, Sprite, Texture } from 'pixi.js';
import {
  LOCK_FLASH,
  SPARKS,
  TELL_SHADOW,
  markLook,
  marksShown,
  shadowAlpha,
  shadowScale,
  sparkAt,
} from '../systems/tellLook';

// The pixel-art part of a foe's windup (the maths is systems/tellLook.ts, the body's lean and flush are in Mob.ts): a
// contact shadow under its feet that widens and darkens toward the blow, a short row of ground marks (little pixels, in
// quarter-step alphas) pointing the way the blow or shot will go that appear one by one and flash near-white at the aim
// lock, and a few sparks thrown at that "now" frame. Sprites of two small textures, nearest-sampled and on whole pixels,
// built once per mob and reused: a frame sets numbers and allocates nothing. Drawn from the windup state and timer only,
// so every page draws it (a co-op guest included).

const MAX_MARKS = 6;
/** A fan's lanes show this many marks each (so at most 5 lanes x 3 = 15 sprites, only for a kind that fans; a 3-lane kind has 9). */
const LANE_MARKS = 3;
const SHADOW_W = 28;
const SHADOW_H = 12;

let shadowTex: Texture | null = null;
let dotTex: Texture | null = null;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas is needed to generate the windup cue textures');
  draw(ctx);
  return Texture.from(canvas);
}

/** A pixel ellipse in three flat bands, the outer one dithered: white, tinted by the sprite. No antialiasing, no stroke. */
function shadowTexture(): Texture {
  return (shadowTex ??= canvasTexture(SHADOW_W, SHADOW_H, (ctx) => {
    for (let y = 0; y < SHADOW_H; y++)
      for (let x = 0; x < SHADOW_W; x++) {
        const dx = (x + 0.5 - SHADOW_W / 2) / (SHADOW_W / 2);
        const dy = (y + 0.5 - SHADOW_H / 2) / (SHADOW_H / 2);
        const r = dx * dx + dy * dy;
        const a = r < 0.4 ? 1 : r < 0.75 ? 0.6 : r < 1 && (x + y) % 2 === 0 ? 0.35 : 0;
        if (a === 0) continue;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(x, y, 1, 1);
      }
  }));
}

/** A 6x6 pixel with the corners cut. */
function dotTexture(): Texture {
  return (dotTex ??= canvasTexture(6, 6, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(1, 0, 4, 6);
    ctx.fillRect(0, 1, 6, 4);
  }));
}

/** What a frame of the cue needs (the caller reuses one object). */
export interface CueState {
  progress: number; // 0..1
  elapsed: number; // seconds since the windup began
  len: number; // the windup's length (s)
  lockAt: number; // the progress at which the aim locks
  ux: number; // unit vector of the blow or shot
  uy: number;
  reach: number; // px the blow or shot covers
  scale: number; // the foe's size
  line: boolean; // a shot or ray (a line of marks with a runner) rather than a melee blow
  marks: boolean; // draw the ground marks (the kind's `telegraph.ground`)
  lanes: number; // a fan: how many lanes of marks, spread `laneGap` radians apart round (ux, uy); 0 for a single line
  laneGap: number;
}

export const newCueState = (): CueState => ({
  progress: 0,
  elapsed: 0,
  len: 1,
  lockAt: 0.5,
  ux: 1,
  uy: 0,
  reach: 40,
  scale: 1,
  line: false,
  marks: true,
  lanes: 0,
  laneGap: 0,
});

export class WindupCue {
  /** Under the body: the shadow and the marks. */
  readonly ground = new Container();
  /** Over the body: the lock sparks. */
  readonly air = new Container();
  private shadow = new Sprite(shadowTexture());
  private marks: Sprite[] = [];
  private readonly lanes: number; // marks reserved for a fan's lanes (0 for a kind that never fans)
  private sparks: Sprite[] = [];
  private look = { color: 0, alpha: 0 };
  private spark = { x: 0, y: 0, alpha: 0 };

  /** `fanLanes`: the most lanes a fan of this kind has (0 for a kind that never fans: it gets no extra sprites). */
  constructor(fanLanes = 0) {
    this.lanes = fanLanes;
    this.shadow.anchor.set(0.5);
    this.shadow.tint = TELL_SHADOW;
    this.ground.addChild(this.shadow);
    for (let i = 0; i < Math.max(MAX_MARKS, fanLanes * LANE_MARKS); i++) {
      const m = new Sprite(dotTexture());
      m.anchor.set(0.5);
      this.marks.push(m);
      this.ground.addChild(m);
    }
    for (let i = 0; i < SPARKS; i++) {
      const s = new Sprite(dotTexture());
      s.anchor.set(0.5);
      s.scale.set(0.5);
      this.sparks.push(s);
      this.air.addChild(s);
    }
    this.hide();
  }

  hide() {
    this.ground.visible = false;
    this.air.visible = false;
  }

  update(c: CueState) {
    this.ground.visible = true;
    const since = c.elapsed - c.lockAt * c.len; // negative until the aim locks
    // Contact shadow: wider and darker as the blow nears.
    const sc = shadowScale(c.progress) * c.scale;
    this.shadow.scale.set(sc);
    this.shadow.alpha = shadowAlpha(c.progress);
    // Ground marks toward the blow: a short row (a line attack shows its direction, not its whole range).
    if (c.lanes > 1 && c.lanes <= this.lanes) this.laneMarks(c, since);
    else this.rowMarks(c, since);
    // Sparks at the lock.
    const flash = since >= 0 && since <= 0.2;
    this.air.visible = flash;
    if (flash)
      for (let i = 0; i < SPARKS; i++) {
        const s = this.sparks[i]!;
        const live = sparkAt(this.spark, i, since);
        s.visible = live;
        if (!live) continue;
        s.position.set(
          Math.round(c.ux * 12 * c.scale + this.spark.x),
          Math.round(-18 * c.scale + c.uy * 6 + this.spark.y),
        );
        s.alpha = this.spark.alpha;
        s.tint = since < LOCK_FLASH ? 0xffffff : 0xffd9a0;
      }
  }

  /** The usual row of marks along (ux, uy). */
  private rowMarks(c: CueState, since: number) {
    const n = c.marks ? (c.line ? MAX_MARKS : 4) : 0;
    const shown = c.marks ? marksShown(c.progress, n, c.lockAt) : 0;
    const start = (c.line ? 20 : 16) * c.scale;
    const end = c.line ? start + 12 * (MAX_MARKS - 1) : Math.max(start + 8, c.reach * 0.92);
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i]!;
      if (i >= shown) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      const d = n > 1 ? start + ((end - start) * i) / (n - 1) : start;
      m.position.set(Math.round(c.ux * d), Math.round(c.uy * d * 0.9));
      m.scale.set(!c.line && i === n - 1 ? 1.5 : 1);
      markLook(this.look, i, n, c.progress, since, c.line);
      m.tint = this.look.color;
      m.alpha = this.look.alpha;
    }
  }

  /** A fan: a short row of marks down every lane (the lanes `laneGap` apart round the aim), each step appearing in all lanes at once. */
  private laneMarks(c: CueState, since: number) {
    const shown = c.marks ? marksShown(c.progress, LANE_MARKS, c.lockAt) : 0;
    const aim = Math.atan2(c.uy, c.ux);
    for (let l = 0; l < this.lanes; l++) {
      const a = aim + (l - (c.lanes - 1) / 2) * c.laneGap;
      const [lx, ly] = [Math.cos(a), Math.sin(a)];
      for (let i = 0; i < LANE_MARKS; i++) {
        const m = this.marks[l * LANE_MARKS + i]!;
        if (l >= c.lanes || i >= shown) {
          m.visible = false;
          continue;
        }
        const d = (28 + 26 * i) * c.scale; // 28, 54, 80 px: at 80 px two lanes 30 degrees apart are 41 px apart
        m.visible = true;
        m.position.set(Math.round(lx * d), Math.round(ly * d * 0.9));
        m.scale.set(i === LANE_MARKS - 1 ? 1.25 : 1); // the far mark a little bigger, so a lane reads as pointing out
        markLook(this.look, i, LANE_MARKS, c.progress, since, true);
        m.tint = this.look.color;
        m.alpha = this.look.alpha;
      }
    }
  }
}
