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

  /** Number of cells seen. */
  count(): number {
    let n = 0;
    for (const c of this.cells) n += c;
    return n;
  }
}

/** What the player has explored in every zone visited, by zone name. Lives as long as the game does (not saved). */
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
}
