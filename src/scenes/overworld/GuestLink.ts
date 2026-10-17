import { encodeAim, type Aim } from '../../core/aim';
import { barrelsFromWire } from '../../systems/barrels';
import { DIRS, DIR_VEC } from '../../core/direction';
import { glide } from '../../core/interp';
import { Reconciler } from '../../core/prediction';
import { floatText } from '../../entities/effects';
import type { Player } from '../../entities/Player';
import type { Menu } from '../../hud/Menu';
import type { ShopCounter } from '../../hud/ShopCounter';
import { decodeMob } from '../../net/mobWire';
import {
  decodeEvent,
  FLAG,
  MAX_VIEW,
  unpackKeys,
  pondsFromWire,
  type InputMsg,
  type PlayerSnap,
  type SnapMsg,
} from '../../net/protocol';
import type { Session } from '../../net/session';
import { newHero, speedFactor, type Hero } from '../../systems/combat';
import { isIce, stepVelocity } from '../../systems/ice';
import { encodeOp, type InvOpWire } from '../../systems/inventory';
import { heroOutfit, playerName } from '../../systems/looks';
import type { Arena } from './Arena';
import { auraTint, DEFEAT_LINES, SPEED } from './constants';
import type { Ground } from './Ground';
import type { PackSync } from './PackSync';
import type { Trading } from './Trading';
import type { Visuals } from './Visuals';
import type { Zones } from './Zones';
import { RIPE_CODE } from '../../systems/crops';

const INPUT_HZ = 30; // guest -> host controls (also sent at once when they change)
/** Seconds of walking the host is ahead of the remembered position for the input it acknowledges (see `Reconciler.reconcile`). */
const LEAD_S = 0.05;

/**
 * A co-op guest's side of the game: no simulation. It draws what the host's snapshots say (the zone this player is in, the
 * players, the mobs that are near, the chests, the items on the ground, the weather, the one-shot events) and sends the
 * host this player's controls, plus the newest event it has shown (so the host stops repeating them), how far it can see
 * (so the host only sends the mobs it could see) and the oldest Inventory action the host has not confirmed. The guest's
 * gold, pack and trades are PackSync's and Trading's.
 */
export class GuestLink {
  private lastEvent = -1; // newest event already shown
  private inputTimer = 0;
  private inputSeq = 0;
  private actCount = 0; // action presses so far, sent as a counter
  private comboCount = 0; // combos cast so far (a counter too), and which one the last was
  private comboIndex = 0;
  private sent = { keys: -1, act: -1, cb: -1, ack: -1, vr: -1, inv: 0, vt: '', rq: '', rd: false };
  /** Prediction (core/prediction.ts): this player's own hero walks from its keys at once; the host's `ia` reconciles it. */
  private rec = new Reconciler();
  private predicted = false; // the host acknowledges inputs, so the local hero is predicted rather than glided
  private predMoving = false;
  private debugEl: HTMLElement | null = null; // `?netdebug`: round trip and correction size
  private solo: Hero | null = null; // the solo hero (stats, gold, pack, gear), put back on disconnect

  constructor(
    private arena: Arena,
    private session: Session,
    private visuals: Visuals,
    private zones: Zones,
    private ground: Ground,
    private pack: PackSync,
    private trading: Trading,
    private ui: { shop: ShopCounter; menu: Menu },
    /** Say something to the player at this keyboard (a dialog). */
    private announce: (lines: string[]) => void,
  ) {}

  /** This game just became a guest: this machine's hero becomes the player the host seated it as. */
  enter() {
    const { arena } = this;
    const { local } = arena;
    const slot = this.session.slot;
    // The host owns this player's character from now on: a fresh hero whose stats, gold, pack and gear it keeps and sends.
    this.solo = local.hero;
    local.hero = newHero();
    this.ground.stash(); // the host's world has its own items on the ground
    this.pack.reset();
    local.setSlot(slot);
    local.hero.name = playerName(slot);
    this.trading.reset();
    this.ui.shop.close();
    arena.refreshLook();
    local.target = null;
    this.lastEvent = -1;
    this.actCount = this.comboCount = this.comboIndex = this.inputSeq = 0;
    this.sent = { keys: -1, act: -1, cb: -1, ack: -1, vr: -1, inv: 0, vt: '', rq: '', rd: false };
    this.inputTimer = 0;
    this.rec.reset();
    this.predicted = false;
    this.predMoving = false;
    arena.applyTags();
  }

