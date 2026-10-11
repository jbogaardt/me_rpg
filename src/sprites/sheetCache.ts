// A reference-counted cache with a few spares. Pixi-free, so the bookkeeping is unit-tested; the Wardrobe uses it for
// composed character sheets, which are large (832x1600 RGBA: about 5 MB of canvas plus 5 MB on the GPU each).

/**
 * Values made on demand per key and shared while in use. `acquire` takes a reference and `release` gives it back; a
 * value nobody uses is kept as one of up to `spares` most recently released (so taking a piece of gear off and on
 * again costs nothing), and beyond that it is handed to `evict` to be freed.
 */
export class RefCache<V> {
  private entries = new Map<string, { value: V; refs: number }>();
  private keyOf = new Map<V, string>();
  /** Keys of unused values, least recently released first. */
  private idle: string[] = [];

  constructor(
    private spares: number,
    private evict: (value: V) => void,
  ) {}

  /** The value for `key` (made with `make` if there is none), with one more reference taken on it. */
  acquire(key: string, make: () => V): V {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { value: make(), refs: 0 };
      this.entries.set(key, entry);
      this.keyOf.set(entry.value, key);
    }
    if (entry.refs === 0) this.idle = this.idle.filter((k) => k !== key);
    entry.refs++;
    return entry.value;
  }

  /** Give back one reference. Values this cache did not make are ignored. */
  release(value: V) {
    const key = this.keyOf.get(value);
    const entry = key === undefined ? undefined : this.entries.get(key);
    if (key === undefined || !entry || entry.refs === 0) return;
    if (--entry.refs > 0) return;
    this.idle.push(key);
    while (this.idle.length > this.spares) {
      const old = this.idle.shift();
      const gone = old === undefined ? undefined : this.entries.get(old);
      if (old === undefined || !gone) continue;
      this.entries.delete(old);
      this.keyOf.delete(gone.value);
      this.evict(gone.value);
    }
  }

  /** How many values are held (in use or spare). */
  get size(): number {
    return this.entries.size;
  }

  /** References currently taken on `key` (0 for a spare or an unknown key). */
  refs(key: string): number {
    return this.entries.get(key)?.refs ?? 0;
  }
}
