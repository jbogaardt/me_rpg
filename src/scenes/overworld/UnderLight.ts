import type { ViewRect } from '../../core/camera';
import type { DarknessLayer } from '../../entities/DarknessLayer';
import type { LightGlow } from '../../entities/LightGlow';
import { CELL } from '../../map/types';
import { enabled, flag, setting } from '../../systems/capabilities';
import type { Light } from '../../systems/lights';
import type { Arena } from './Arena';
import type { ZoneState } from '../ZoneState';

/**
 * The light of the place the local player is in, drawn each frame: the underground's fog of war and the warm glow of
 * fires, torches and carried lamps (`DarknessLayer`, `LightGlow`; `docs/effects.md`). Visual only: it reads the zone's own
 * map, the lights its hearths give and where the lit heroes stand (the same on every page), so nothing goes on the wire.
 */
export class UnderLight {
  /** Who carries a light underground; one array reused every frame. */
  private heroes: { x: number; y: number }[] = [];

  constructor(
    private dark: DarknessLayer,
    private glow: LightGlow,
  ) {}

  /** `glowAbove`: how strongly fires glow in the open air (0 by day); the underground always glows fully. */
  update(arena: Arena, z: ZoneState, view: ViewRect, lights: readonly Light[], glowAbove: number) {
    const { width, height } = arena.screen;
    const underground = z.data.dark && enabled('darkness', z.name);
    const heroes = this.heroes;
    heroes.length = 0;
    if (underground) for (const p of arena.players()) if (!p.dm && p.body.visible) heroes.push(p.body);
    const radius = underground ? setting('darkness', 'radius', z.name) : 0;
    this.glow.update(
      lights,
      view,
      underground ? 1 : glowAbove,
      width,
      height,
      underground ? { heroes, reach: radius * CELL, time: arena.clock } : undefined,
    );
    this.dark.update(
      underground
        ? {
            zone: z.name,
            data: z.data,
            view,
            heroes,
            radius,
            lights,
            dim: setting('darkness', 'dim', z.name),
            memory: flag('darkness', 'memory', z.name),
            time: arena.clock,
          }
        : null,
      width,
      height,
    );
  }
}
