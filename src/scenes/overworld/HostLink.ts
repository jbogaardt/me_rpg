import { decodeAim } from '../../core/aim';
import { dirIndex } from '../../core/direction';
import { NO_COMMAND, type Command, type Player } from '../../entities/Player';
import { cellFeet } from '../../map/doors';
import { DEFAULT_VIEW, eventInView, fitEvents, MobFeed, SNAP_BUDGET } from '../../net/feed';
import { encodeMob } from '../../net/mobWire';
import {
  encodeEvent,
  encodeMessage,
  FLAG,
  round1,
  unpackKeys,
  type EventWire,
  type GroundSnap,
  type MobFields,
  type PlayerSnap,
  type SnapMsg,
  type StatsSnap,
  type WorldEvent,
} from '../../net/protocol';
import type { Session } from '../../net/session';
import type { Stats } from '../../systems/combat';
import { itemCode } from '../../systems/inventory';
import { PLAYER_COLORS, playerName } from '../../systems/looks';
import { NO_WEATHER } from '../../systems/weather';
import type { ZoneState } from '../ZoneState';
import type { Arena } from './Arena';
import { BOLT_RANGE } from './constants';
import type { PackSync } from './PackSync';
import type { Simulation } from './Simulation';
import type { Trading } from './Trading';

const SNAPSHOT_HZ = 25; // host -> guest world state
const EVENT_KEEP = 0.6; // seconds a one-shot world event keeps riding in snapshots, to survive packet loss
const MAX_EVENTS_SENT = 48;
const GROUND_RESEND = 1; // seconds between full lists of the items on the ground, when nothing changed

/**
 * The host's side of a co-op game: keeps the friends' players in step with the session's seats, reads their controls,
 * records the one-shot events they should see, and sends each friend a snapshot of the world (net/protocol.ts). The
 * simulation itself is Simulation's; the friends' gold, pack and trades are PackSync's and Trading's. This brings the
 * friends in and out and tells them what happened.
 */
export class HostLink {
  private snapTimer = 0;
  private snapSeq = 0;
  // recent one-shot events, encoded once for every friend that is sent them
  private events: { id: number; at: number; zone: string; e: WorldEvent; wire: EventWire; size: number }[] = [];
  private eventId = 0;
  private feeds = new Map<number, { zone: string; feed: MobFeed; ground: { sig: string; at: number } | null }>(); // what each friend has been told about the mobs

