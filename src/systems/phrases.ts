// Several ways of saying the same thing (Pixi-free, tested; core engine). The Dungeon Master tells many alike moments (a
// quest given, the way shown, a task called off), and one stock line said every time sounds like a machine. A
// `Phrasebook` keeps, per moment, which wordings were said lately and picks one that was not, so a line comes back only
// once every other has had its turn; `seeded` picks the same one on every page from a shared key, for words each page
// builds itself (a quest's telling).

/** A line of a list chosen by a seed: the same seed picks the same line on every page. */
export const seeded = <T>(list: readonly T[], seed: number): T => list[Math.abs(seed) % list.length]!;

/** A string's seed, for `seeded` (and to vary each page of a telling, `hashOf(key + page)`). */
export const hashOf = (s: string): number => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export class Phrasebook {
  private said = new Map<string, number[]>();
  constructor(private random: () => number = Math.random) {}

  /** One of `lines` for the moment `key`, never one said since the last time every line of it was said. */
  pick(key: string, lines: readonly string[]): string {
    if (!lines.length) return '';
    const used = this.said.get(key) ?? [];
    const fresh = lines.map((_, i) => i).filter((i) => !used.includes(i));
    const pool = fresh.length ? fresh : lines.map((_, i) => i).filter((i) => i !== used[used.length - 1]);
    const at = pool[Math.floor(this.random() * pool.length)] ?? 0;
    this.said.set(key, fresh.length ? [...used, at] : [at]);
    return lines[at]!;
  }

  reset() {
    this.said.clear();
  }
}
