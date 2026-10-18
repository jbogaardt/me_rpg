// How the local hero's body shows how they are (core engine, cosmetic, local; docs/effects.md): a red pulse in step with the
// screen's heartbeat at low health, a sallow or grey-blue wash when hungry or thirsty, and a few dull drops now and then when
// empty. Each page does it for its OWN hero from the HP and meters it already has (a guest's come in `pack` and the stats), so
// nothing is sent; other players' bodies show only their buffs (the snapshot's flags), as before. Rules in `systems/cueRules.ts`.

import { particleEffect } from '../../entities/ParticleEffect';
import { NO_STRAIN, strainOf, WILT_EVERY, wilting } from '../../systems/cueRules';
import type { Arena } from './Arena';

export class BodyCues {
  private wilt = 0;

  constructor(private arena: Arena) {}

  update(dt: number) {
    const { local } = this.arena;
    const { stats, needs } = local.hero;
    if (local.dm || local.down !== null) {
      local.body.setStrain(NO_STRAIN.color, 0);
      return;
    }
    const strain = strainOf(stats.hp, stats.maxHp, needs, this.arena.clock);
    local.body.setStrain(strain.color, strain.amount);
    this.wilt = wilting(needs) ? this.wilt + dt : 0;
    if (this.wilt >= WILT_EVERY) {
      this.wilt = 0;
      this.arena.effects.add(particleEffect('wilt', local.body.x, local.body.y - 34));
    }
  }
}