  /** The game stopped being a guest: back to the solo hero, standing where it ended up, with the mobs on their own again. */
  leave() {
    const { arena } = this;
    const { local } = arena;
    for (const slot of [...arena.remotes.keys()]) arena.removeRemote(slot, () => {});
    this.rec.reset();
    this.debugEl?.remove();
    this.debugEl = null;
    local.body.setTag(null);
    this.trading.reset();
    if (this.solo) local.hero = this.solo;
    this.solo = null;
    this.ground.restore();
    this.pack.reset();
    this.ui.shop.close();
    this.ui.menu.refresh(local.hero);
    local.setSlot(0);
    local.body.setSheet(arena.wardrobe.sheet(heroOutfit(local.hero)));
    local.target = null;
    local.flags = 0;
    local.invuln = 0;
    local.grace = 0;
    local.knock = { x: 0, y: 0 };
    local.vel = { x: 0, y: 0 };
    local.body.alpha = 1;
    local.body.setOffset(0, 0);
    for (const z of arena.zones.values()) for (const mob of z.mobs) mob.release();
    arena.effects.add(floatText(local.body.x, local.body.y - 54, 'Disconnected', 0xffffff));
  }

  /** The action button was pressed (counted, so a lost packet cannot lose a press). */
  pressAction() {
    this.actCount++;
  }

  /** The player finished combo number `index` of their wand or tome (counted, so a lost packet cannot lose it). */
  castCombo(index: number) {
    this.comboIndex = index;
    this.comboCount++;
  }

  /** Send the next input message now rather than at the next regular send (an Inventory action is waiting). */
  sendSoon() {
    this.inputTimer = 1;
  }

  /** Show what the host last said. */
  update(dt: number) {
    const { arena, session } = this;
    const snap = session.takeSnapshot();
    if (snap) this.applySnapshot(snap);
    const pack = session.takePack();
    if (pack) this.pack.applyPack(pack);
    const looks = session.takeLooks();
    if (looks) this.pack.applyLooks(looks);
    const trade = session.takeTrade();
    if (trade) this.trading.apply(trade);
    for (const p of arena.players()) this.drawPlayer(p, dt);
    for (const mob of arena.mobs) mob.updateRemote(dt);
  }

  /** Send the controls: when they change, and otherwise at INPUT_HZ so a lost packet is soon corrected. */
  sendInput(dt: number, keys: number, aim?: Aim, vote?: [number, number], request?: InputMsg['rq'], reading = false) {
    this.transmit(dt, keys, aim, vote, request, reading);
    this.predict(dt, keys);
  }

