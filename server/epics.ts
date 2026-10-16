// The DM's epics: what the bot tells the party instead of a plain quest. An epic is a saga of several quests and people
// (src/systems/dmEpics.ts: steps of hunt, gather, find, visit and meet, people with a name and a look word), as JSON. A
// `EpicWriter` supplies one: the mock tells the content's own epics in turn; a creative model writes a new one for the
// place (claude.ts). Whatever it writes, the page parses it as strictly as a file of epics and refuses a bad one, and the
// bot then tells a stock epic instead, so a poor invention is never played.

/** An epic as the page's `stockEpics()` gives it (only what the writer needs to read). */
export interface StockTale {
  id: string;
  title: string;
  [key: string]: unknown;
}

export interface EpicWriter {
  /** An epic for the place: raw JSON for the page to check, or null if there is none to tell. `told` are the ids already told. */
  write(want: {
    area: string;
    looks: { id: string; name: string }[];
    told: string[];
    stock: StockTale[];
    /** The page's complaint about the last try, when this is a second go. */
    refused?: string;
  }): Promise<unknown>;
}

/** What the page takes (the page's `DmBotApi.epic`), as far as telling goes. */
export interface Teller {
  epic(raw: unknown): Promise<{ ok: boolean; note: string }>;
}

/** The epic the stock offers next: the first not yet told, else the one told longest ago. */
export function nextStock(stock: StockTale[], told: string[]): StockTale | null {
  return stock.find((t) => !told.includes(t.id)) ?? stock.find((t) => t.id === told[0]) ?? stock[0] ?? null;
}

export class MockEpicWriter implements EpicWriter {
  write({ told, stock }: Parameters<EpicWriter['write']>[0]): Promise<unknown> {
    return Promise.resolve(nextStock(stock, told));
  }
}

/**
 * Tell an epic: the writer's if the page accepts it, else a stock epic, else false (the caller offers a plain quest).
 * Returns the id and title told, for the log.
 */
export async function tellEpic(
  writer: EpicWriter,
  page: { teller: Teller; looks: { id: string; name: string }[]; stock: StockTale[] },
  area: string,
  told: string[],
): Promise<{ id: string; title: string; opening: string } | null> {
  const want: Parameters<EpicWriter['write']>[0] = { area, looks: page.looks, told, stock: page.stock };
  let refused = '';
  const tryTale = async (raw: unknown): Promise<{ id: string; title: string; opening: string } | null> => {
    if (typeof raw !== 'object' || raw === null) return null;
    const result = await page.teller.epic(raw);
    if (!result.ok) {
      console.warn('the page refused an epic:', result.note);
      refused = result.note;
      return null;
    }
    const t = raw as { id?: unknown; title?: unknown; opening?: unknown };
    return { id: String(t.id), title: String(t.title), opening: typeof t.opening === 'string' ? t.opening : '' };
  };
  let raw: unknown = null;
  // The first saga is the content's own, told at once: a model takes many seconds to write one, and the table is waiting.
  const first = told.length === 0 ? nextStock(page.stock, told) : null;
  if (first) {
    const now = await tryTale(first);
    if (now) return now;
  }
  try {
    raw = await writer.write(want);
  } catch (err) {
    console.warn('the epic writer failed:', err instanceof Error ? err.message : err);
  }
  const told1 = await tryTale(raw);
  if (told1) return told1;
  if (refused && raw !== null) {
    // The writer may mend it once, told what the page objected to.
    try {
      const told2 = await tryTale(await writer.write({ ...want, refused }));
      if (told2) return told2;
    } catch (err) {
      console.warn('the epic writer failed:', err instanceof Error ? err.message : err);
    }
  }
  const stock = nextStock(page.stock, told);
  return stock && raw !== stock ? tryTale(stock) : null;
}
