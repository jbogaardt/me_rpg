import type { Command } from '../../entities/Player';
import type { Mob } from '../../entities/Mob';
import type { Arena } from './Arena';
import type { Simulation } from './Simulation';
import type { ZoneState } from '../ZoneState';

/** How close (px, at a foe's size) a click must land to its body to take it. */
const GRAB = 28;
/** A finger is blunter than a pointer: the same reach, this many times over. */
const FINGER = 1.7;

/**
 * The Dungeon Master possesses a foe: click one and its mind is theirs (move, strike; the party meets a real foe, its
 * blows go through the usual damage rules); Esc lets go. The foe can die, and then the DM steps out where it fell; the DM
 * cannot, since they are never a target. While possessing, the DM's own body rides invisibly on the foe, so the camera,
 * the zone and the friends' view all follow without anything new but one flag (`FLAG.hidden`). Host only.
 */
export class DmPossession {
  private mob: Mob | null = null;

  constructor(
    private arena: Arena,
    private sim: Simulation,
  ) {}

  get active(): boolean {
    return this.mob !== null;
  }

  /** The foe being held, for the hint on the DM's screen ('' when none). */
  get name(): string {
    return this.mob?.kind.name ?? '';
  }

  /** The DM clicked (or, with `finger`, tapped) at `screen` (CSS px): take the foe under it, if there is one. */
  clickAt(screen: { x: number; y: number }, finger = false): boolean {
    const { arena } = this;
    if (this.mob || arena.role !== 'host' || !arena.local.dm) return false;
    const zone = arena.view;
    const scale = zone.world.scale.x || 1;
    const wx = (screen.x - zone.world.x) / scale;
    const wy = (screen.y - zone.world.y) / scale;
    let best: Mob | null = null;
    let bestDist = Infinity;
    arena.inZone(zone, () => {
      for (const m of arena.mobs) {
        if (!m.alive) continue;
        const size = m.body.size;
        const d = Math.hypot(wx - m.body.x, wy - (m.body.y - 20 * size));
        if (d < GRAB * (finger ? FINGER : 1) * size && d < bestDist) [best, bestDist] = [m, d];
      }
    });
    if (!best) return false;
    this.possess(best, zone);
    return true;
  }

  private possess(mob: Mob, zone: ZoneState) {
    const dm = this.arena.local;
    this.mob = mob;
    dm.hidden = true;
    dm.body.visible = false;
    this.arena.inZone(zone, () => {
      this.sim.fx('castGlow', mob.body.x, mob.body.y - 14);
      this.sim.text(mob.body.x, mob.body.y - 60 * mob.body.size, 'Possessed!', 0xd070ff);
    });
    this.follow();
  }

  /** Let go: the DM stands where the foe stands. */
  release() {
    const mob = this.mob;
    if (!mob) return;
    this.mob = null;
    mob.setDrive(null);
    const dm = this.arena.local;
    dm.hidden = false;
    dm.body.visible = true;
    dm.body.position.set(mob.body.x, mob.body.y);
  }

  /** Each frame, before the foes move: what the DM asks of the foe (nothing while a menu or dialog has them). */
  drive(cmd: Command, reading: boolean) {
    if (!this.mob) return;
    this.mob.setDrive(
      reading
        ? { dx: 0, dy: 0, attack: false }
        : { dx: cmd.dx, dy: cmd.dy, attack: cmd.act, ...(cmd.aim ? { aim: cmd.aim } : {}) },
    );
  }

  /** The DM's body rides on the foe (invisible), so the camera and zone follow. */
  follow() {
    const mob = this.mob;
    if (!mob) return;
    const { body } = this.arena.local;
    body.position.set(mob.body.x, mob.body.y);
    body.visible = false;
  }

  /** A foe that has fallen frees the DM; so does the game no longer being hosted. */
  update() {
    if (this.mob && (!this.mob.alive || this.arena.role !== 'host')) this.release();
  }

  reset() {
    this.release();
  }
}