  /**
   * Walk this player's own hero from its keys, the way the host will (the same speed, ice and walls), then ease in what
   * the host's last snapshot corrected. The position at each send is remembered (`transmit`) for reconciling.
   */
  private predict(dt: number, keys: number) {
    const { arena } = this;
    const { local } = arena;
    if (!this.predicted || !local.target || (local.flags & FLAG.hidden) !== 0) return;
    const { dx, dy } = unpackKeys(keys);
    const len = Math.hypot(dx, dy);
    const wish = len ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
    if (len) local.body.face(dx ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    local.vel = stepVelocity(
      local.vel,
      wish,
      SPEED * speedFactor(local.hero),
      dt,
      isIce(arena.data, local.body.x, local.body.y - 1),
    );
    if (local.vel.x || local.vel.y) {
      const [x, y] = [local.body.x, local.body.y];
      arena.collision.slide(local.body, local.vel.x * dt, local.vel.y * dt, arena.bodies());
      if (local.body.x === x) local.vel.x = 0;
      if (local.body.y === y) local.vel.y = 0;
    }
    const fix = this.rec.step(dt);
    local.body.position.set(local.body.x + fix.x, local.body.y + fix.y);
    this.predMoving = len > 0;
    this.showDebug();
  }

  /** `?netdebug` in the address: a small readout of the round trip and of how far the host last corrected this hero. */
  private showDebug() {
    if (!location.search.includes('netdebug')) return;
    if (!this.debugEl) {
      this.debugEl = document.createElement('div');
      this.debugEl.style.cssText =
        'position:fixed;left:4px;bottom:4px;z-index:50;font:11px monospace;color:#fff;background:#0008;padding:2px 4px;pointer-events:none';
      document.body.append(this.debugEl);
    }
    this.debugEl.textContent = `rtt ${Math.round(this.rec.rtt)} ms, correction ${this.rec.lastError.toFixed(1)} px`;
  }

  private transmit(
    dt: number,
    keys: number,
    aim?: Aim,
    vote?: [number, number],
    request?: InputMsg['rq'],
    reading = false,
  ) {
    const { arena } = this;
    this.inputTimer += dt;
    const ack = Math.max(0, this.lastEvent);
    const view = arena.camera.view(arena.screen.width, arena.screen.height);
    const vr = Math.min(MAX_VIEW, Math.ceil(Math.hypot(view.w, view.h) / 2));
    const pending = this.pack.pending; // the oldest action the host has not confirmed, repeated until it does
    const changed =
      keys !== this.sent.keys ||
      this.actCount !== this.sent.act ||
      this.comboCount !== this.sent.cb ||
      ack !== this.sent.ack ||
      vr !== this.sent.vr ||
      (pending?.seq ?? 0) !== this.sent.inv ||
      String(vote) !== this.sent.vt ||
      String(request) !== this.sent.rq ||
      reading !== this.sent.rd;
    if (!changed && this.inputTimer < 1 / INPUT_HZ) return;
    this.inputTimer = 0;
    const msg = {
      k: 'in',
      n: ++this.inputSeq,
      keys,
      act: this.actCount,
      cb: this.comboCount,
      ci: this.comboIndex,
      ack,
      vr,
      ...(aim ? { am: encodeAim(aim) } : {}),
      ...(pending ? { inv: [pending.seq, ...encodeOp(pending.op)] as [number, ...InvOpWire] } : {}),
      ...(vote ? { vt: vote } : {}), // the DM's open vote: this player's choice, repeated like the keys
      ...(request ? { rq: request } : {}), // the latest request to the DM, repeated until the next
      ...(reading ? { rd: 1 as const } : {}), // a quest conversation is open: the host holds foes still
    } as const;
    if (this.session.send(msg)) {
      this.rec.record(msg.n, arena.local.body.x, arena.local.body.y, performance.now());
      this.sent = {
        keys,
        act: this.actCount,
        cb: this.comboCount,
        ack,
        vr,
        inv: pending?.seq ?? 0,
        vt: String(vote),
        rq: String(request),
        rd: reading,
      };
    }
  }

  private applySnapshot(snap: SnapMsg) {
    const { arena, zones } = this;
    // The host says which zone this player is in. If it is a new one, swap the view to it (once it is loaded).
    if (snap.zone !== arena.local.zone) {
      const dest = arena.zones.get(snap.zone);
      if (!dest) {
        zones.holdForLoad();
        void zones.ensure(snap.zone);
        return; // nothing to draw it into yet: the next snapshot will find the zone loaded
      }
      zones.follow(dest);
      this.rec.reset(); // a new map: the old positions mean nothing
    }

    // Everyone the host lists is in the game: here (listed) or in another zone (`away`); anyone else has left.
    const present = new Set<number>(snap.away);
    for (const state of snap.players) {
      const slot = state[0];
      present.add(slot);
      if (slot === arena.local.slot) {
        this.setPlayerState(arena.local, state, this.predicted);
        if (snap.ia !== undefined) {
          this.predicted = true;
          const jump = this.rec.reconcile(snap.ia, state[1], state[2], performance.now(), SPEED * LEAD_S);
          if (jump) arena.local.body.position.set(jump.x, jump.y);
        }
      } else {
        const remote = arena.remotes.get(slot) ?? this.addHiddenRemote(slot);
        zones.place(remote, arena.zone);
        this.setPlayerState(remote, state);
      }
    }
    for (const slot of snap.away) zones.place(arena.remotes.get(slot), null);
    for (const slot of [...arena.remotes.keys()]) {
      if (!present.has(slot)) {
        arena.removeRemote(slot, (p) =>
          arena.effects.add(floatText(p.body.x, p.body.y - 54, `${playerName(slot)} left`, 0xffffff)),
        );
      }
    }

    arena.zone.weather?.setRemote(snap.w); // this biome's own sky
    arena.chests.forEach((c, i) => c.setOpen((snap.chests & (1 << i)) !== 0));
    arena.crops.forEach((c, i) => c.setCode(snap.crops[i] ?? RIPE_CODE));
    const moved = barrelsFromWire(snap.barrels); // a barrel the host does not list is at home
    arena.barrels.forEach((b, i) => {
      const at = moved.get(i);
      if (!at) b.setDown(b.home.x, b.home.y);
      else if (at.facing) {
        b.carrier = -1; // somebody's: the guest only draws it
        b.hold(at.x, at.y, at.facing);
      } else b.setDown(at.x, at.y);
    });
    arena.zone.setFolkRemote(snap.folk); // the people strolling about their posts
    arena.zone.ponds.setLevels(pondsFromWire(snap.ponds)); // drained by someone's drinking, until rain fills them
    if (snap.ground) this.ground.sync(snap.ground); // absent: the same items as before
    for (const [index, ...state] of snap.mobs)
      arena.mobs[index]?.setRemote(
        decodeMob(state),
        arena.players().map((p) => p.body),
      ); // only the mobs the host listed: the rest are out of sight

    const [level, xp, hp, maxHp, mp, maxMp, attack, defense, magic] = snap.me;
    if (maxHp > 0 && maxMp > 0)
      Object.assign(arena.hero.stats, { level, xp, hp, maxHp, mp, maxMp, attack, defense, magic });

    let newest = this.lastEvent;
    for (const wire of snap.events) {
      const ev = decodeEvent(wire); // checked by parseMessage already
      if (!ev || ev.id <= this.lastEvent) continue; // already shown (events repeat across snapshots)
      newest = Math.max(newest, ev.id);
      if (ev.e.type === 'defeat') {
        if (ev.e.player === arena.local.slot) this.announce(DEFEAT_LINES); // that's this machine's player
      } else {
        this.visuals.show(ev.e);
      }
    }
    this.lastEvent = newest;
  }

  /** A player the host just told us about: made now, shown once the state arrives (setPlayerState). */
  private addHiddenRemote(slot: number): Player {
    const remote = this.arena.addRemote(slot);
    remote.body.visible = false;
    return remote;
  }

  private setPlayerState(p: Player, [, x, y, dir, flags]: PlayerSnap, predicted = false) {
    if (!predicted) p.body.face(DIRS[dir] ?? 'down'); // a predicted hero turns from its own keys
    p.flags = flags;
    if (!p.target) p.body.position.set(x, y); // first word from the host: appear there
    p.body.visible = (flags & FLAG.hidden) === 0; // the DM is out of sight while they possess a foe
    p.target = { x, y };
  }

  /** Draw a player from what the host last said (position glides; the rest comes from the flags). */
  private drawPlayer(p: Player, dt: number) {
    const own = this.predicted && p === this.arena.local; // walked by `predict`, corrected by the host's acknowledgements
    if (p.target && !own) glide(p.body, p.target.x, p.target.y, dt);
    const [fx, fy] = DIR_VEC[p.body.facing];
    const swinging = (p.flags & FLAG.swing) !== 0;
    p.body.setOffset(swinging ? fx * 3 : 0, swinging ? fy * 3 : 0);
    p.body.setTint(
      auraTint({
        ward: (p.flags & FLAG.ward) !== 0,
        edge: (p.flags & FLAG.edge) !== 0,
        guard: (p.flags & FLAG.guard) !== 0,
      }),
    );
    p.body.alpha = p.flags & FLAG.invuln && Math.floor(this.arena.clock * 16) % 2 === 0 ? 0.35 : 1;
    p.body.animate(dt * 1000, own ? this.predMoving : (p.flags & FLAG.moving) !== 0);
  }
}
