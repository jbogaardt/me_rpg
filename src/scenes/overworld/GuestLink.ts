import type { ViewRect } from '../../core/camera';
import { DIRS, DIR_VEC } from '../../core/direction';
import { glide } from '../../core/interp';
import { floatText } from '../../entities/effects';
import type { Player } from '../../entities/Player';
import { decodeMob } from '../../net/mobWire';
import { FLAG, MAX_VIEW, type PlayerSnap, type SnapMsg } from '../../net/protocol';
import type { Session } from '../../net/session';
import type { Stats } from '../../systems/combat';
import { heroOutfit, playerName, playerOutfit } from '../../systems/looks';
import type { Arena } from './Arena';
import { DEFEAT_LINES } from './constants';
import type { Visuals } from './Visuals';

const INPUT_HZ = 30; // guest -> host controls (also sent at once when they change)

/**
 * A co-op guest's side of the game: no simulation. It draws what the host's snapshots say (the players, the mobs that
 * are near, the chests, the one-shot events) and sends the host this player's controls, plus the newest event it has
 * shown (so the host stops repeating them) and how far it can see (so the host only sends the mobs it could see).
 */
export class GuestLink {
  private lastEvent = -1; // newest event already shown
  private inputTimer = 0;
  private inputSeq = 0;
  private actCount = 0; // action / magic presses so far, sent as counters
  private magCount = 0;
  private sent = { keys: -1, act: -1, mag: -1, ack: -1, vr: -1 };
  private solo: { stats: Stats; name: string } | null = null; // the solo hero, restored on disconnect

  constructor(
    private arena: Arena,
    private session: Session,
    private visuals: Visuals,
    private view: () => ViewRect,
    /** Say something to the player at this keyboard (a dialog). */
    private announce: (lines: string[]) => void,
  ) {}

  /** This game just became a guest: this machine's hero becomes the player the host seated it as. */
  enter() {
    const { arena } = this;
    const { local } = arena;
    const slot = this.session.slot;
    this.solo = { stats: { ...local.hero.stats }, name: local.hero.name };
    local.setSlot(slot);
    local.hero.name = playerName(slot);
    local.body.setSheet(arena.wardrobe.sheet(playerOutfit(slot, local.hero)));
    local.target = null;
    this.lastEvent = -1;
    this.actCount = this.magCount = this.inputSeq = 0;
    this.sent = { keys: -1, act: -1, mag: -1, ack: -1, vr: -1 };
    this.inputTimer = 0;
    arena.applyTags();
  }

  /** The game stopped being a guest: back to the solo hero, standing where it ended up, with the mobs on their own again. */
  leave() {
    const { arena } = this;
    const { local } = arena;
    for (const slot of [...arena.remotes.keys()]) arena.removeRemote(slot, () => {});
    local.body.setTag(null);
    if (this.solo) Object.assign(local.hero.stats, this.solo.stats);
    local.hero.name = this.solo?.name ?? 'Hero';
    this.solo = null;
    local.setSlot(0);
    local.body.setSheet(arena.wardrobe.sheet(heroOutfit(local.hero)));
    local.target = null;
    local.flags = 0;
    local.invuln = 0;
    local.knock = { x: 0, y: 0 };
    local.vel = { x: 0, y: 0 };
    local.body.alpha = 1;
    local.body.setOffset(0, 0);
    for (const mob of arena.mobs) mob.release();
    arena.effects.add(floatText(local.body.x, local.body.y - 54, 'Disconnected', 0xffffff));
  }

  /** The action button was pressed (counted, so a lost packet cannot lose a press). */
  pressAction() {
    this.actCount++;
  }

  pressMagic() {
    this.magCount++;
  }

  /** Show what the host last said. */
  update(dt: number) {
    const snap = this.session.takeSnapshot();
    if (snap) this.applySnapshot(snap);
    for (const p of this.arena.players()) this.drawPlayer(p, dt);
    for (const mob of this.arena.mobs) mob.updateRemote(dt);
  }

  /** Send the controls: when they change, and otherwise at INPUT_HZ so a lost packet is soon corrected. */
  sendInput(dt: number, keys: number) {
    this.inputTimer += dt;
    const ack = Math.max(0, this.lastEvent);
    const view = this.view();
    const vr = Math.min(MAX_VIEW, Math.ceil(Math.hypot(view.w, view.h) / 2));
    const changed =
      keys !== this.sent.keys ||
      this.actCount !== this.sent.act ||
      this.magCount !== this.sent.mag ||
      ack !== this.sent.ack ||
      vr !== this.sent.vr;
    if (!changed && this.inputTimer < 1 / INPUT_HZ) return;
    this.inputTimer = 0;
    const msg = { k: 'in', n: ++this.inputSeq, keys, act: this.actCount, mag: this.magCount, ack, vr } as const;
    if (this.session.send(msg)) this.sent = { keys, act: this.actCount, mag: this.magCount, ack, vr };
  }

  private applySnapshot(snap: SnapMsg) {
    const { arena } = this;
    // Everyone the host lists is in the game; anyone it no longer lists has left.
    const present = new Set<number>();
    for (const state of snap.players) {
      const slot = state[0];
      present.add(slot);
      if (slot === arena.local.slot) this.setPlayerState(arena.local, state);
      else this.setPlayerState(arena.remotes.get(slot) ?? this.addHiddenRemote(slot), state);
    }
    for (const slot of [...arena.remotes.keys()]) {
      if (!present.has(slot)) {
        arena.removeRemote(slot, (p) =>
          arena.effects.add(floatText(p.body.x, p.body.y - 54, `${playerName(slot)} left`, 0xffffff)),
        );
      }
    }

    arena.chests.forEach((c, i) => c.setOpen((snap.chests & (1 << i)) !== 0));
    for (const [index, ...state] of snap.mobs) arena.mobs[index]?.setRemote(decodeMob(state)); // only the mobs the host listed: the rest are out of sight

    const [level, xp, hp, maxHp, mp, maxMp, attack, defense, magic] = snap.me;
    if (maxHp > 0 && maxMp > 0)
      Object.assign(arena.local.hero.stats, { level, xp, hp, maxHp, mp, maxMp, attack, defense, magic });

    let newest = this.lastEvent;
    for (const { id, e } of snap.events) {
      if (id <= this.lastEvent) continue; // already shown (events repeat across snapshots)
      newest = Math.max(newest, id);
      if (e.type === 'defeat') {
        if (e.player === arena.local.slot) this.announce(DEFEAT_LINES); // that's this machine's player
      } else {
        this.visuals.show(e);
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

  private setPlayerState(p: Player, [, x, y, dir, flags]: PlayerSnap) {
    p.body.face(DIRS[dir] ?? 'down');
    p.flags = flags;
    if (!p.target) p.body.position.set(x, y); // first word from the host: appear there
    p.body.visible = true;
    p.target = { x, y };
  }

  /** Draw a player from what the host last said (position glides; the rest comes from the flags). */
  private drawPlayer(p: Player, dt: number) {
    if (p.target) glide(p.body, p.target.x, p.target.y, dt);
    const [fx, fy] = DIR_VEC[p.body.facing];
    const swinging = (p.flags & FLAG.swing) !== 0;
    p.body.setOffset(swinging ? fx * 3 : 0, swinging ? fy * 3 : 0);
    p.body.alpha = p.flags & FLAG.invuln && Math.floor(this.arena.clock * 16) % 2 === 0 ? 0.35 : 1;
    p.body.animate(dt * 1000, (p.flags & FLAG.moving) !== 0);
  }
}
