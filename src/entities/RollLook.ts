import { particleEffect } from './ParticleEffect';
import { afterimage, type Effects } from './effects';
import type { Character } from './Character';
import { playGame } from '../hud/gameSfx';
import { ROLL_COOLDOWN, ROLL_TIME, cooldownShare, rollPose } from '../systems/roll';

/** Seconds between the afterimages left behind (a roll of 0.22 s leaves three or four, each gone in 0.28 s). */
const GHOST_EVERY = 0.06;
/** How long the ring flares when the roll is ready again. */
const FLARE_S = 0.22;

/**
 * What a roll looks like on one body (cosmetic, local to every page; entities layer). It is driven by one fact, "this
 * player is rolling" (the host's `Player.roll`, a guest's `FLAG.roll`), and keeps its own clock from the moment that turns
 * true: a squash and a full turn of the existing sprite, a few fading afterimages, a puff of dust and a whoosh at the start
 * and a puff at the landing, then the cooldown ON THE HERO: the ring under the feet goes dim and tight and flares back to
 * full when the next roll is ready (and the hero's body glows once for the local player). No text, no number, nothing
 * allocated per frame (the afterimages are a few short-lived sprites, three or four per roll at most, 0.6 s apart).
 */
export class RollLook {
  private t = -1; // seconds since the roll began, -1 when not rolling
  private cooldown = 0; // seconds of cooldown left by this clock
  private ghost = 0;
  private flare = 0;
  private last: { x: number; y: number } | null = null;
  private dir = { x: 0, y: 1 };

  /** Seconds since this roll began (0 when none), for the tests and the camera. */
  get since(): number {
    return Math.max(0, this.t);
  }

  /**
   * One frame. `rolling` is the fact above; `local` is this machine's own hero (only it flashes when ready, and only it
   * gets the screen's own sounds, so a crowd of friends rolling is not a wall of whooshes).
   */
  step(body: Character, rolling: boolean, local: boolean, dt: number, effects: Effects) {
    const moved = this.last ? { x: body.x - this.last.x, y: body.y - this.last.y } : { x: 0, y: 0 };
    this.last = { x: body.x, y: body.y };
    if (rolling && this.t < 0) {
      this.t = 0;
      this.cooldown = ROLL_COOLDOWN;
      this.ghost = 0;
      effects.add(particleEffect('rollDust', body.x, body.y - 2));
      playGame('roll');
    } else if (!rolling && this.t >= 0) {
      this.t = -1;
      body.setSquash(1, 1);
      body.setTumble(0, 0);
      effects.add(particleEffect('rollDust', body.x, body.y - 2));
    }
    const cooling = this.cooldown > 0;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.t >= 0) {
      this.t += dt;
      const len = Math.hypot(moved.x, moved.y);
      if (len > 0.5) this.dir = { x: moved.x / len, y: moved.y / len };
      const pose = rollPose(Math.min(this.t, ROLL_TIME));
      body.setSquash(pose.sx, pose.sy);
      body.setTumble(pose.spin * (this.dir.x < 0 ? -1 : 1), pose.lift);
      this.ghost -= dt;
      if (this.ghost <= 0) {
        this.ghost = GHOST_EVERY;
        effects.add(afterimage(body.snapshot(), body.x, body.y, -this.dir.x, -this.dir.y));
      }
    }
    // The cooldown on the hero: a dim, tight ring that comes back as it runs out, and one flare when it is ready.
    if (cooling && this.cooldown === 0) {
      this.flare = FLARE_S;
      if (local) body.glow(0xbfe3ff, 160);
    }
    const share = cooldownShare(this.cooldown);
    this.flare = Math.max(0, this.flare - dt);
    body.setRing(1 - share, this.flare / FLARE_S);
  }
}
