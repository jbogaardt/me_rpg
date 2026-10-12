import type { Player } from '../../entities/Player';
import { arrows } from '../../systems/spells';
import { isTrialZone, knows, learn, skillOfZone, TRAINER_RETURN, TRAINER_ROOM, type Skill } from '../../systems/skills';
import type { Arena } from './Arena';
import type { Simulation } from './Simulation';
import type { Zones } from './Zones';

/** Seconds a player who passed their trial stands in the training ground before they are sent back to the trainer. */
const LEAVE_AFTER = 3.5;

const FAIL_LINES = [
  "You fall, and the world folds. You wake in the trainer's room.",
  '"Not yet," says Orin. "Catch your breath, drink something, and we will try again."',
];

/**
 * The training trials (solo and host only; a guest is only moved around by what the host decides): the trainer sends a
 * player into a training ground (zone `Skill.zone`) with a wave of enemies that do not come back. When every enemy there
 * is down, each player in it who is being tested for that skill learns it; a player who falls is brought back to the
 * trainer's room, and one who walks out through the door gives up. The rules for what a skill is are systems/skills.ts.
 */
export class Training {
  /** Players being sent in (the zone is loading), so a trial that has not started yet is not taken for one that was left. */
  private starting = new Set<Player>();

  constructor(
    private arena: Arena,
    private zones: Zones,
    private sim: Simulation,
    /** Say something to the local player (a dialog). */
    private announce: (lines: string[]) => void,
  ) {}

  /**
   * Send a player to the training ground for `skill`. Returns why not, or null when they are on their way (the ground is
   * loaded first if need be, and they arrive through the usual iris).
   */
  start(p: Player, skill: Skill): string | null {
    if (p.trial || this.starting.has(p)) return 'You are already in a trial.';
    if (knows(p.hero, skill.id)) return `You already know ${skill.name}.`;
    if (p.hero.stats.level < skill.minLevel) return `${skill.name} needs level ${skill.minLevel}.`;
    this.starting.add(p);
    void this.zones
      .ensure(skill.zone)
      .then(() => {
        const dest = this.arena.zones.get(skill.zone);
        if (!dest) return;
        // Fresh enemies, unless someone else is in the middle of the same trial.
        if (!this.arena.everyone().some((q) => q !== p && q.zone === dest.name)) dest.mobs.forEach((m) => m.reset());
        const s = p.hero.stats;
        s.hp = s.maxHp;
        s.mp = s.maxMp;
        p.trial = skill.id;
        this.zones.travel(p, dest, dest.data.spawn, false);
        this.sim.text(p.body.x, p.body.y - 66, `${skill.name}: slot 2`, 0xcfe8ff); // it takes the second slot for the trial
      })
      .finally(() => this.starting.delete(p));
    return null;
  }

  /** Once a frame: a trial is won when its zone's enemies are all down; one that was walked out of is over. */
  update(dt: number) {
    const { arena } = this;
    for (const p of arena.everyone()) {
      if (p.trial && !this.starting.has(p) && !isTrialZone(p.zone)) p.trial = null; // walked out: they gave up
      if (p.trialExit > 0 && (p.trialExit -= dt) <= 0) this.sendBack(p);
    }
    for (const z of arena.zones.values()) {
      if (!isTrialZone(z.name) || z.mobs.length === 0 || z.mobs.some((m) => m.alive)) continue;
      const skill = skillOfZone(z.name);
      if (!skill) continue;
      arena.inZone(z, () => {
        for (const p of arena.players()) if (p.trial === skill.id && p.trialExit <= 0) this.win(p, skill);
      });
    }
  }

  /** A player beat the wave: they learn the skill and, a moment later, are sent back to the trainer. */
  private win(p: Player, skill: Skill) {
    learn(p.hero, skill.id);
    const s = p.hero.stats;
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    p.trialExit = LEAVE_AFTER;
    this.sim.text(p.body.x, p.body.y - 74, `${skill.name} learned!`, 0xffd34d);
    this.sim.fx('levelUp', p.body.x, p.body.y - 14);
    if (p === this.arena.local) {
      const slot = p.hero.loadout.indexOf(skill.id) + 1;
      this.announce([
        `Every foe is down. You have learned ${skill.name}!`,
        slot
          ? `It is ready in slot ${slot}: tap ${arrows(skill.keys)} to cast it with any weapon. To swap your abilities, open the menu (Esc) and choose the Magic tab.`
          : `Both your slots are full, so it is not ready yet: open the menu (Esc), choose the Magic tab and ready ${skill.name} in either slot.`,
        'The trainer will bring you back now.',
      ]);
    }
  }

  /** Back to the trainer's room, through the iris, whole again. */
  private sendBack(p: Player) {
    const dest = this.arena.zones.get(TRAINER_ROOM);
    if (!dest) {
      p.trialExit = 0.5; // the room was unloaded (it is kept loaded for trials, so this is rare): load it and try again
      void this.zones.ensure(TRAINER_ROOM);
      return;
    }
    const s = p.hero.stats;
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    p.trial = null;
    p.trialExit = 0;
    this.zones.travel(p, dest, TRAINER_RETURN, false);
  }

  /** A player was beaten in a trial (called by the simulation's defeat): they wake in the trainer's room. True when handled. */
  fail(p: Player): boolean {
    if (!p.trial) return false;
    const dest = this.arena.zones.get(TRAINER_ROOM);
    if (!dest) return false; // not loaded: the ordinary defeat will do
    const s = p.hero.stats;
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    p.trial = null;
    p.trialExit = 0;
    this.zones.travel(p, dest, TRAINER_RETURN, false);
    p.aim = { x: 0, y: 1 };
    p.knock = { x: 0, y: 0 };
    p.vel = { x: 0, y: 0 };
    p.invuln = 0;
    p.pendingShot = null;
    p.ward = 0;
    p.edge = { charges: 0, timer: 0 };
    p.haste = p.guard = 0;
    if (p === this.arena.local) this.announce(FAIL_LINES);
    else this.sim.text(p.body.x, p.body.y - 62, 'Trial failed', 0xff8a7a);
    return true;
  }
}
