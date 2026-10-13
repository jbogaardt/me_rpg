import type { Player } from '../../entities/Player';
import type { Dialog } from '../../hud/Dialog';
import type { Menu } from '../../hud/Menu';
import type { ShopCounter } from '../../hud/ShopCounter';
import type { DoMsg, LooksMsg, PackMsg } from '../../net/protocol';
import type { Session } from '../../net/session';
import { applyInvOp, decodeOp, gearCodes, itemFromCode, packCodes, setGear, setPack } from '../../systems/inventory';
import type { InvOp, Result } from '../../systems/inventory';
import { SHOPS } from '../../systems/shops';
import {
  loadoutCode,
  loadoutFromCode,
  nextSkill,
  setLoadout,
  skillMask,
  skillsFromMask,
  TRAINER,
  trainerTalk,
  type Skill,
  type SkillId,
} from '../../systems/skills';
import { GIVERS, linesFor, questFromWire, questWire, talk, type Talk } from '../../systems/quests';
import { localTrader, remoteTrader, type Outcome, type Trader } from '../../systems/trader';
import { CELL } from '../../map/types';
import type { Arena } from './Arena';
import { KEEPER_REACH } from './constants';
import type { Ground } from './Ground';

const PACK_RESEND = 1; // seconds between repeats of a friend's pack and everyone's gear (a lost packet is not resent)

/**
 * A player's gold, pack and gear in a co-op game. The host owns every hero, so a friend only sends wishes (an Inventory
 * action, or a buy/sell/wear/use at a counter) and the host does them (`handleRequests`) and tells each friend the result
 * (`send`); the friend applies what it is told (`applyPack`, `applyLooks`) and repeats an action until the host confirms it.
 * In solo and on the host the local player's own actions are done directly (`localOp`, `trader`).
 */
export class PackSync {
  /** Guest: Inventory actions the host has not confirmed yet, oldest first. */
  private pendingOps: { seq: number; op: InvOp }[] = [];
  private invSeq = 0;
  private doSeq = 0; // guest: numbers its requests to the host
  private lastPackSig = ''; // guest: the last pack the host sent, to redraw the menu only when it changed
  private lastSay = -1; // guest: the newest answer from the host already shown
  private packSeq = 0; // host: numbers the pack and looks messages
  private packTimer = 0;
  private sentPack = new Map<number, string>(); // host: what each friend was last told about their pack
  private sentLooks = '';
  /** Set by the scene: a guest's action should be sent to the host now rather than at the next regular send. */
  sendSoon: () => void = () => {};
  /** Set by the scene (host and solo): send a player to a training ground; returns why not, or null when they are going. */
  startTrial: (p: Player, skill: Skill) => string | null = () => 'Training is not available.';
  /** Set by the scene: celebrate a player's level-up (a reward's XP can give one). */
  levelUp: (p: Player) => void = () => {};

  constructor(
    private arena: Arena,
    private session: Session,
    private ui: { shop: ShopCounter; menu: Menu; dialog: Dialog },
    private ground: Ground,
  ) {}

  // --- The local player ---

  /** Who carries out trades for the local player: this machine, or the host (a guest's gold and pack are the host's). */
  trader(): Trader {
    const { arena } = this;
    if (arena.role !== 'client') return localTrader(arena.hero);
    return remoteTrader(({ op, item, shop }) => {
      this.session.send({ k: 'do', n: ++this.doSeq, op, item, shop });
    });
  }

  /**
   * The local player speaks to a quest giver. Solo and the host settle it here and show the lines at once; a guest asks the
   * host, whose answer (the story key, `say.story`) arrives with the next `pack` message.
   */
  talkToGiver(giver: string) {
    const { arena } = this;
    if (arena.role === 'client') {
      this.session.send({ k: 'do', n: ++this.doSeq, op: 'talk', item: 0, shop: giver });
      return;
    }
    const told = talk(arena.hero);
    this.afterTalk(arena.local, told);
    this.ui.dialog.say(told.lines);
  }

  /**
   * The local player chooses which of their skills are ready (the Magic tab). Solo and the host change their hero at once; a
   * guest asks the host, whose answer arrives with the next `pack` message. Returns false for a choice that is not allowed.
   */
  setLoadout(wanted: SkillId[]): boolean {
    const { arena } = this;
    if (arena.role === 'client') {
      this.session.send({ k: 'do', n: ++this.doSeq, op: 'loadout', item: loadoutCode(wanted), shop: '' });
      return true;
    }
    return setLoadout(arena.hero, wanted);
  }

