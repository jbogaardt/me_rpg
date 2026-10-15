import type { Mob } from '../../entities/Mob';
import {
  Cooldown,
  FREEZE_COOLDOWN,
  FREEZE_TIME,
  RESET_COOLDOWN,
  smitePlan,
  SMITE_COOLDOWN,
  type Bolt,
  type Pressure,
} from '../../systems/dmPowers';
import type { Arena } from './Arena';
import type { Simulation } from './Simulation';
import type { ZoneState } from '../ZoneState';

/** What the bar's buttons show (hud/DmBar.ts). */
export interface PowersView {
  /** Seconds each power still has to wait (0: ready). */
  smite: number;
  freeze: number;
  reset: number;
  stopped: boolean;
  pressure: Pressure;
}

/**
 * The Dungeon Master's powers, on the host: Smite (a storm of lightning that fells every foe in the zone they stand
 * in; no XP or gold, the DM's doing is not the party's kill; the bolts never hurt the party), Freeze (every foe there
 * held still for `FREEZE_TIME`), Stop time (the world holds still for everyone but the DM, to explain something; the
 * same key starts it again), Reset zone (every foe there back home at full health) and the Pressure dial. None of them
 * brings a foe into the world: the DM shapes how hard it pushes, never what is in it. Everything but stopping time is
 * an ordinary lightning/fx event or mob state, so a friend sees it through the usual snapshots; a stopped clock is one
 * flag in the `dm` message (`DmDesk`).
 */
export class DmPowers {
  private smiteCd = new Cooldown(SMITE_COOLDOWN);
  private freezeCd = new Cooldown(FREEZE_COOLDOWN);
  private resetCd = new Cooldown(RESET_COOLDOWN);
  private storm: { zone: ZoneState; mobs: Mob[]; bolts: Bolt[]; t: number } | null = null;

  constructor(
    private arena: Arena,
    private sim: Simulation,
  ) {}

  view(): PowersView {
    return {
      smite: this.smiteCd.wait,
      freeze: this.freezeCd.wait,
      reset: this.resetCd.wait,
      stopped: this.arena.timeStopped,
      pressure: this.arena.pressure,
    };
  }

  /** The live foes of the zone the DM stands in. */
  private foes(zone: ZoneState): Mob[] {
    return this.arena.inZone(zone, () => this.arena.mobs.filter((m) => m.alive));
  }

  /** Strike down every foe in the zone the DM stands in. False if it is cooling down or there is nobody to strike. */
  smite(): boolean {
    if (this.arena.role !== 'host' || this.storm || !this.smiteCd.ready) return false;
    const zone = this.arena.view;
    const mobs = this.foes(zone);
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
    const mobs = this.foes(zone);
    if (!mobs.length || !this.freezeCd.use()) return false;
    this.arena.inZone(zone, () => {
      for (const m of mobs) {
        m.freeze(FREEZE_TIME);
        this.sim.fx('frost', m.body.x, m.body.y - 12);
      }
    });
    return true;
  }

  /** Stop time for everyone but the DM, or start it again. */
  toggleStop(): boolean {
    if (this.arena.role !== 'host') return false;
    this.arena.timeStopped = !this.arena.timeStopped;
    return true;
  }

  /** Every foe in the DM's zone (the fallen too) goes back home at full health. Chests and the ground stay as they are. */
  resetZone(): boolean {
    if (this.arena.role !== 'host' || !this.resetCd.ready) return false;
    const zone = this.arena.view;
    this.resetCd.use();
    this.storm = null;
    this.arena.inZone(zone, () => {
      for (const m of this.arena.mobs) {
        if (m.alive) this.sim.fx('mobPoof', m.body.x, m.body.y - 12);
        m.reset();
      }
    });
    return true;
  }

  /** Where the party is, in the DM's zone (else where the DM stands). */
  private partyCentre(zone: ZoneState): { x: number; y: number } {
    const here = this.arena.party().filter((p) => p.zone === zone.name);
    if (!here.length) return { x: this.arena.local.body.x, y: this.arena.local.body.y };
    return {
      x: here.reduce((a, p) => a + p.body.x, 0) / here.length,
      y: here.reduce((a, p) => a + p.body.y, 0) / here.length,
    };
  }

  /** Call every idle foe in the DM's zone towards the party (for a minute); the foes that are already fighting carry on. */
  closeIn() {
    const zone = this.arena.view;
    const at = this.partyCentre(zone);
    this.arena.inZone(zone, () => {
      for (const m of this.arena.mobs) if (m.alive) m.beckon(at.x, at.y, 60);
    });
  }

  /** Turn up the heat: the world pushes harder (fierce) and the foes close in. */
  heat() {
    this.arena.pressure = 'fierce';
    this.closeIn();
  }

  /** Ease off: the world pushes gently, and the party catches its breath (a third of their health comes back). */
  easeOff() {
    this.arena.pressure = 'gentle';
    for (const p of this.arena.partyAll()) {
      const s = p.hero.stats;
      const back = Math.round(s.maxHp * 0.33);
      if (s.hp >= s.maxHp || back <= 0) continue;
      s.hp = Math.min(s.maxHp, s.hp + back);
      this.arena.inZone(this.arena.zoneOf(p), () => {
        this.sim.fx('heal', p.body.x, p.body.y - 14);
        this.sim.text(p.body.x, p.body.y - 54, `+${back}`, 0x7bff9b);
      });
    }
  }

  setPressure(p: Pressure) {
    this.arena.pressure = p;
  }

  update(dt: number) {
    this.smiteCd.tick(dt);
    this.freezeCd.tick(dt);
    this.resetCd.tick(dt);
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

  /** Back to solo or a new game (the pressure stays: it is what the host chose for this game). */
  reset() {
    this.storm = null;
    this.arena.timeStopped = false;
    this.smiteCd.reset();
    this.freezeCd.reset();
    this.resetCd.reset();
  }
}