  constructor(
    private arena: Arena,
    private session: Session,
    private sim: Simulation,
    private pack: PackSync,
    private trading: Trading,
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
      this.remove(slot, (p) => this.sim.text(p.body.x, p.body.y - 54, `${playerName(slot)} left`, 0xffffff));
    }
    arena.local.body.setTag(null);
    this.trading.reset();
  }

  /** Something every friend should also see (it is shown there, never simulated). Only a host records these. */
  emit(e: WorldEvent) {
    if (this.arena.role !== 'host') return;
    const wire = encodeEvent(++this.eventId, e);
    this.events.push({
      id: this.eventId,
      at: this.arena.clock,
      zone: this.arena.zone.name,
      e,
      wire,
      size: JSON.stringify(wire).length,
    });
  }

  /** Players follow the session's connected seats. A friend who connected appears at the spawn; one who left goes. */
  reconcile() {
    const { arena } = this;
    const connected = this.session.connectedSlots();
    for (const slot of connected) {
      if (arena.remotes.has(slot)) continue;
      const remote = arena.addRemote(slot, arena.home); // newcomers arrive at the start of the world
      // Spread newcomers along the spawn cell so they don't stand exactly on top of each other.
      const [x, y] = cellFeet(arena.home.data.spawn);
      remote.body.position.set(x + (slot - 2) * 8, y);
      arena.inZone(arena.home, () =>
        this.sim.text(remote.body.x, remote.body.y - 54, `${playerName(slot)} joined`, PLAYER_COLORS[slot] ?? 0xffffff),
      );
    }
    for (const slot of [...arena.remotes.keys()]) {
      if (connected.includes(slot)) continue;
      this.remove(slot, (p) => this.sim.text(p.body.x, p.body.y - 54, `${playerName(slot)} left`, 0xffffff));
    }
  }

  /** Take a friend out of the game and forget what was kept about them. */
  private remove(slot: number, notice: (p: Player) => void) {
    this.arena.removeRemote(slot, notice);
    this.feeds.delete(slot);
    this.pack.forget(slot);
    this.trading.drop(slot);
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
    return { dx, dy, act, mag, ...(peer.fresh && peer.am ? { aim: decodeAim(peer.am) } : {}) };
  }

  /** Every SNAPSHOT_HZ: tell each friend about the world they are standing in. */
  broadcast(dt: number) {
    const { arena } = this;
    this.snapTimer += dt;
    if (arena.remotes.size === 0 || this.snapTimer < 1 / SNAPSHOT_HZ) return;
    this.snapTimer = 0;
    this.events = this.events.filter((ev) => arena.clock - ev.at < EVENT_KEEP);
    // Each friend is sent the zone they are standing in. Friends in the same zone share one picture of it (the players,
    // the chests); what differs per friend is their own stats, which mobs are near them, and which events they have not
    // yet confirmed. A zone nobody is in costs nothing.
    const everyone = arena.everyone();
    const shared = new Map<
      string,
      { base: Omit<SnapMsg, 'me' | 'mobs' | 'events' | 'ground'>; states: MobFields[]; ground: GroundSnap[] }
    >();
    const worldOf = (z: ZoneState) => {
      let world = shared.get(z.name);
      if (!world) {
        world = {
          base: {
            k: 'snap',
            n: ++this.snapSeq,
            zone: z.name,
            away: everyone.filter((p) => p.zone !== z.name).map((p) => p.slot),
            players: everyone.filter((p) => p.zone === z.name).map((p) => this.snapPlayer(p)),
            chests: z.chests.reduce((mask, c, i) => (c.opened ? mask | (1 << i) : mask), 0),
            w: z.weather?.snapshot() ?? NO_WEATHER,
          },
          states: z.mobs.map((m) => encodeMob(m.view())),
          ground: z.ground.map((g): GroundSnap => [
            g.id,
            Math.round(g.x),
            Math.round(g.y),
            itemCode(g.item),
            Math.ceil(g.remaining),
          ]),
        };
        shared.set(z.name, world);
      }
      return world;
    };
    for (const [slot, remote] of arena.remotes) {
      const z = arena.zoneOf(remote);
      const { base, states, ground } = worldOf(z);
      const peer = this.session.peerInput(slot);
      let entry = this.feeds.get(slot);
      if (!entry || entry.zone !== z.name)
        this.feeds.set(slot, (entry = { zone: z.name, feed: new MobFeed(), ground: null }));
      const view = peer?.vr || DEFAULT_VIEW;
      const mobs = entry.feed.select(states, remote.body, view, arena.clock);
      // Events near this friend that they have not confirmed, as many as fit beside the rest of the snapshot.
      const unseen = this.events.filter(
        (ev) => ev.zone === z.name && ev.id > (peer?.ack ?? 0) && eventInView(ev.e, remote.body, view, BOLT_RANGE),
      );
      // The ground changes rarely (an item dropped, picked up or gone): list it when it does, and once a second anyway
      // (the countdown to crumbling, and a lost packet).
      const sig = ground.map((g) => g.slice(0, 4).join()).join(';');
      const listGround = !entry.ground || entry.ground.sig !== sig || arena.clock - entry.ground.at >= GROUND_RESEND;
      if (listGround) entry.ground = { sig, at: arena.clock };
      const snap: SnapMsg = {
        ...base,
        mobs,
        events: [],
        ...(listGround ? { ground } : {}),
        me: this.snapStats(remote.hero.stats),
      };
      if (unseen.length) snap.events = fitEvents(unseen, SNAP_BUDGET - encodeMessage(snap).length, MAX_EVENTS_SENT);
      this.session.sendTo(slot, snap);
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
