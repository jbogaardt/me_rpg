import type { Mob } from '../../entities/Mob';
import { Cooldown, FREEZE_COOLDOWN, FREEZE_TIME, smitePlan, SMITE_COOLDOWN, type Bolt } from '../../systems/dmPowers';
import type { Arena } from './Arena';
import type { Simulation } from './Simulation';
import type { ZoneState } from '../ZoneState';

/** What the powers' buttons show (hud/DmBar.ts). */
export interface PowersView {
  smite: number; // seconds to wait, 0 when ready
  freeze: number;
}

/**
 * The Dungeon Master's two big buttons, on the host: Smite (a storm of lightning that fells every foe in the zone they
 * stand in; no XP or gold, the DM's doing is not the party's kill; the bolts never hurt the party) and Freeze (every
 * foe there held still for `FREEZE_TIME`). Both are ordinary lightning/fx events and mob states, so a friend sees them
 * through the usual snapshots with nothing of their own on the wire.
 */
export class DmPowers {
  private smiteCd = new Cooldown(SMITE_COOLDOWN);
  private freezeCd = new Cooldown(FREEZE_COOLDOWN);
  private storm: { zone: ZoneState; mobs: Mob[]; bolts: Bolt[]; t: number } | null = null;

  constructor(
    private arena: Arena,
    private sim: Simulation,
  ) {}

  view(): PowersView {
    return { smite: this.smiteCd.wait, freeze: this.freezeCd.wait };
  }

  /** Strike down every foe in the zone the DM stands in. False if it is cooling down or there is nobody to strike. */
  smite(): boolean {
    if (this.arena.role !== 'host' || this.storm || !this.smiteCd.ready) return false;
    const zone = this.arena.view;
    const mobs = this.arena.inZone(zone, () => this.arena.mobs.filter((m) => m.alive));
    const bolts = smitePlan(
      mobs.map((m) => m.body),
      Math.random,
    );
    if (!bolts.length || !this.smiteCd.use()) return false;
    this.storm = { zone, mobs, bolts, t: 0 };
    return true;
  }

  /** Hold every foe in the DM's zone still for a while. */
  freeze(): boolean {
    if (this.arena.role !== 'host' || !this.freezeCd.ready) return false;
    const zone = this.arena.view;
    const mobs = this.arena.inZone(zone, () => this.arena.mobs.filter((m) => m.alive));
    if (!mobs.length || !this.freezeCd.use()) return false;
    this.arena.inZone(zone, () => {
      for (const m of mobs) {
        m.freeze(FREEZE_TIME);
        this.sim.fx('frost', m.body.x, m.body.y - 12);
      }
    });
    return true;
  }

  update(dt: number) {
    this.smiteCd.tick(dt);
    this.freezeCd.tick(dt);
    const s = this.storm;
    if (!s) return;
    s.t += dt;
    const due = s.bolts.filter((b) => b.at <= s.t);
    s.bolts = s.bolts.filter((b) => b.at > s.t);
    this.arena.inZone(s.zone, () => {
      for (const b of due) {
        this.sim.lightning({ x: b.x, y: b.y, seed: b.seed }, true);
        const mob = b.kill === null ? undefined : s.mobs[b.kill];
        if (!mob?.alive) continue;
        mob.hit(mob.hp, 0, 0);
        this.sim.fx('mobPoof', mob.body.x, mob.body.y - 12);
      }
    });
    if (!s.bolts.length) this.storm = null;
  }

  /** Back to solo or a new game. */
  reset() {
    this.storm = null;
    this.smiteCd.reset();
    this.freezeCd.reset();
  }
}