  /** A co-op guest asks the host to send them to the training ground (the host checks everything). */
  askTrial(giver: string) {
    this.session.send({ k: 'do', n: ++this.doSeq, op: 'train', item: 0, shop: giver });
  }

  private afterTalk(p: Player, told: Talk) {
    if (told.gear) this.arena.refreshLook(p);
    if (told.levels) this.levelUp(p);
  }

  /** An Inventory action by the local player: done here, or (a co-op guest) done here at once and also sent to the host. */
  localOp(op: InvOp): Result {
    const { arena } = this;
    const dropping = op.t === 'dropPack' || op.t === 'dropWorn';
    if (dropping && this.ground.full) return { ok: false, reason: 'Too many items are lying around.' };
    const result = applyInvOp(arena.hero, op);
    if (!result.ok) return result;
    arena.refreshLook();
    if (arena.role === 'client') {
      this.pendingOps.push({ seq: ++this.invSeq, op });
      this.sendSoon();
    } else if (result.dropped) {
      this.ground.drop(arena.local, result.dropped);
    }
    return result;
  }

  /** The oldest Inventory action the host has not confirmed (a guest repeats it until it does). */
  get pending(): { seq: number; op: InvOp } | undefined {
    return this.pendingOps[0];
  }

  /** Forget everything in flight (a co-op game starts or ends). */
  reset() {
    this.pendingOps = [];
    this.invSeq = 0;
    this.lastSay = -1;
  }

  // --- Host ---

  /** Host: carry out what each friend asked to do with their own gold and pack. The guest only sends wishes; these checks are the rules. */
  handleRequests() {
    const { arena } = this;
    for (const p of arena.remotes.values()) {
      for (const request of this.session.takeTrades(p.slot)) {
        const out = this.tradeFor(p, request);
        p.reply = { id: request.n, text: out.text, ok: out.ok, ...(out.story ? { story: out.story } : {}) };
        if (out.gear) arena.refreshLook(p);
      }
      arena.inZone(arena.zoneOf(p), () => this.applyPeerInv(p));
    }
  }

  private tradeFor(p: Player, { op, item: code, shop: shopId }: DoMsg): Outcome {
    if (op === 'talk') return this.talkFor(p, shopId);
    if (op === 'train') return this.trainFor(p, shopId);
    if (op === 'loadout') {
      const wanted = loadoutFromCode(code);
      return wanted && setLoadout(p.hero, wanted)
        ? { ok: true, text: '' }
        : { ok: false, text: 'You cannot ready that' };
    }
    const item = itemFromCode(code);
    if (!item) return { ok: false, text: 'Unknown item' };
    const trader = localTrader(p.hero);
    if (op === 'wear') return trader.wear(item) ?? { ok: false, text: '' };
    if (op === 'use') return trader.use(item) ?? { ok: false, text: '' };
    // Buying and selling happen at a counter: the player has to be standing at that shop's keeper.
    const shop = SHOPS[shopId];
    const keeper = this.arena.zoneOf(p).keepers.find((k) => k.shop === shopId);
    if (!shop || !keeper) return { ok: false, text: 'Unknown shop' };
    if (Math.hypot(p.body.x - keeper.body.x, p.body.y - keeper.body.y) > KEEPER_REACH + CELL) {
      return { ok: false, text: 'Too far from the counter' };
    }
    return (op === 'buy' ? trader.buy(shop, item) : trader.sell(shop, item)) ?? { ok: false, text: '' };
  }

  /** Host: a friend speaks to a quest giver (they must be beside one); the answer tells them which lines to read. */
  private talkFor(p: Player, giverId: string): Outcome {
    const giver = this.arena.zoneOf(p).givers.find((g) => g.giver === giverId);
    if (!giver || !GIVERS[giverId]) return { ok: false, text: 'Nobody to talk to' };
    if (Math.hypot(p.body.x - giver.body.x, p.body.y - giver.body.y) > KEEPER_REACH + CELL) {
      return { ok: false, text: 'Too far away' };
    }
    const told = talk(p.hero);
    if (told.levels) this.levelUp(p);
    return { ok: true, text: '', gear: told.gear, story: told.key };
  }

  /** Host: a friend asks the training wizard for their trial (they must be beside the trainer, and ready for it). */
  private trainFor(p: Player, giverId: string): Outcome {
    const giver = this.arena.zoneOf(p).givers.find((g) => g.giver === giverId);
    if (giverId !== TRAINER || !giver) return { ok: false, text: 'Nobody to train you' };
    if (Math.hypot(p.body.x - giver.body.x, p.body.y - giver.body.y) > KEEPER_REACH + CELL) {
      return { ok: false, text: 'Too far away' };
    }
    const { trial } = trainerTalk(p.hero);
    if (!trial) return { ok: false, text: nextSkill(p.hero) ? 'You are not ready yet' : 'Nothing more to learn' };
    const refused = this.startTrial(p, trial);
    return refused ? { ok: false, text: refused } : { ok: true, text: '' };
  }

