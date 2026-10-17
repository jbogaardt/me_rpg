import { BreatherBadge } from '../../hud/BreatherBadge';
import type { Menu } from '../../hud/Menu';
import { Breather } from '../../systems/breather';
import { Engagement } from '../../systems/engagement';
import { zoneName } from '../../systems/places';
import type { Arena } from './Arena';
import type { Simulation } from './Simulation';

const VISITS_KEY = 'me_rpg.visits';

/**
 * How the session is going, kept and shown (core engine, local to each page, nothing on the wire): the counters behind
 * the Report tab (`Engagement`, systems/engagement.ts) and the breather after a quest, said on screen with a clock
 * (`Breather`, hud/BreatherBadge.ts) and by the Dungeon Master (`onBreather`). `StoryUi` calls `questStarted`,
 * `questDone` and `questLost` as it sees a quest begin or end, so solo, host and guest all start the same breather from
 * the quest they each already have. The DM has no hero to count and is skipped. A guest cannot count kills or
 * knockouts (the host simulates); the Report says so.
 */
export class Pacing {
  readonly engagement = new Engagement();
  readonly breather = new Breather();
  private badge = new BreatherBadge();
  private touched = false;
  private visit = 0;
  /** Set by the scene: a breather has begun (the DM says so, when this page runs the world). */
  onBreather: () => void = () => {};

  constructor(
    private arena: Arena,
    sim: Simulation,
    menu: Menu,
  ) {
    this.visit = this.countVisit();
    for (const type of ['keydown', 'pointerdown', 'pointermove', 'touchstart'])
      window.addEventListener(type, () => (this.touched = true), { passive: true });
    // Count the party's kills and the local hero's knockouts (host and solo only: a guest's simulation never runs).
    const kill = sim.onKill;
    sim.onKill = (zone, key) => {
      kill(zone, key);
      this.engagement.killed();
    };
    const defeat = sim.onDefeat;
    sim.onDefeat = (p, zone, x, y) => {
      defeat(p, zone, x, y);
      if (p === arena.local) this.engagement.knockedOut(zone);
    };
    this.badge.onMood = (m) => {
      this.engagement.mood(m);
      this.log(m);
    };
    menu.report.attach({
      engagement: this.engagement,
      text: () => this.engagement.text({ build: __BUILD_ID__.slice(0, 8), name: zoneName, visit: this.visit }),
      name: zoneName,
      guest: () => arena.role === 'client',
      onSay: (what) => this.log(what),
    });
  }

  /** Every frame. */
  update(dt: number) {
    if (this.arena.local.dm) return;
    this.engagement.tick(dt, {
      input: this.touched,
      zone: this.arena.zone.name,
      level: this.arena.hero.stats.level,
      breather: this.breather.active,
    });
    this.touched = false;
    this.breather.tick(dt);
    this.badge.update(this.breather.seconds, true);
  }

  questStarted() {
    this.engagement.questStarted();
    this.breather.end(); // the next quest is on: the lull is over
  }

  /** A quest was handed in or finished; `lull` is false for a saga's middle step, whose next step follows at once. */
  questDone(lull = true) {
    this.engagement.questDone();
    this.log('quest done');
    if (lull) this.beginBreather();
  }

  questLost() {
    this.engagement.questLost();
    this.log('quest lost');
    this.beginBreather();
  }

  private beginBreather() {
    this.breather.start();
    this.engagement.breatherBegan();
    this.onBreather();
  }

  /** One `[engage]` line to the console: what happened, and the counters. */
  private log(what: string) {
    console.info(`[engage] ${what} ${this.engagement.line()}`);
  }

  /** The visit number: how many times this browser has opened the game (local, a count only; absent where storage is). */
  private countVisit(): number {
    try {
      const n = Number(localStorage.getItem(VISITS_KEY) ?? 0) + 1;
      localStorage.setItem(VISITS_KEY, String(n));
      return n;
    } catch {
      return 0;
    }
  }
}
