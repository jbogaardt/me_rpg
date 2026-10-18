import type { Arena } from './Arena';
import { DmReport } from './DmReport';
import type { DmDesk } from './DmDesk';
import type { DmPrompts } from './DmPrompts';
import type { Simulation } from './Simulation';

/**
 * How the session is going, written down (core engine; the report is the host's). The host's notebook (`DmReport`) hears what
 * players say to the Dungeon Master, the director's nudges, knockouts and quest ends, and notes each with the state of the
 * game. Nothing is a form or a menu.
 */
export class Pacing {
  readonly report: DmReport;

  constructor(arena: Arena, sim: Simulation, prompts: DmPrompts, desk: DmDesk) {
    this.report = new DmReport(arena);
    // The host's notebook: what players say to the DM, what the director offers, what the party kills and who falls.
    prompts.onHeard = (slot, code, text) => this.report.heard(slot, code, text);
    prompts.onSignal = (kind) => this.report.signal(kind);
    const kill = sim.onKill;
    sim.onKill = (zone, key) => {
      kill(zone, key);
      this.report.killed(zone, key);
    };
    const hurt = sim.onHurt;
    sim.onHurt = (p, kind, damage) => {
      hurt(p, kind, damage);
      this.report.hurt(p, kind, damage);
    };
    const dealt = sim.onDealt;
    sim.onDealt = (kind, damage, killed) => {
      dealt(kind, damage, killed);
      this.report.dealt(damage);
    };
    const defeat = sim.onDefeat;
    sim.onDefeat = (p, zone, x, y) => {
      defeat(p, zone, x, y);
      this.report.down(p, zone);
    };
    const say = desk.onSay;
    desk.onSay = (text) => {
      say(text);
      this.report.dmSaid(text);
    };
  }

  /** Every frame. */
  update(dt: number) {
    this.report.update(dt);
  }

  /** Back to solo or a new game: what was written belongs to the game that ended. */
  reset() {
    this.report.reset();
  }
}
