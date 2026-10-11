import type { Menu } from '../../hud/Menu';
import type { ShopCounter } from '../../hud/ShopCounter';
import type { TradeUi } from '../../hud/Trade';
import type { TradeMsg, TrMsg } from '../../net/protocol';
import type { Session } from '../../net/session';
import { PLAYER_COLORS, playerName } from '../../systems/looks';
import {
  TRADE_START,
  TradeBook,
  viewFromWire,
  viewToWire,
  type Note,
  type TradeCommand,
  type TradeView,
} from '../../systems/trade';
import type { Arena } from './Arena';

const TRADE_RESEND = 0.25; // seconds between a friend's repeats of trade commands the host has not yet acknowledged
const MAX_TRADE_QUEUE = 60;
const SEND_RESEND = 1; // seconds between the host's repeats of a friend's trade state when nothing changed

/**
 * Player-to-player trading in a co-op game (the rules are systems/trade.ts). The host's `TradeBook` is the only authority:
 * the host's own player sends it commands directly, a friend sends numbered commands that it repeats until the host
 * acknowledges them, and the host tells each friend the state of their trade. This also feeds the trade screens (for the
 * local player, in every role) and shows the notes the book posts.
 */
export class Trading {
  private book: TradeBook;
  private seq = 0; // guest: numbers its trade commands (1, 2, 3...)
  private queue: TrMsg[] = []; // guest: commands the host has not acknowledged yet (repeated until it does)
  private timer = 0;
  private view: TradeView | null = null; // guest: the host's word on this player's trade
  private note: Note | null = null; // guest: the newest note the host sent
  private lastNote = -1; // the newest trade note already shown
  private msgSeq = 0; // host: numbers trade messages
  private sentTrade = new Map<number, string>(); // host: what each friend was last told about their trade
  private sendTimer = 0;
  private wasOpen = false;

  constructor(
    private arena: Arena,
    private session: Session,
    private ui: { trade: TradeUi; menu: Menu; shop: ShopCounter },
  ) {
    this.book = new TradeBook({
      hero: (slot) => arena.players().find((p) => p.slot === slot)?.hero,
      distance: (a, b) => {
        const [pa, pb] = [a, b].map((slot) => arena.players().find((p) => p.slot === slot));
        return pa && pb ? Math.hypot(pa.body.x - pb.body.x, pa.body.y - pb.body.y) : null;
      },
      name: playerName,
    });
    ui.trade.send = (cmd) => this.command(cmd);
    ui.trade.onAsked = () => ui.menu.close();
  }

  /** A command from this player's trade UI: the host's book takes it directly; a friend sends it to the host. */
  command(cmd: TradeCommand) {
    const { arena } = this;
    if (arena.role === 'host') {
      this.book.apply(0, cmd);
    } else if (arena.role === 'client' && this.queue.length < MAX_TRADE_QUEUE) {
      const msg: TrMsg = { k: 'tr', n: ++this.seq, cmd };
      this.queue.push(msg);
      this.session.send(msg);
    }
  }

  /** Host: do what the friends asked of the trade book, then let it end trades whose players walked apart. */
  handleSteps(dt: number) {
    for (const p of this.arena.remotes.values()) {
      for (const step of this.session.takeTradeSteps(p.slot)) this.book.apply(p.slot, step.cmd);
    }
    this.book.update(dt);
  }

  /** Host: tell each friend about their trade (and which of their commands it has taken) when it changes, and now and then. */
  send(dt: number) {
    this.sendTimer += dt;
    const periodic = this.sendTimer >= SEND_RESEND;
    if (periodic) this.sendTimer = 0;
    for (const slot of this.arena.remotes.keys()) {
      const view = this.book.viewFor(slot);
      const note = this.book.noteFor(slot);
      const body = {
        ack: this.session.tradeAck(slot),
        view: view ? viewToWire(view) : null,
        ...(note ? { note } : {}),
      };
      const sig = JSON.stringify(body);
      if (!periodic && sig === this.sentTrade.get(slot)) continue;
      this.sentTrade.set(slot, sig);
      this.session.sendTo(slot, { k: 'trade', n: ++this.msgSeq, ...body });
    }
  }

  /** Host: a friend left; their trade (if any) ends. */
  drop(slot: number) {
    this.sentTrade.delete(slot);
    this.book.drop(slot);
  }

  /** Guest: the host's word on this player's trade; whatever it has taken in order no longer needs repeating. */
  apply(msg: TradeMsg) {
    this.view = msg.view ? viewFromWire(msg.view) : null;
    this.note = msg.note ?? null;
    this.queue = this.queue.filter((m) => m.n > msg.ack);
  }

  /** Every frame online: feed the trade screens, show notes, and (guest) repeat commands the host has not acknowledged. */
  sync(dt: number, online: boolean) {
    const { trade, menu, shop } = this.ui;
    const { arena } = this;
    if (!online) return;
    const guest = arena.role === 'client';
    if (guest) {
      this.timer += dt;
      if (this.timer >= TRADE_RESEND && this.queue.length) {
        this.timer = 0;
        for (const msg of this.queue) this.session.send(msg);
      }
    }
    const view = guest ? this.view : this.book.viewFor(0);
    const note = guest ? this.note : this.book.noteFor(0);
    if (note && note.id > this.lastNote) {
      this.lastNote = note.id;
      trade.toast(note.text, note.ok);
    }
    const contacts = [...arena.remotes.values()]
      .filter((p) => p.body.visible)
      .map((p) => ({
        slot: p.slot,
        color: PLAYER_COLORS[p.slot] ?? 0xffffff,
        near: Math.hypot(p.body.x - arena.player.x, p.body.y - arena.player.y) <= TRADE_START,
      }));
    trade.sync({ hero: arena.hero, view, pending: guest && this.queue.length > 0, contacts });
    if (trade.open) {
      menu.close(); // the window takes over
      shop.close();
    }
    if (this.wasOpen && !trade.open) {
      // A trade ended: gold and pack may have changed under the other screens.
      menu.refresh(arena.hero);
      shop.refresh(arena.hero);
    }
    this.wasOpen = trade.open;
  }

  /** Forget all trade state (a co-op game starts or ends). */
  reset() {
    this.book.clear();
    this.seq = 0;
    this.queue = [];
    this.view = null;
    this.note = null;
    this.lastNote = -1;
    this.timer = 0;
    this.sentTrade.clear();
    this.wasOpen = false;
    this.ui.trade.reset();
  }
}
