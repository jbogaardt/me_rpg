import { BitmapText, Container, Graphics, Sprite, type DestroyOptions, type Texture } from 'pixi.js';
import { type Direction } from '../core/direction';
import { makeFrame } from '../core/textures';
import { ANIMS, ANIM_NAMES, feetAnchor, frameRect, type AnimName } from '../sprites/doll';
import { releaseSheet } from '../sprites/Wardrobe';
import { washTint } from '../systems/cueRules';

const DIRECTIONS: Direction[] = ['up', 'left', 'down', 'right'];

/** How long a victory pose lasts, the cast frames it rises through (the last is held), and its hop height (px) at a time. */
const CHEER_MS = 1300;
const CHEER_COLS = [1, 2, 3, 4];
const hop = (ms: number) => Math.abs(Math.sin(ms / 110)) * 5 * Math.max(0, 1 - ms / CHEER_MS);

/** A head-shake (a refusal): the body wobbles side to side for this long, at most this many px. */
const SHAKE_MS = 260;
const SHAKE_PX = 2;
/** The glow of a gained level: the body washes to a warm light and back over this long. */
const GLOW_MS = 900;

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
  /** How many times a person's size it is drawn; collision (a `Body`) reads it too. */
  size = 1;
  private sprite: Sprite;
  private aura = new Graphics();
  private direction: Direction = 'down';
  private loopTime = 0;
  private loopAnim: AnimName = 'idle';
  private action: { anim: AnimName; time: number; ms: number } | null = null;
  private held: { anim: AnimName; col: number } | null = null;
  private cheer: { time: number; face: Direction } | null = null;
  private auraTime = 0;
  private auraColor = 0x4de3ff;
  private tag: BitmapText | null = null;
  private baseTint = 0xffffff;
  private strainColor = 0xffffff;
  private strainAmount = 0;
  private glowColor = 0xffe9a0;
  private glowLeft = 0;
  private shakeLeft = 0;
  private offX = 0;

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
    this.baseTint = color;
    this.applyTint();
  }

  /**
   * Wash the body toward `color` by `amount` (0 to 1) to show how the hero is (a red pulse at low health, a sallow wash
   * when starving); the buff tint under it stays. Called each frame by whoever reads the state; 0 clears it.
   */
  setStrain(color: number, amount: number) {
    this.strainColor = color;
    this.strainAmount = amount;
    this.applyTint();
  }

  /** A brief warm glow of the whole body (a level gained): it fades by itself. */
  glow(color = 0xffe9a0, ms = GLOW_MS) {
    this.glowColor = color;
    this.glowLeft = ms;
  }

  /** A head-shake of the body (a refusal): a short side-to-side wobble, then still. */
  shake() {
    this.shakeLeft = SHAKE_MS;
  }

  private applyTint() {
    const glow = this.glowLeft > 0 ? 0.7 * (this.glowLeft / GLOW_MS) : 0;
    const [color, amount] = glow > this.strainAmount ? [this.glowColor, glow] : [this.strainColor, this.strainAmount];
    this.sprite.tint = washTint(this.baseTint, color, amount);
  }

  /** The frame on screen, for an afterimage: its texture, where its feet are in the cell and its size. */
  snapshot(): { texture: Texture; anchorY: number; scale: number } {
    return { texture: this.sprite.texture, anchorY: this.sprite.anchor.y, scale: this.size };
  }

  /** Draw the body bigger or smaller than the usual 64px frame, still standing on the same feet point. */
  setScale(factor: number) {
    this.size = factor;
    this.sprite.scale.set(factor);
  }

  /** Squash or stretch the body about its feet (anticipation): 1, 1 is the usual shape; `setScale` resets it. */
  setSquash(sx: number, sy: number) {
    this.sprite.scale.set(this.size * sx, this.size * sy);
  }

  /** Nudge the body off its feet point, e.g. to lunge into an attack. */
  setOffset(dx: number, dy: number) {
    this.offX = dx;
    this.sprite.position.set(dx + this.shakeX(), dy);
  }

  private shakeX(): number {
    return this.shakeLeft > 0 ? Math.sin(this.shakeLeft / 22) * SHAKE_PX * (this.shakeLeft / SHAKE_MS) : 0;
  }

  /**
   * Play a one-shot animation (slash, cast, hurt), stretched to `ms` if given. It replaces idle/walk until it ends;
   * starting another action restarts from its first frame.
   */
  play(anim: AnimName, ms?: number, elapsedMs = 0) {
    this.action = { anim, time: elapsedMs, ms: ms ?? ANIMS[anim].cycle.length * ANIMS[anim].ms };
  }

  /** Freeze on one frame of an animation (a channelled attack) until `release()`; a one-shot action still plays over it. */
  hold(anim: AnimName, col: number) {
    this.held = { anim, col };
  }

  /** Go back to idle/walk after `hold()`. */
  release() {
    this.held = null;
  }

  /**
   * A victory pose: turn to the viewer, throw the hands up (the spell-cast frames, held at the top) and hop, for
   * `CHEER_MS`; the facing it had comes back after. No art of its own: it is the cast row, held and bounced.
   */
  celebrate() {
    this.cheer = { time: 0, face: this.cheer?.face ?? this.direction };
    this.direction = 'down';
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
    if (this.glowLeft > 0 || this.shakeLeft > 0) {
      this.glowLeft = Math.max(0, this.glowLeft - dtMs);
      this.shakeLeft = Math.max(0, this.shakeLeft - dtMs);
      this.sprite.position.x = this.offX + this.shakeX();
      this.applyTint();
    }
    if (this.cheer) this.sprite.position.y = -hop(this.cheer.time);
    this.shownAnim = anim;
    this.shownCol = col;
    this.sprite.texture = this.frame(anim, col);
    this.sprite.anchor.y = feetAnchor(anim); // 128px swing frames have their feet lower in the cell
  }

  private pose(dtMs: number, moving: boolean): { anim: AnimName; col: number } {
    if (this.cheer) {
      const c = this.cheer;
      c.time += dtMs;
      if (c.time < CHEER_MS && !moving)
        return { anim: 'cast', col: CHEER_COLS[Math.min(CHEER_COLS.length - 1, Math.floor(c.time / 80))] ?? 4 };
      this.direction = c.face;
      this.cheer = null;
      this.sprite.position.y = 0;
    }
    const act = this.action;
    if (act) {
      act.time += dtMs;
      const { cycle } = ANIMS[act.anim];
      const step = Math.floor((act.time / act.ms) * cycle.length);
      if (step < cycle.length) return { anim: act.anim, col: cycle[step] ?? 0 };
      this.action = null;
    }
    if (this.held) return this.held;
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
