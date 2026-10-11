import { beforeEach, describe, expect, it } from 'vitest';
import { newHero, type Hero } from './combat';
import { BASE_PACK, itemCode } from './inventory';
import { ITEMS } from './items';
import {
  canGive,
  REQUEST_SECONDS,
  TRADE_KEEP,
  TRADE_START,
  TradeBook,
  viewFromWire,
  viewToWire,
  type TradeEnv,
} from './trade';

const sword = itemCode(ITEMS.steelSword);
const potion = itemCode(ITEMS.potion);

let heroes: Map<number, Hero>;
let gap: number;
let book: TradeBook;

beforeEach(() => {
  heroes = new Map([0, 1, 2].map((slot) => [slot, newHero()]));
  gap = 40;
  const env: TradeEnv = {
    hero: (slot) => heroes.get(slot),
    distance: (a, b) => (heroes.has(a) && heroes.has(b) ? gap : null),
    name: (slot) => `P${slot + 1}`,
  };
  book = new TradeBook(env);
  heroes.get(0)!.pack.push(ITEMS.steelSword, ITEMS.potion, ITEMS.potion);
  heroes.get(0)!.gold = 100;
  heroes.get(1)!.gold = 50;
});

/** Player 0 asks player 1 and player 1 accepts. */
function open() {
  book.apply(0, { c: 'ask', with: 1 });
  book.apply(1, { c: 'yes' });
}

describe('asking', () => {
  it('shows the asker a waiting request and the other player an incoming one', () => {
    book.apply(0, { c: 'ask', with: 1 });
    expect(book.viewFor(0)).toMatchObject({ phase: 'asking', with: 1 });
    expect(book.viewFor(1)).toMatchObject({ phase: 'incoming', with: 0 });
    expect(book.noteFor(1)?.text).toContain('wants to trade');
    expect(book.viewFor(2)).toBeNull();
  });

  it('refuses when the players are too far apart', () => {
    gap = TRADE_START + 1;
    book.apply(0, { c: 'ask', with: 1 });
    expect(book.viewFor(0)).toBeNull();
    expect(book.noteFor(0)).toMatchObject({ ok: false });
  });

  it('refuses when either player is busy, and ignores asking yourself or a missing player', () => {
    open();
    book.apply(2, { c: 'ask', with: 1 });
    expect(book.viewFor(2)).toBeNull();
    expect(book.noteFor(2)?.text).toContain('busy');
    book.apply(0, { c: 'ask', with: 2 });
    expect(book.viewFor(2)).toBeNull();
    book.apply(2, { c: 'ask', with: 2 });
    book.apply(2, { c: 'ask', with: 9 });
    expect(book.viewFor(2)).toBeNull();
  });

  it('opens the trade on yes, and ends it with a note to the asker on no', () => {
    open();
    expect(book.viewFor(0)?.phase).toBe('open');
    expect(book.viewFor(1)?.phase).toBe('open');

    book.clear();
    book.apply(0, { c: 'ask', with: 1 });
    book.apply(1, { c: 'no' });
    expect(book.viewFor(0)).toBeNull();
    expect(book.viewFor(1)).toBeNull();
    expect(book.noteFor(0)?.text).toContain('said no');
  });

  it('only lets the asked player answer', () => {
    book.apply(0, { c: 'ask', with: 1 });
    book.apply(0, { c: 'yes' });
    expect(book.viewFor(0)?.phase).toBe('asking');
  });

  it('treats two players asking each other as a yes', () => {
    book.apply(0, { c: 'ask', with: 1 });
    book.apply(1, { c: 'ask', with: 0 });
    expect(book.viewFor(0)?.phase).toBe('open');
  });

  it('lapses an unanswered request', () => {
    book.apply(0, { c: 'ask', with: 1 });
    book.update(REQUEST_SECONDS + 1);
    expect(book.viewFor(0)).toBeNull();
    expect(book.viewFor(1)).toBeNull();
  });

  it('lets the asker withdraw', () => {
    book.apply(0, { c: 'ask', with: 1 });
    book.apply(0, { c: 'cancel' });
    expect(book.viewFor(1)).toBeNull();
    expect(book.noteFor(1)?.text).toContain('withdrew');
  });
});

