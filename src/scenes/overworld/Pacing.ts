import { BreatherBadge } from '../../hud/BreatherBadge';
import { Breather } from '../../systems/breather';
import { NOTE_CODE } from '../../systems/dmRequests';
import type { Arena } from './Arena';
import { DmReport } from './DmReport';
import type { DmDesk } from './DmDesk';
import type { DmPrompts } from './DmPrompts';
import type { Simulation } from './Simulation';

/**
 * How the session is going, said and written down (core engine; the breather is local to each page, the report is the host's).
 * The breather after a quest is said on screen with a clock (`Breather`, hud/BreatherBadge.ts, with three faces to tap) and
 * by the Dungeon Master (`onBreather`); `StoryUi` calls `questStarted`, `questDone` and `questLost` as it sees a quest begin
 * or end, so solo, host and guest all start the same breather from the quest they each already have. The host's notebook
 * (`DmReport`) hears what players say to the DM, the director's nudges, knockouts and quest ends, and notes each with the
 * state of the game; a face tapped by a guest travels to the host as a one-tap note. Nothing is a form or a menu.
 */
export class Pacing {
  readonly breather = new Breather();
  readonly report: DmReport;
  private badge = new BreatherBadge();
  /** Set by the scene: a breather has begun (the DM says so, when this page runs the world). */
  onBreather: () => void = () => {};

  constructor(
    private arena: Arena,
    sim: Simulation,
    prompts: DmPrompts,
    desk: DmDesk,
  ) {
    this.report = new DmReport(arena, () => this.breather.active);
    // The host's notebook: what players say to the DM, what the director offers, what the party kills and who falls.
    prompts.onHeard = (slot, code, text) => this.report.heard(slot, code, text);
    prompts.onSignal = (kind) => this.report.signal(kind);
    const kill = sim.onKill;
    sim.onKill = (zone, key) => {
      kill(zone, key);
      this.report.killed(key);
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
    // A face tapped on the badge: a guest tells the host, the host writes it down itself.
    this.badge.onMood = (face) => {
      if (arena.role === 'client') desk.ask(NOTE_CODE, face);
      else this.report.heard(arena.local.slot, NOTE_CODE, face);
    };
  }

  /** Every frame. */
  update(dt: number) {
    this.report.update(dt);
    if (this.arena.local.dm) return;
    this.breather.tick(dt);
    this.badge.update(this.breather.seconds, true);
  }

  questStarted() {
    this.breather.end(); // the next quest is on: the lull is over
  }

  /** A quest was handed in or finished; `lull` is false for a saga's middle step, whose next step follows at once. */
  questDone(lull = true) {
    if (lull) this.beginBreather();
  }

  questLost() {
    this.beginBreather();
  }

  private beginBreather() {
    this.breather.start();
    this.report.breather();
    this.onBreather();
  }

  /** Back to solo or a new game: what was written belongs to the game that ended. */
  reset() {
    this.report.reset();
    this.breather.end();
  }
}
