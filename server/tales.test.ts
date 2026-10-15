import { describe, expect, it } from 'vitest';
import { MockTaleWriter, nextStock, tellTale, type StockTale, type Teller } from './tales';

const stock: StockTale[] = [
  { id: 'one', title: 'One' },
  { id: 'two', title: 'Two' },
];
const accepts: Teller = { tale: () => Promise.resolve({ ok: true, note: '' }) };
const refuses = (): { teller: Teller; seen: unknown[] } => {
  const seen: unknown[] = [];
  return { seen, teller: { tale: (raw) => (seen.push(raw), Promise.resolve({ ok: seen.length > 1, note: 'no' })) } };
};
const page = (teller: Teller) => ({ teller, looks: [], stock });

describe('nextStock', () => {
  it('goes through the tales in turn, then the one told longest ago', () => {
    expect(nextStock(stock, [])?.id).toBe('one');
    expect(nextStock(stock, ['one'])?.id).toBe('two');
    expect(nextStock(stock, ['one', 'two'])?.id).toBe('one');
    expect(nextStock([], [])).toBeNull();
  });
});

describe('tellTale', () => {
  it('tells what the writer wrote when the page accepts it', async () => {
    const writer = { write: () => Promise.resolve({ id: 'mine', title: 'Mine' }) };
    expect(await tellTale(writer, page(accepts), 'Glen', [])).toEqual({ id: 'mine', title: 'Mine' });
  });
  it('tells a stock tale when the page refuses the writer’s, or the writer fails', async () => {
    const { teller, seen } = refuses();
    const bad = { write: () => Promise.resolve({ id: 'bad', title: 'Bad' }) };
    expect(await tellTale(bad, page(teller), 'Glen', [])).toEqual({ id: 'one', title: 'One' });
    expect(seen).toHaveLength(2);
    const broken = { write: () => Promise.reject(new Error('down')) };
    expect(await tellTale(broken, page(accepts), 'Glen', ['one'])).toEqual({ id: 'two', title: 'Two' });
  });
  it('tells nothing when there is nothing to tell, so a plain quest is offered', async () => {
    const none = { write: () => Promise.resolve(null) };
    expect(await tellTale(none, { teller: accepts, looks: [], stock: [] }, 'Glen', [])).toBeNull();
    expect(
      await tellTale(none, page({ tale: () => Promise.resolve({ ok: false, note: 'x' }) }), 'Glen', []),
    ).toBeNull();
  });
  it('the mock writer offers the stock in turn', async () => {
    expect(await new MockTaleWriter().write({ area: 'x', looks: [], told: ['one'], stock })).toEqual(stock[1]);
  });
});
