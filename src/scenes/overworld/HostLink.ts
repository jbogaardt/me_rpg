import { dirIndex } from '../../core/direction';
import { floatText } from '../../entities/effects';
import { NO_COMMAND, type Command, type Player } from '../../entities/Player';
import { DEFAULT_VIEW, MobFeed } from '../../net/feed';
import { encodeMob } from '../../net/mobWire';
import { FLAG, round1, unpackKeys, type PlayerSnap, type StatsSnap, type WorldEvent } from '../../net/protocol';
import type { Session } from '../../net/session';
import type { Stats } from '../../systems/combat';
import { PLAYER_COLORS, playerName } from '../../systems/looks';
import type { Arena } from './Arena';
import type { Simulation } from './Simulation';

const SNAPSHOT_HZ = 25; // host -> guest world state
const EVENT_KEEP = 0.6; // seconds a one-shot world event may keep riding in snapshots if no ack arrives
const MAX_EVENTS_SENT = 48;

/**
 * The host's side of a co-op game: keeps the friends' players in step with the session's seats, reads their controls,
 * records the one-shot events they should see, and sends each friend a snapshot of the world (net/protocol.ts). The
 * simulation itself is Simulation's; this only brings the friends in and out and tells them what happened.
 */
export class HostLink {
  private snapTimer = 0;
  private snapSeq = 0;
  private events: { id: number; at: number; e: WorldEvent }[] = []; // recent one-shot events
  private eventId = 0;
  private feeds = new Map<number, MobFeed>(); // what each friend has been told about the mobs

  constructor(
    private arena: Arena,
    private session: Session,
    private sim: Simulation,
  ) {}

  /** This game just became a host: start fresh and seat whoever is already connected. */
  enter() {
    this.events = [];
    this.feeds.clear();
    this.snapTimer = 0;
    this.reconcile();
  }

  /** The game stopped being a host: the friends' players leave, each with a notice floating where they stood. */
  leave() {
    const { arena } = this;
    for (const slot of [...arena.remotes.keys()]) {
      arena.removeRemote(slot, (p) =>
        arena.effects.add(floatText(p.body.x, p.body.y - 54, `${playerName(slot)} left`, 0xffffff)),
      );
    }
    arena.local.body.setTag(null);
    this.feeds.clear();
  }

  /** Something every friend should also see (it is shown there, never simulated). */
  emit(e: WorldEvent) {
    if (this.arena.role === 'host') this.events.push({ id: ++this.eventId, at: this.arena.clock, e });
  }

  /** Players follow the session's connected seats. A friend who connected appears at the spawn; one who left goes. */
  reconcile() {
    const { arena } = this;
    const connected = this.session.connectedSlots();
    for (const slot of connected) {
      if (arena.remotes.has(slot)) continue;
      const remote = arena.addRemote(slot);
      // Spread newcomers along the spawn cell so they don't stand exactly on top of each other.
      const [x, y] = arena.cellToFeet(arena.spawn);
      remote.body.position.set(x + (slot - 2) * 8, y);
      this.sim.text(remote.body.x, remote.body.y - 54, `${playerName(slot)} joined`, PLAYER_COLORS[slot] ?? 0xffffff);
    }
    for (const slot of [...arena.remotes.keys()]) {
      if (connected.includes(slot)) continue;
      arena.removeRemote(slot, (p) => this.sim.text(p.body.x, p.body.y - 54, `${playerName(slot)} left`, 0xffffff));
      this.feeds.delete(slot);
    }
  }

  /** A friend's controls for this tick. Action presses arrive as a running count, so none is lost or doubled. */
  command(p: Player): Command {
    const peer = this.session.peerInput(p.slot);
    if (!peer) return NO_COMMAND;
    const { dx, dy } = peer.fresh ? unpackKeys(peer.keys) : { dx: 0, dy: 0 };
    const act = peer.act > p.seenAct;
    const mag = peer.mag > p.seenMag;
    p.seenAct = peer.act;
    p.seenMag = peer.mag;
    return { dx, dy, act, mag };
  }

  /** Every SNAPSHOT_HZ: tell each friend about the world. */
  broadcast(dt: number) {
    const { arena } = this;
    this.snapTimer += dt;
    if (arena.remotes.size === 0 || this.snapTimer < 1 / SNAPSHOT_HZ) return;
    this.snapTimer = 0;
    this.events = this.events.filter((ev) => arena.clock - ev.at < EVENT_KEEP);
    // The world is the same for everyone; what differs per friend is their own stats, which mobs are near them, and
    // which events they have not yet confirmed.
    const n = ++this.snapSeq;
    const players = arena.players().map((p) => this.snapPlayer(p));
    const states = arena.mobs.map((m) => encodeMob(m.view()));
    const chests = arena.chests.reduce((mask, c, i) => (c.opened ? mask | (1 << i) : mask), 0);
    for (const [slot, remote] of arena.remotes) {
      const peer = this.session.peerInput(slot);
      let feed = this.feeds.get(slot);
      if (!feed) this.feeds.set(slot, (feed = new MobFeed()));
      const mobs = feed.select(states, remote.body, peer?.vr || DEFAULT_VIEW, arena.clock);
      const events = this.events
        .filter((ev) => ev.id > (peer?.ack ?? 0))
        .slice(-MAX_EVENTS_SENT)
        .map(({ id, e }) => ({ id, e }));
      this.session.sendTo(slot, { k: 'snap', n, players, mobs, chests, events, me: this.snapStats(remote.hero.stats) });
    }
  }

  private snapPlayer(p: Player): PlayerSnap {
    const swinging = this.sim.isSwinging(p);
    const flags = (p.moving ? FLAG.moving : 0) | (p.invuln > 0 ? FLAG.invuln : 0) | (swinging ? FLAG.swing : 0);
    return [p.slot, Math.round(p.body.x), Math.round(p.body.y), dirIndex(p.body.facing), flags];
  }

  private snapStats(s: Stats): StatsSnap {
    return [s.level, s.xp, round1(s.hp), s.maxHp, round1(s.mp), s.maxMp, s.attack, s.defense, s.magic];
  }
}
