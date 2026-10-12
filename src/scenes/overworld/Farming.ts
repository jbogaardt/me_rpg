import type { Player } from '../../entities/Player';
import { CELL } from '../../map/types';
import { harvest, isRipe, plant, seedInPack } from '../../systems/crops';
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

  /** Grow the plots of the zone being worked in (the arena clock is what they count by). */
  update() {
    for (const plot of this.arena.plots) plot.tend(this.arena.clock);
  }

  /** The action key beside a plot (host and solo): returns true when it picked or planted something, so the hero does not swing. */
  tend(p: Player): boolean {
    const { clock } = this.arena;
    const plot = this.arena.plots.find(
      (c) =>
        Math.hypot(p.body.x - c.x, p.body.y - (c.y - CELL / 2)) < PLOT_REACH &&
        (isRipe(c.state, clock) || (!c.state.crop && seedInPack(p.hero))),
    );
    if (!plot) return false;
    const [x, y] = [plot.x, plot.y - CELL];
    const picking = plot.state.crop !== null;
    const done = picking ? harvest(p.hero, plot.state, clock) : plant(p.hero, plot.state, clock);
    plot.tend(clock);
    if (!done.text) return true;
    if (picking && done.ok) this.sim.fx('levelUp', x, y + 10); // a little sparkle for the harvest
    this.sim.text(x, y - 6, done.text, done.ok ? 0xa8e05a : 0xff8a7a);
    return true;
  }
}
