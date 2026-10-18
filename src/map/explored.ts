import { CELL, type MapData } from './types';

// Pixi-free: which cells of a zone the player has seen, for the map (src/hud/MapOverlay.ts). Walking reveals a disc
// of cells around each player; the map draws only what was revealed. One `Explored` per zone, kept by name in an `Atlas`.

/** How far (cells) around a player the map fills in: about half a screen, so it follows what you actually saw. */
export const REVEAL_RADIUS = 10;

export class Explored {
  /** 1 for a cell that has been seen, row-major like the map. */
  readonly cells: Uint8Array;
  /** Bumped whenever a cell is newly revealed, so the map knows when to repaint. */
  version = 0;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = new Uint8Array(width * height);
  }

  /** Reveal the cells within `radius` cells of a world position (pixels). Returns whether any were new. */
  reveal(x: number, y: number, radius = REVEAL_RADIUS): boolean {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    let added = false;
    for (let row = Math.max(0, cy - radius); row <= Math.min(this.height - 1, cy + radius); row++) {
      for (let col = Math.max(0, cx - radius); col <= Math.min(this.width - 1, cx + radius); col++) {
        const i = row * this.width + col;
        if (this.cells[i] || (col - cx) ** 2 + (row - cy) ** 2 > radius * radius + radius) continue;
        this.cells[i] = 1;
        added = true;
      }
    }
    if (added) this.version++;
    return added;
  }

  /** Reveal every cell at once (a map with no fog). */
  revealAll() {
    if (this.whole) return;
    this.whole = true;
    this.cells.fill(1);
    this.version++;
  }
  private whole = false;

  /** Number of cells seen. */
  count(): number {
    let n = 0;
    for (const c of this.cells) n += c;
    return n;
  }
}

/** What the player has explored in every zone visited, by zone name. Saved by a solo game (`packExplored`). */
export class Atlas {
  private readonly zones = new Map<string, Explored>();

  of(name: string, data: MapData): Explored {
    let e = this.zones.get(name);
    if (!e || e.width !== data.width || e.height !== data.height) {
      e = new Explored(data.width, data.height);
      this.zones.set(name, e);
    }
    return e;
  }

  /** Put saved cells back for a zone (a corrupt or wrong-sized pack is ignored). Returns whether it was used. */
  restore(name: string, packed: unknown): boolean {
    const u = unpackExplored(packed);
    if (!u) return false;
    const e = new Explored(u.width, u.height);
    e.cells.set(u.cells);
    e.version++;
    this.zones.set(name, e);
    return true;
  }

  /** Every zone with something seen, packed (see `packExplored`); empty zones are left out. */
  pack(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, e] of this.zones) if (e.count() > 0) out[name] = packExplored(e);
    return out;
  }
}

// Saved form of one zone: "<width>x<height>:<base64>", the base64 being run lengths (LEB128 varints) of alternating
// unseen/seen cells, starting with unseen. Revealed discs are a few long runs per row, so a visited zone is a few KB.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function packExplored(e: Explored): string {
  const bytes: number[] = [];
  let cur = 0;
  let run = 0;
  const flush = () => {
    let n = run;
    while (n >= 128) {
      bytes.push((n & 127) | 128);
      n = Math.floor(n / 128);
    }
    bytes.push(n);
  };
  for (const c of e.cells) {
    const bit = c ? 1 : 0;
    if (bit !== cur) {
      flush();
      cur = bit;
      run = 0;
    }
    run++;
  }
  flush();
  let b64 = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    b64 += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=');
    b64 += i + 2 < bytes.length ? B64[n & 63]! : '=';
  }
  return `${e.width}x${e.height}:${b64}`;
}

/** The cells a pack holds, or null if it is not a well-formed pack (never throws). */
export function unpackExplored(packed: unknown): { width: number; height: number; cells: Uint8Array } | null {
  if (typeof packed !== 'string') return null;
  const m = /^(\d{1,5})x(\d{1,5}):([A-Za-z0-9+/]*={0,2})$/.exec(packed);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  const total = width * height;
  if (total <= 0 || total > 4_000_000) return null;
  const bytes: number[] = [];
  const text = m[3]!.replace(/=+$/, '');
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    const chunk = text.slice(i, i + 4);
    for (let k = 0; k < 4; k++) n = (n << 6) | (k < chunk.length ? B64.indexOf(chunk[k]!) : 0);
    const count = Math.max(0, Math.floor((chunk.length * 6) / 8));
    for (let k = 0; k < count; k++) bytes.push((n >> (16 - 8 * k)) & 255);
  }
  const cells = new Uint8Array(total);
  let at = 0;
  let bit = 0;
  let i = 0;
  while (i < bytes.length) {
    let n = 0;
    let mul = 1;
    for (;;) {
      const b = bytes[i++];
      if (b === undefined || mul > 2 ** 28) return null;
      n += (b & 127) * mul;
      mul *= 128;
      if (b < 128) break;
    }
    if (at + n > total) return null;
    if (bit) cells.fill(1, at, at + n);
    at += n;
    bit ^= 1;
  }
  return at === total ? { width, height, cells } : null;
}
