// Player-to-player trading in a co-op game (Pixi-free). The host owns every hero, so it also owns every trade: a
// `TradeBook` is the host's record of who has asked whom, what each side has put on the table, and who has said "accept".
// Players (the host included) only ever send `TradeCommand`s; the book checks each against the rules and the heroes.
//
// A trade goes: one player asks (both must be close), the other accepts or denies, then both put items from their pack
// and some gold on the table. Changing either side's offer clears both "accept" marks; when both sides have accepted, the
// goods change hands at once or not at all.

import type { Hero, Item } from './combat';
import { itemCode, itemFromCode, packSize } from './inventory';

/** Players may start a trade within this distance (pixels; 3 cells), and it ends if they drift beyond TRADE_KEEP (5 cells). */
export const TRADE_START = 96;
export const TRADE_KEEP = 160;
/** A request nobody answers lapses after this many seconds. */
export const REQUEST_SECONDS = 30;
/** Most distinct things a side can put on the table. */
export const MAX_OFFER_ITEMS = 12;

/** What a player may ask of the book. `items` are item codes (systems/inventory.ts), `with` a player number. */
export type TradeCommand =
  | { c: 'ask'; with: number }
  | { c: 'yes' }
  | { c: 'no' }
  | { c: 'offer'; items: number[]; gold: number }
  | { c: 'ready'; on: boolean }
  | { c: 'cancel' };

/** What the book needs to know about the world. */
export interface TradeEnv {
  /** The hero of this player number, or undefined when nobody is there. */
  hero(slot: number): Hero | undefined;
  /** Distance in pixels between two players, or null when either is missing. */
  distance(a: number, b: number): number | null;
  name(slot: number): string;
}

export interface Side {
  items: Item[];
  gold: number;
  ready: boolean;
}

/** One player's view of their trade. `asking`: waiting for them to answer; `incoming`: they must answer; `open`: bargaining. */
export interface TradeView {
  phase: 'asking' | 'incoming' | 'open';
  with: number;
  mine: Side;
  theirs: Side;
}

/** What the book tells a player, shown once by its id. */
export interface Note {
  id: number;
  text: string;
  ok: boolean;
}

interface Trade {
  /** The player who asked, and the one asked. */
  from: number;
  to: number;
  open: boolean;
  age: number; // seconds waiting for an answer
  sides: Record<number, Side>;
}

const emptySide = (): Side => ({ items: [], gold: 0, ready: false });