describe('offers', () => {
  it('shows each side what the other put on the table', () => {
    open();
    book.apply(0, { c: 'offer', items: [sword, potion], gold: 30 });
    expect(book.viewFor(0)?.mine).toMatchObject({ items: [ITEMS.steelSword, ITEMS.potion], gold: 30 });
    expect(book.viewFor(1)?.theirs).toMatchObject({ items: [ITEMS.steelSword, ITEMS.potion], gold: 30 });
  });

  it('keeps out what the player does not have', () => {
    open();
    book.apply(0, { c: 'offer', items: [potion, potion, potion, itemCode(ITEMS.greatHelm), 99999], gold: 5000 });
    const mine = book.viewFor(0)!.mine;
    expect(mine.items).toEqual([ITEMS.potion, ITEMS.potion]); // only two potions in the pack
    expect(mine.gold).toBe(100);
  });

  it('turns away nonsense gold', () => {
    open();
    book.apply(0, { c: 'offer', items: [], gold: -20 });
    expect(book.viewFor(0)!.mine.gold).toBe(0);
    book.apply(0, { c: 'offer', items: [], gold: Number.NaN });
    expect(book.viewFor(0)!.mine.gold).toBe(0);
    book.apply(0, { c: 'offer', items: [], gold: 12.9 });
    expect(book.viewFor(0)!.mine.gold).toBe(12);
  });

  it('ignores offers outside an open trade', () => {
    book.apply(0, { c: 'offer', items: [sword], gold: 1 });
    book.apply(0, { c: 'ask', with: 1 });
    book.apply(0, { c: 'offer', items: [sword], gold: 1 });
    expect(book.viewFor(0)!.mine.items).toEqual([]);
  });

  it('clears both accept marks whenever an offer changes', () => {
    open();
    book.apply(0, { c: 'ready', on: true });
    expect(book.viewFor(1)!.theirs.ready).toBe(true);
    book.apply(1, { c: 'offer', items: [], gold: 10 });
    expect(book.viewFor(0)!.mine.ready).toBe(false);
    expect(book.viewFor(1)!.mine.ready).toBe(false);
  });
});

