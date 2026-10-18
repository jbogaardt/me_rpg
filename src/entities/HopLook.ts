import { particleEffect } from './ParticleEffect';
import type { Effects } from './effects';
import type { Character } from './Character';
import { playGame } from '../hud/gameSfx';
import { HOP_TIME, hopLift, hopSquash } from '../systems/ledgeDrop';

/**
 * What a ledge drop looks like on one body (cosmetic, local to every page; entities layer). Driven by one fact, "this
 * player is hopping" (the host's `Player.hop`, a guest's `FLAG.hop`), with its own clock from the moment it turns true: the
 * body lifts in an arc and stretches a little, and at the landing squashes flat and recovers, with two small puffs of dust
 * and a thud (the thud only for this screen's own hero). Nothing is allocated per frame; two small puffs per drop.
 */
export class HopLook {
  private t = -1; // seconds since take-off, -1 when not hopping
  private since = -1; // seconds since landing, -1 until it lands

  step(body: Character, hopping: boolean, local: boolean, dt: number, effects: Effects) {
    if (hopping && this.t < 0) {
      this.t = 0;
      this.since = -1;
    } else if (!hopping && this.t >= 0) {
      this.t = -1;
      this.since = 0;
      body.setTumble(0, 0);
      effects.add(particleEffect('dust', body.x - 5, body.y - 1));
      effects.add(particleEffect('dust', body.x + 5, body.y - 1));
      if (local) playGame('land');
    }
    if (this.t >= 0) {
      this.t += dt;
      body.setTumble(0, hopLift(Math.min(this.t, HOP_TIME)));
      const q = hopSquash(this.t, -1);
      body.setSquash(q.sx, q.sy);
    } else if (this.since >= 0) {
      this.since += dt;
      const q = hopSquash(0, this.since);
      body.setSquash(q.sx, q.sy);
      if (q.sx === 1 && q.sy === 1) this.since = -1;
    }
  }
}