/** How many of each item `items` holds, by item. */
function count(items: readonly Item[]): Map<Item, number> {
  const counts = new Map<Item, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

/** Can the hero really give this: every item in the pack (as many as listed) and enough gold? */
export function canGive(hero: Hero, side: Pick<Side, 'items' | 'gold'>): boolean {
  if (side.gold > hero.gold || side.gold < 0 || !Number.isInteger(side.gold)) return false;
  const owned = count(hero.pack);
  for (const [item, n] of count(side.items)) if ((owned.get(item) ?? 0) < n) return false;
  return true;
}

export class TradeBook {
  private trades: Trade[] = [];
  private notes = new Map<number, Note>();
  private noteId = 0;

  constructor(private env: TradeEnv) {}

  /** Is this player in a trade or waiting on a request (either way round)? */
  busy(slot: number): boolean {
    return this.find(slot) !== undefined;
  }

  /** The newest thing this player should be told (it is the same one until something new happens). */
  noteFor(slot: number): Note | null {
    return this.notes.get(slot) ?? null;
  }

  /** What `slot` sees of their trade, or null when they have none. */
  viewFor(slot: number): TradeView | null {
    const t = this.find(slot);
    if (!t) return null;
    const other = t.from === slot ? t.to : t.from;
    const copy = (s: Side): Side => ({ items: [...s.items], gold: s.gold, ready: s.ready });
    return {
      phase: t.open ? 'open' : t.from === slot ? 'asking' : 'incoming',
      with: other,
      mine: copy(t.sides[slot] ?? emptySide()),
      theirs: copy(t.sides[other] ?? emptySide()),
    };
  }

  apply(slot: number, cmd: TradeCommand): void {
    if (!this.env.hero(slot)) return;
    switch (cmd.c) {
      case 'ask':
        return this.ask(slot, cmd.with);
      case 'yes':
        return this.answer(slot, true);
      case 'no':
        return this.answer(slot, false);
      case 'offer':
        return this.offer(slot, cmd.items, cmd.gold);
      case 'ready':
        return this.ready(slot, cmd.on);
      case 'cancel': {
        const t = this.find(slot);
        if (t) this.end(t, slot, `${this.env.name(slot)} ${t.open ? 'cancelled the trade' : 'withdrew the request'}`);
      }
    }
  }

  /** Called every frame on the host: lapse old requests and end trades whose players walked apart or left. */
  update(dt: number): void {
    for (const t of [...this.trades]) {
      const [a, b] = [t.from, t.to];
      if (!this.env.hero(a) || !this.env.hero(b)) {
        this.end(t, undefined, 'The other player is gone');
        continue;
      }
      const d = this.env.distance(a, b);
      if (d === null || d > (t.open ? TRADE_KEEP : TRADE_START * 2)) {
        this.end(t, undefined, t.open ? 'Trade cancelled: you moved too far apart' : 'Too far away');
        continue;
      }
      if (!t.open) {
        t.age += dt;
        if (t.age >= REQUEST_SECONDS) this.end(t, undefined, 'No answer to the trade request');
      }
    }
  }

  /** A player left the game: their trade (if any) ends. */
  drop(slot: number): void {
    const t = this.find(slot);
    if (t) this.end(t, slot, 'The other player left');
    this.notes.delete(slot);
  }

  clear(): void {
    this.trades = [];
    this.notes.clear();
  }

  // --- Rules ---

  private ask(from: number, to: number) {
    if (from === to || !this.env.hero(to)) return;
    // Both asked each other at once: that is a yes.
    const mutual = this.trades.find((t) => !t.open && t.from === to && t.to === from);
    if (mutual) return this.answer(from, true);
    if (this.busy(from)) return this.tell(from, 'Finish or cancel your current trade first', false);
    if (this.busy(to)) return this.tell(from, `${this.env.name(to)} is busy`, false);
    const d = this.env.distance(from, to);
    if (d === null || d > TRADE_START) return this.tell(from, `${this.env.name(to)} is too far away`, false);
    this.trades.push({
      from,
      to,
      open: false,
      age: 0,
      sides: { [from]: emptySide(), [to]: emptySide() },
    });
    this.tell(to, `${this.env.name(from)} wants to trade`, true);
  }

  private answer(slot: number, yes: boolean) {
    const t = this.trades.find((x) => !x.open && x.to === slot);
    if (!t) return;
    if (!yes) return this.end(t, slot, `${this.env.name(slot)} said no`);
    const d = this.env.distance(t.from, t.to);
    if (d === null || d > TRADE_START * 2) return this.end(t, slot, 'Too far away');
    t.open = true;
    this.tell(t.from, `${this.env.name(slot)} accepted. Make your offer`, true);
    this.tell(t.to, 'Make your offer', true);
  }

  private offer(slot: number, codes: number[], gold: number) {
    const t = this.find(slot);
    const hero = this.env.hero(slot);
    const side = t?.sides[slot];
    if (!t?.open || !hero || !side) return;
    const items = codes.slice(0, MAX_OFFER_ITEMS).flatMap((c) => itemFromCode(c) ?? []);
    const wanted = { items, gold: Number.isFinite(gold) ? Math.floor(gold) : 0 };
    // Only what the player really has goes on the table (the rest of a bad offer is left out).
    const owned = count(hero.pack);
    const fit: Item[] = [];
    for (const item of items) {
      const left = (owned.get(item) ?? 0) - 1;
      if (left < 0) continue;
      owned.set(item, left);
      fit.push(item);
    }
    side.items = fit;
    side.gold = Math.max(0, Math.min(hero.gold, wanted.gold));
    for (const s of Object.values(t.sides)) s.ready = false; // a changed offer must be looked at again
  }

  private ready(slot: number, on: boolean) {
    const t = this.find(slot);
    const side = t?.sides[slot];
    if (!t?.open || !side) return;
    side.ready = on;
    if (on && Object.values(t.sides).every((s) => s.ready)) this.settle(t);
  }

  /** Both said yes: swap, or change nothing and say why. */
  private settle(t: Trade) {
    const a = this.env.hero(t.from);
    const b = this.env.hero(t.to);
    const [sa, sb] = [t.sides[t.from], t.sides[t.to]];
    const fail = (text: string) => {
      for (const s of Object.values(t.sides)) s.ready = false;
      this.tell(t.from, text, false);
      this.tell(t.to, text, false);
    };
    if (!a || !b || !sa || !sb) return;
    const d = this.env.distance(t.from, t.to);
    if (d === null || d > TRADE_KEEP) return this.end(t, undefined, 'Trade cancelled: you moved too far apart');
    if (!canGive(a, sa) || !canGive(b, sb)) return fail('An offer changed: look it over again');
    // Pack room after the swap (a pack that is already over-full only has to get no fuller).
    const fits = (hero: Hero, gives: Item[], gets: Item[]) =>
      hero.pack.length - gives.length + gets.length <= Math.max(packSize(hero), hero.pack.length);
    if (!fits(a, sa.items, sb.items)) return fail(`${this.env.name(t.from)}'s pack is too full for that`);
    if (!fits(b, sb.items, sa.items)) return fail(`${this.env.name(t.to)}'s pack is too full for that`);

    this.give(a, b, sa);
    this.give(b, a, sb);
    this.trades.splice(this.trades.indexOf(t), 1);
    this.tell(t.from, 'Trade complete', true);
    this.tell(t.to, 'Trade complete', true);
  }

  /** Move a side's goods from one hero to the other. */
  private give(from: Hero, to: Hero, side: Side) {
    for (const item of side.items) {
      from.pack.splice(from.pack.indexOf(item), 1);
      to.pack.push(item);
    }
    from.gold -= side.gold;
    to.gold += side.gold;
  }

  /** End a trade. `by` hears nothing special; the other side is told why. */
  private end(t: Trade, by: number | undefined, text?: string) {
    this.trades.splice(this.trades.indexOf(t), 1);
    for (const slot of [t.from, t.to]) {
      if (slot === by) {
        // The one who ended it sees a plain confirmation (a denied request needs none).
        if (t.open || slot === t.from) this.tell(slot, 'Trade cancelled', true);
      } else if (text) {
        this.tell(slot, text, false);
      }
    }
  }

  private find(slot: number): Trade | undefined {
    return this.trades.find((t) => t.from === slot || t.to === slot);
  }

  private tell(slot: number, text: string, ok: boolean) {
    this.notes.set(slot, { id: ++this.noteId, text, ok });
  }
}

// --- On the wire (src/net/protocol.ts): a view with items as codes ---

export interface SideWire {
  items: number[];
  gold: number;
  ready: boolean;
}

export interface TradeViewWire {
  phase: TradeView['phase'];
  with: number;
  mine: SideWire;
  theirs: SideWire;
}

const sideToWire = (s: Side): SideWire => ({ items: s.items.map(itemCode), gold: s.gold, ready: s.ready });
const sideFromWire = (s: SideWire): Side => ({
  items: s.items.flatMap((c) => itemFromCode(c) ?? []),
  gold: s.gold,
  ready: s.ready,
});

export const viewToWire = (v: TradeView): TradeViewWire => ({
  phase: v.phase,
  with: v.with,
  mine: sideToWire(v.mine),
  theirs: sideToWire(v.theirs),
});

export const viewFromWire = (v: TradeViewWire): TradeView => ({
  phase: v.phase,
  with: v.with,
  mine: sideFromWire(v.mine),
  theirs: sideFromWire(v.theirs),
});
