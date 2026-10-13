import type { Plot } from '../../entities/Plot';
import type { Player } from '../../entities/Player';
import { CELL } from '../../map/types';
import { harvest, plant, rain as waterFromRain, RIPE, seedInPack, water } from '../../systems/crops';
import { hasCan } from '../../systems/water';
import type { Arena } from './Arena';
import { PLOT_REACH } from './constants';
import type { Simulation } from './Simulation';

/**
 * Plots of crops (systems/crops.ts has the rules, entities/Plot.ts draws one). Host and solo: `update` keeps every plot of
 * the zone being worked in showing what it holds now, and `tend` is what the action key does beside one: pick a ripe
 * plant or plant a seed in bare soil. A guest does neither: the host's snapshot lists every plot (`SnapMsg.plots`) and
 * the guest's action press is the host's `tend` for that friend's own hero, so the harvest lands in their pack.
 */
export class Farming {
  constructor(
    private arena: Arena,
    private sim: Pick<Simulation, 'text' | 'fx'>,
  ) {}

  /** Tend the plots of the zone being worked in: rain waters them, and each one catches up on the time it was wet. */
  update() {
    const { clock, zone } = this.arena;
    const rain =
      zone.weather !== null &&
      (zone.weather.precip === 'rain' || zone.weather.precip === 'storm') &&
      zone.weather.intensity > 0.3;
    for (const plot of this.arena.plots) {
      if (rain) waterFromRain(plot.state, clock);
      plot.tend(clock);
    }
  }

  /**
   * The plot beside the hero that the action key would do something to, and what: pick a ripe plant, plant a seed in bare
   * soil, or water a dry plant (with a can). Read from what the plot shows, so a guest works it out too.
   */
  private nearby(p: Player): { plot: Plot; job: 'harvest' | 'plant' | 'water' } | null {
    let best: { plot: Plot; job: 'harvest' | 'plant' | 'water' } | null = null;
    let bestDist = PLOT_REACH;
    for (const plot of this.arena.plots) {
      const dist = Math.hypot(p.body.x - plot.x, p.body.y - (plot.y - CELL / 2));
      if (dist >= bestDist) continue;
      const job = !plot.crop
        ? seedInPack(p.hero)
          ? 'plant'
          : null
        : plot.stage >= RIPE
          ? 'harvest'
          : !plot.wet && hasCan(p.hero)
            ? 'water'
            : null;
      if (job) [best, bestDist] = [{ plot, job }, dist];
    }
    return best;
  }

  /** The label of the button to show beside a plot ("Harvest", "Plant", "Water"), or null (host, solo and guest alike). */
  prompt(p: Player): string | null {
    const near = this.nearby(p);
    return near ? { harvest: 'Harvest', plant: 'Plant', water: 'Water' }[near.job] : null;
  }

  /** The action key beside a plot (host and solo). Returns true when it did something, so the hero does not swing. */
  tend(p: Player): boolean {
    const { clock } = this.arena;
    const near = this.nearby(p);
    if (!near) return false;
    const { plot, job } = near;
    const [x, y] = [plot.x, plot.y - CELL];
    const done =
      job === 'plant'
        ? plant(p.hero, plot.state, clock)
        : job === 'harvest'
          ? harvest(p.hero, plot.state, clock)
          : water(p.hero, plot.state, clock);
    plot.tend(clock);
    if (!done.text) return true;
    if (job === 'harvest' && done.ok) this.sim.fx('levelUp', x, y + 10); // a little sparkle for the harvest
    this.sim.text(x, y - 6, done.text, done.ok ? (job === 'water' ? 0x7ec8ff : 0xa8e05a) : 0xff8a7a);
    return true;
  }
}
