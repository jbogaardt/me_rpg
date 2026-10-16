import { describe, expect, it } from 'vitest';
import { MockEpicWriter, nextStock, tellEpic, type StockTale, type Teller } from './epics';

const stock: StockTale[] = [
  { id: 'one', title: 'One' },
  { id: 'two', title: 'Two' },
];
const accepts: Teller = { epic: () => Promise.resolve({ ok: true, note: '' }) };
const refuses = (): { teller: Teller; seen: unknown[] } => {
  const seen: unknown[] = [];
  return { seen, teller: { epic: (raw) => (seen.push(raw), Promise.resolve({ ok: seen.length > 2, note: 'no' })) } };
};
const page = (teller: Teller) => ({ teller, looks: [], stock });

describe('nextStock', () => {
  it('goes through the epics in turn, then the one told longest ago', () => {
    expect(nextStock(stock, [])?.id).toBe('one');
    expect(nextStock(stock, ['one'])?.id).toBe('two');
    expect(nextStock(stock, ['one', 'two'])?.id).toBe('one');
    expect(nextStock([], [])).toBeNull();
  });
});

describe('tellEpic', () => {
  it('tells what the writer wrote when the page accepts it', async () => {
    const writer = { write: () => Promise.resolve({ id: 'mine', title: 'Mine' }) };
    expect(await tellEpic(writer, page(accepts), 'Glen', [])).toMatchObject({ id: 'mine', title: 'Mine' });
  });
  it('tells a stock epic when the page refuses the writer’s, or the writer fails', async () => {
    const { teller, seen } = refuses();
    const bad = { write: () => Promise.resolve({ id: 'bad', title: 'Bad' }) };
    expect(await tellEpic(bad, page(teller), 'Glen', [])).toMatchObject({ id: 'one', title: 'One' });
    expect(seen).toHaveLength(3); // the writer's, its second go, then the stock
    const broken = { write: () => Promise.reject(new Error('down')) };
    expect(await tellEpic(broken, page(accepts), 'Glen', ['one'])).toMatchObject({ id: 'two', title: 'Two' });
  });
  it('gives the writer one more go, told what the page refused', async () => {
    const asked: (string | undefined)[] = [];
    const writer = {
      write: ({ refused }: { refused?: string }) => (
        asked.push(refused),
        Promise.resolve({ id: `try${asked.length}`, title: 'T' })
      ),
    };
    let calls = 0;
    const teller: Teller = {
      epic: () => Promise.resolve(++calls === 1 ? { ok: false, note: 'steps[2]: a tell' } : { ok: true, note: '' }),
    };
    expect(await tellEpic(writer, page(teller), 'Glen', [])).toMatchObject({ id: 'try2', title: 'T' });
    expect(asked).toEqual([undefined, 'steps[2]: a tell']);
  });
  it('tells nothing when there is nothing to tell, so a plain quest is offered', async () => {
    const none = { write: () => Promise.resolve(null) };
    expect(await tellEpic(none, { teller: accepts, looks: [], stock: [] }, 'Glen', [])).toBeNull();
    expect(
      await tellEpic(none, page({ epic: () => Promise.resolve({ ok: false, note: 'x' }) }), 'Glen', []),
    ).toBeNull();
  });
  it('the mock writer offers the stock in turn', async () => {
    expect(await new MockEpicWriter().write({ area: 'x', looks: [], told: ['one'], stock })).toEqual(stock[1]);
  });
  it('tells the writer what the last saga was, so the next builds on it', async () => {
    const seen: unknown[] = [];
    const writer = {
      write: (want: { previous?: unknown }) => (
        seen.push(want.previous),
        Promise.resolve({ id: 'next', title: 'Next' })
      ),
    };
    await tellEpic(writer, page(accepts), 'Glen', ['x'], { title: 'The Fever', ending: 'Pell is well.' });
    expect(seen).toEqual([{ title: 'The Fever', ending: 'Pell is well.' }]);
  });
});
