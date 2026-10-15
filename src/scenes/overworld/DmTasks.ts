import {
  TASK_LINGER,
  TaskBook,
  taskReward,
  viewOf,
  type Presence,
  type TaskKind,
  type TaskState,
} from '../../systems/dmTasks';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import type { Simulation } from './Simulation';

/** What the DM says as a task starts and ends: it is their voice, to every screen. */
const CALL: Record<TaskKind, string> = {
  follow: 'Follow me.',
  defend: 'Hold this ground!',
  hunt: 'Hunt them down!',
};
const END: Record<TaskKind, Record<'done' | 'failed', string>> = {
  follow: { done: 'Well followed.', failed: 'You lost me.' },
  defend: { done: 'The ground is held. Well done.', failed: 'The ground is lost.' },
  hunt: { done: 'The hunt is over. Well done.', failed: 'The hunt has gone cold.' },
};

/**
 * The task the Dungeon Master has called for the party (systems/dmTasks.ts has the rules), on the host: called from the
 * bar anchored where they stand, counted each frame from where everyone is and how many foes the party killed there,
 * paid to the whole party when done, announced in the DM's voice. Everyone sees it in their tracker (`Arena.task`, a
 * friend is told through the `dm` message). A defended ground also calls the idle foes of its zone towards it, so there
 * is something to defend against.
 */
export class DmTasks {
  private book = new TaskBook();
  private kills = 0;
  private linger = 0;

  constructor(
    private arena: Arena,
    private sim: Simulation,
    private desk: DmDesk,
  ) {
    const before = sim.onKill;
    sim.onKill = (zone) => {
      before(zone);
      if (this.book.task?.state === 'active' && zone === this.book.task.zone) this.kills++;
    };
  }

  private seq = 0;

  /** Which call this is (changes with each task the DM calls). */
  get id(): number {
    return this.seq;
  }

  /** The task as everyone sees it. */
  get view() {
    return this.arena.task;
  }

  get active(): boolean {
    return this.book.task?.state === 'active';
  }

  private here(): Presence {
    const p = this.arena.local;
    return { zone: p.zone, x: p.body.x, y: p.body.y };
  }

  /** Call a task where the DM stands. False if one is running or there is no game to call it in. */
  call(kind: TaskKind): boolean {
    if (this.arena.role !== 'host' || this.active) return false;
    this.book.cancel();
    const at = this.here();
    if (!this.book.call(kind, at)) return false;
    this.kills = 0;
    this.linger = 0;
    this.seq++;
    if (kind === 'defend') {
      const zone = this.arena.view;
      this.arena.inZone(zone, () => {
        for (const m of this.arena.mobs) if (m.alive) m.beckon(at.x, at.y, 90);
      });
    }
    this.desk.say(CALL[kind]);
    this.publish();
    return true;
  }

  /** The DM calls it off. */
  cancel() {
    this.book.cancel();
    this.publish();
  }

  update(dt: number) {
    if (this.arena.role !== 'host') return;
    const task = this.book.task;
    if (!task) return;
    if (task.state !== 'active') {
      if ((this.linger -= dt) <= 0) this.cancel();
      return;
    }
    const party = this.arena.party();
    const result = this.book.tick(dt, {
      dm: this.here(),
      party: party.map((p) => ({ zone: p.zone, x: p.body.x, y: p.body.y })),
      kills: this.kills,
    });
    this.kills = 0;
    this.publish();
    if (result) this.finish(result, task.kind, party);
  }

  private finish(result: TaskState, kind: TaskKind, party: ReturnType<Arena['party']>) {
    if (result === 'done') {
      const { xp, gold } = taskReward(kind);
      for (const p of party) this.sim.reward(p, xp, gold);
    }
    if (result === 'done' || result === 'failed') this.desk.say(END[kind][result]);
    this.linger = TASK_LINGER;
  }

  private publish() {
    this.arena.task = this.book.task ? viewOf(this.book.task) : null;
  }

  reset() {
    this.book.cancel();
    this.kills = 0;
    this.arena.task = null;
  }
}