describe('settling', () => {
  it('swaps items and gold once both accept', () => {
    open();
    book.apply(0, { c: 'offer', items: [sword, potion], gold: 30 });
    book.apply(1, { c: 'offer', items: [], gold: 20 });
    book.apply(0, { c: 'ready', on: true });
    expect(book.viewFor(0)).not.toBeNull(); // one accept is not enough
    book.apply(1, { c: 'ready', on: true });

    const [a, b] = [heroes.get(0)!, heroes.get(1)!];
    expect(a.pack).toEqual([ITEMS.potion]);
    expect(b.pack).toEqual([ITEMS.steelSword, ITEMS.potion]);
    expect(a.gold).toBe(90); // 100 - 30 + 20
    expect(b.gold).toBe(60); // 50 + 30 - 20
    expect(book.viewFor(0)).toBeNull();
    expect(book.viewFor(1)).toBeNull();
    expect(book.noteFor(0)).toMatchObject({ ok: true, text: 'Trade complete' });
    expect(book.noteFor(1)).toMatchObject({ ok: true, text: 'Trade complete' });
  });

  it('can take the accept back before the other side agrees', () => {
    open();
    book.apply(0, { c: 'offer', items: [sword], gold: 0 });
    book.apply(0, { c: 'ready', on: true });
    book.apply(0, { c: 'ready', on: false });
    book.apply(1, { c: 'ready', on: true });
    expect(heroes.get(0)!.pack).toContain(ITEMS.steelSword);
    expect(book.viewFor(0)).not.toBeNull();
  });

  it('changes nothing when the offerer no longer has the goods', () => {
    open();
    book.apply(0, { c: 'offer', items: [sword], gold: 60 });
    heroes.get(0)!.pack.shift(); // the sword leaves the pack mid-trade
    book.apply(0, { c: 'ready', on: true });
    book.apply(1, { c: 'ready', on: true });
    expect(heroes.get(1)!.pack).toEqual([]);
    expect(heroes.get(0)!.gold).toBe(100);
    expect(book.viewFor(0)).toMatchObject({ phase: 'open' });
    expect(book.viewFor(0)!.mine.ready).toBe(false);
    expect(book.noteFor(0)?.ok).toBe(false);
  });

  it('changes nothing when the other pack has no room', () => {
    open();
    const b = heroes.get(1)!;
    while (b.pack.length < BASE_PACK) b.pack.push(ITEMS.potion);
    book.apply(0, { c: 'offer', items: [sword], gold: 0 });
    book.apply(0, { c: 'ready', on: true });
    book.apply(1, { c: 'ready', on: true });
    expect(heroes.get(0)!.pack).toContain(ITEMS.steelSword);
    expect(b.pack).toHaveLength(BASE_PACK);
    expect(book.noteFor(0)?.text).toContain('too full');
  });

  it('lets a full pack swap one for one', () => {
    open();
    const b = heroes.get(1)!;
    while (b.pack.length < BASE_PACK) b.pack.push(ITEMS.potion);
    book.apply(0, { c: 'offer', items: [sword], gold: 0 });
    book.apply(1, { c: 'offer', items: [potion], gold: 0 });
    book.apply(0, { c: 'ready', on: true });
    book.apply(1, { c: 'ready', on: true });
    expect(b.pack).toHaveLength(BASE_PACK);
    expect(b.pack).toContain(ITEMS.steelSword);
  });

  it('can be a gift: one side offers nothing', () => {
    open();
    book.apply(0, { c: 'offer', items: [], gold: 25 });
    book.apply(0, { c: 'ready', on: true });
    book.apply(1, { c: 'ready', on: true });
    expect(heroes.get(1)!.gold).toBe(75);
  });
});

describe('ending', () => {
  it('either side can cancel an open trade; the other is told', () => {
    open();
    book.apply(1, { c: 'cancel' });
    expect(book.viewFor(0)).toBeNull();
    expect(book.noteFor(0)?.text).toContain('cancelled');
    expect(book.busy(0)).toBe(false);
  });

  it('ends when the players drift apart (but not before TRADE_KEEP)', () => {
    open();
    gap = TRADE_KEEP;
    book.update(0.1);
    expect(book.viewFor(0)).not.toBeNull();
    gap = TRADE_KEEP + 1;
    book.update(0.1);
    expect(book.viewFor(0)).toBeNull();
    expect(book.noteFor(1)?.text).toContain('too far');
  });

  it('ends when a player leaves the game', () => {
    open();
    heroes.delete(1);
    book.update(0.1);
    expect(book.viewFor(0)).toBeNull();
    expect(book.noteFor(0)?.ok).toBe(false);
  });

  it('drop() ends the leaver’s trade and forgets their notes', () => {
    open();
    book.drop(1);
    expect(book.viewFor(0)).toBeNull();
    expect(book.noteFor(1)).toBeNull();
  });

  it('ignores commands from a player who is not in the game', () => {
    heroes.delete(2);
    book.apply(2, { c: 'ask', with: 0 });
    expect(book.viewFor(0)).toBeNull();
  });
});

describe('canGive', () => {
  it('needs every listed item and enough gold', () => {
    const hero = heroes.get(0)!;
    expect(canGive(hero, { items: [ITEMS.potion, ITEMS.potion], gold: 100 })).toBe(true);
    expect(canGive(hero, { items: [ITEMS.potion, ITEMS.potion, ITEMS.potion], gold: 0 })).toBe(false);
    expect(canGive(hero, { items: [], gold: 101 })).toBe(false);
  });
});

describe('wire form', () => {
  it('round-trips a view', () => {
    open();
    book.apply(0, { c: 'offer', items: [sword, potion], gold: 5 });
    const view = book.viewFor(0)!;
    expect(viewFromWire(viewToWire(view))).toEqual(view);
    expect(viewToWire(view).mine.items).toEqual([sword, potion]);
  });
});
