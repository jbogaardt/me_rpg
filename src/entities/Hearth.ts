import { findHearths, hearthNear, HEARTH_EFFECTS, NIGHT_ONLY, type HearthSource } from '../systems/hearths';
import type { MapData } from '../map/types';
import type { ViewRect } from '../core/camera';
import { flickerSeed, visibleLights, type Light } from '../systems/lights';
import type { Effects } from './effects';
import { particleEffect, type ParticleEffect } from './ParticleEffect';

/**
 * The smoke of fires and torches, the bubbles of lava, drips in caves and fireflies at night: continuous particle
 * effects that run only for the sources near the screen (`systems/hearths.ts` finds them in the map). One lives as long
 * as its source is near, and is told to stop (it then fades out) when it scrolls away, so a big lava lake costs only
 * what is on screen. Visual only, built from the map alone, so a co-op guest needs nothing from the host.
 */
export class Hearth {
  private atSources: HearthSource[];
  private seeds: number[];
  /** The reused light objects `lights` fills each frame (no allocation per frame). */
  private pool: Light[] = [];
  private sources: { at: HearthSource; running: ParticleEffect[] }[];

  constructor(
    private effects: Effects,
    data: MapData,
  ) {
    this.sources = findHearths(data).map((at) => ({ at, running: [] }));
    this.atSources = this.sources.map((s) => s.at);
    this.seeds = this.atSources.map((a) => flickerSeed(a.x, a.y));
  }

  /** Start the sources that have come near `view`, stop the ones that left; `night` wakes the fireflies. */
  /** The pools of light the map's fires, torches and lava give on the screen now (for the underground's dark). */
  lights(view: ViewRect, time: number): Light[] {
    return visibleLights(this.atSources, view, time, this.pool, this.seeds);
  }

  update(view: ViewRect, night: boolean) {
    for (const s of this.sources) {
      const want = hearthNear(s.at, view) && (night || !NIGHT_ONLY.includes(s.at.kind));
      if (want && s.running.length === 0) {
        for (const name of HEARTH_EFFECTS[s.at.kind]) {
          const fx = particleEffect(name, s.at.x, s.at.y);
          this.effects.add(fx);
          s.running.push(fx);
        }
      } else if (!want && s.running.length > 0) {
        for (const fx of s.running) fx.stop();
        s.running = [];
      }
    }
  }
}
