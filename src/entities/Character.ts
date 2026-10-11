import { BitmapText, Container, Graphics, Sprite, type DestroyOptions, type Texture } from 'pixi.js';
import { type Direction } from '../core/direction';
import { makeFrame } from '../core/textures';
import { ANIMS, ANIM_NAMES, feetAnchor, frameRect, type AnimName } from '../sprites/doll';
import { releaseSheet } from '../sprites/Wardrobe';

const DIRECTIONS: Direction[] = ['up', 'left', 'down', 'right'];

type FrameSet = Record<AnimName, Record<Direction, Texture[]>>;
const frameCache = new WeakMap<Texture, FrameSet>();

/** Every frame of a composed character sheet (see sprites/doll.ts), cut once per sheet and shared by its users. */
function framesOf(sheet: Texture): FrameSet {
  let set = frameCache.get(sheet);
  if (set) return set;
  set = {} as FrameSet;
  for (const anim of ANIM_NAMES) {
    const byDir = {} as Record<Direction, Texture[]>;
    for (const dir of DIRECTIONS) {
      byDir[dir] = Array.from({ length: ANIMS[anim].cols }, (_, col) => {
        const r = frameRect(anim, dir, col);
        const frame = makeFrame(sheet, r.x, r.y, r.w, r.h);
        if (!frame) throw new Error(`Character sheet is too small for ${anim} frame ${col}`);
        return frame;
      });
    }
    set[anim] = byDir;
  }
  frameCache.set(sheet, set);
  return set;
}

/**
 * An animated character (the hero, NPCs, mobs), drawn from a composed paper-doll sheet. The container's position
 * is the point between the feet, so it can be used directly for collision and depth sorting. Looping animations
 * (idle, walk) follow `animate(dt, moving)`; one-shot actions (slash, cast, hurt) are started with `play()` and
 * take over until they finish.
 *
 * It owns the reference on its sheet that `Wardrobe.sheet` took: it gives it back when it swaps sheets or is destroyed.
 */
export class Character extends Container {
  private sheet: Texture;
  private frames: FrameSet;
  private shownAnim: AnimName = 'idle'; // the frame on screen, so a new sheet can show the same one at once
  private shownCol = 0;
  private sprite: Sprite;
  private aura = new Graphics();
  private direction: Direction = 'down';
  private loopTime = 0;
  private loopAnim: AnimName = 'idle';
  private action: { anim: AnimName; time: number; ms: number } | null = null;
  private auraTime = 0;
  private auraColor = 0x4de3ff;
  private tag: BitmapText | null = null;

  /** `aura` adds the hero's pulsing time-ring; everyone else just gets a plain shadow. */
  constructor(
    sheet: Texture,
    private withAura = false,
  ) {
    super();
    this.sheet = sheet;
    this.frames = framesOf(sheet);
    this.sprite = new Sprite(this.frame('idle', 0));
    this.sprite.anchor.set(0.5, feetAnchor('idle'));
    this.addChild(this.aura, this.sprite);
    this.drawAura(0);
  }

  /** Swap the whole look (equipment changed): the same pose continues on the new sheet. */
  setSheet(sheet: Texture) {
    const old = this.sheet;
    this.sheet = sheet;
    this.frames = framesOf(sheet);
    this.sprite.texture = this.frame(this.shownAnim, this.shownCol); // off the old sheet now: it may be freed
    releaseSheet(old);
  }

  override destroy(options?: DestroyOptions) {
    releaseSheet(this.sheet);
    super.destroy(options);
  }

  face(direction: Direction) {
    this.direction = direction;
  }

  get facing(): Direction {
    return this.direction;
  }

  /** Colour the body (not the shadow), e.g. to flash on a hit. 0xffffff is untinted. */
  setTint(color: number) {
    this.sprite.tint = color;
  }

  /** Nudge the body off its feet point, e.g. to lunge into an attack. */
  setOffset(dx: number, dy: number) {
    this.sprite.position.set(dx, dy);
  }

  /**
   * Play a one-shot animation (slash, cast, hurt), stretched to `ms` if given. It replaces idle/walk until it ends;
   * starting another action restarts from its first frame.
   */
  play(anim: AnimName, ms?: number) {
    this.action = { anim, time: 0, ms: ms ?? ANIMS[anim].cycle.length * ANIMS[anim].ms };
  }

  /** Is a one-shot animation still playing? */
  get acting(): boolean {
    return this.action !== null;
  }

  /** Advance animation; `moving` selects the walk cycle over the idle one when no action is playing. */
  animate(dtMs: number, moving: boolean) {
    this.auraTime += dtMs;
    if (this.withAura) this.drawAura(this.auraTime);
    const { anim, col } = this.pose(dtMs, moving);
    this.shownAnim = anim;
    this.shownCol = col;
    this.sprite.texture = this.frame(anim, col);
    this.sprite.anchor.y = feetAnchor(anim); // 128px swing frames have their feet lower in the cell
  }

  private pose(dtMs: number, moving: boolean): { anim: AnimName; col: number } {
    const act = this.action;
    if (act) {
      act.time += dtMs;
      const { cycle } = ANIMS[act.anim];
      const step = Math.floor((act.time / act.ms) * cycle.length);
      if (step < cycle.length) return { anim: act.anim, col: cycle[step] ?? 0 };
      this.action = null;
    }
    const anim: AnimName = moving ? 'walk' : 'idle';
    const { cycle, ms } = ANIMS[anim];
    // Switching between idle and walk restarts the cycle, so a step always begins on the same foot.
    if (anim !== this.loopAnim) this.loopTime = 0;
    this.loopAnim = anim;
    this.loopTime += dtMs;
    return { anim, col: cycle[Math.floor(this.loopTime / ms) % cycle.length] ?? 0 };
  }

  private frame(anim: AnimName, col: number): Texture {
    const texture = this.frames[anim][this.direction][col];
    if (!texture) throw new Error(`Missing character frame ${anim}/${this.direction}/${col}`);
    return texture;
  }

  /** Shadow, plus (for the hero) a pulsing ring of time-energy underfoot. */
  /** The colour of the pulsing ring (a different one per player in co-op). */
  setAuraColor(color: number) {
    this.auraColor = color;
    this.drawAura(this.auraTime);
  }

  /**
   * A small coloured label over the head ("P2"), so players can tell each other apart. Null removes it. The label
   * uses the 'FloatText' bitmap font installed in main.ts.
   */
  setTag(text: string | null, color = 0xffffff) {
    if (text === null) {
      this.tag?.destroy();
      this.tag = null;
      return;
    }
    if (!this.tag) {
      this.tag = new BitmapText({ text, anchor: 0.5, style: { fontFamily: 'FloatText', fontSize: 8 } });
      this.tag.position.set(0, -68);
      this.addChild(this.tag);
    }
    this.tag.text = text;
    this.tag.tint = color;
  }

  private drawAura(timeMs: number) {
    const pulse = (Math.sin(timeMs / 400) + 1) / 2;
    this.aura.clear().ellipse(0, 0, 10, 4).fill({ color: 0x000000, alpha: 0.35 });
    if (!this.withAura) return;
    this.aura
      .ellipse(0, 0, 13 + pulse * 3, 5 + pulse * 1.5)
      .stroke({ color: this.auraColor, alpha: 0.15 + pulse * 0.35, width: 1 });
  }
}