  /** Host: do the Inventory action a friend is asking for (each is numbered, and done once and in order). */
  private applyPeerInv(p: Player) {
    const msg = this.session.peerInput(p.slot)?.inv;
    if (!msg || msg[0] !== p.seenInv + 1) return;
    p.seenInv = msg[0];
    const op = decodeOp([msg[1], msg[2], msg[3]]);
    if (!op) return;
    if ((op.t === 'dropPack' || op.t === 'dropWorn') && this.ground.full) return;
    const result = applyInvOp(p.hero, op);
    if (!result.ok) return;
    this.arena.refreshLook(p);
    if (result.dropped) this.ground.drop(p, result.dropped);
  }

  /** Host: tell each friend about their gold and pack when they change, and now and then in case a packet was lost. */
  send(dt: number) {
    const { arena } = this;
    if (arena.remotes.size === 0) return;
    this.packTimer += dt;
    const periodic = this.packTimer >= PACK_RESEND;
    if (periodic) this.packTimer = 0;
    const looks = arena.everyone().map((p) => [p.slot, ...gearCodes(p.hero)]);
    const looksSig = JSON.stringify(looks);
    const looksChanged = looksSig !== this.sentLooks;
    this.sentLooks = looksSig;
    for (const [slot, p] of arena.remotes) {
      const body = {
        gold: p.hero.gold,
        worn: gearCodes(p.hero),
        items: packCodes(p.hero),
        ack: p.seenInv,
        quests: questWire(p.hero.quests),
        skills: skillMask(p.hero),
        loadout: loadoutCode(p.hero.loadout),
        needs: [Math.ceil(p.hero.needs.food), Math.ceil(p.hero.needs.water)] as [number, number],
        ...(p.reply ? { say: p.reply } : {}),
      };
      const sig = JSON.stringify(body);
      if (periodic || sig !== this.sentPack.get(slot)) {
        this.sentPack.set(slot, sig);
        this.session.sendTo(slot, { k: 'pack', n: ++this.packSeq, ...body });
      }
      if (periodic || looksChanged) this.session.sendTo(slot, { k: 'looks', n: ++this.packSeq, players: looks });
    }
  }

  /** Host: a friend left; forget what they were told. */
  forget(slot: number) {
    this.sentPack.delete(slot);
  }

  // --- Guest ---

  /** Guest: the host's word on this player's gold, pack and gear. */
  applyPack(pack: PackMsg) {
    const { arena } = this;
    const hero = arena.hero;
    const sig = JSON.stringify([pack.gold, pack.worn, pack.items, pack.quests, pack.skills, pack.loadout, pack.needs]);
    hero.quests = questFromWire(pack.quests) ?? hero.quests;
    hero.skills = skillsFromMask(pack.skills);
    hero.loadout = (loadoutFromCode(pack.loadout) ?? []).filter((id) => hero.skills.includes(id));
    const worn = gearCodes(hero).join();
    hero.gold = pack.gold;
    hero.needs = { food: pack.needs[0], water: pack.needs[1] };
    this.pendingOps = this.pendingOps.filter((o) => o.seq > pack.ack);
    if (this.pendingOps.length === 0) {
      // Take the host's word for the gear and pack, once it has done every action sent (until then ours is ahead of it).
      setGear(hero, pack.worn);
      setPack(hero, pack.items);
    }
    if (gearCodes(hero).join() !== worn) arena.refreshLook();
    if (pack.say && pack.say.id > this.lastSay) {
      this.lastSay = pack.say.id;
      const story = pack.say.story ? linesFor(pack.say.story) : null;
      if (story) this.ui.dialog.say(story);
      else this.ui.shop.report({ ok: pack.say.ok, text: pack.say.text });
    }
    if (sig === this.lastPackSig) return;
    this.lastPackSig = sig;
    this.ui.shop.refresh(hero); // the answer to a click, or a drop from a chest
    this.ui.menu.refresh(hero);
  }

  /** Guest: what the other players wear. */
  applyLooks({ players }: LooksMsg) {
    const { arena } = this;
    for (const [slot = -1, ...codes] of players) {
      const remote = arena.remotes.get(slot);
      if (!remote) continue;
      const before = gearCodes(remote.hero).join();
      setGear(remote.hero, codes);
      if (gearCodes(remote.hero).join() !== before) arena.refreshLook(remote);
    }
  }
}
