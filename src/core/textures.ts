import { Rectangle, Texture } from 'pixi.js';

/** A sub-rectangle of a sheet as its own texture, clamped to the image. Null if fully outside. */
export function makeFrame(sheet: Texture, x: number, y: number, w: number, h: number): Texture | null {
  w = Math.min(w, sheet.width - x);
  h = Math.min(h, sheet.height - y);
  if (w <= 0 || h <= 0) return null;
  return new Texture({ source: sheet.source, frame: new Rectangle(x, y, w, h) });
}

const gridCache = new WeakMap<Texture, Map<string, Texture[][]>>();

/**
 * A sheet cut into a regular grid: `frames[row][col]`. Cached per sheet, so every character that
 * shares a sheet (e.g. several mobs of one kind) shares one set of frame textures.
 */
export function sheetGrid(sheet: Texture, cols: number, rows: number, frameW: number, frameH: number): Texture[][] {
  const key = `${cols}x${rows}:${frameW}x${frameH}`;
  let byKey = gridCache.get(sheet);
  if (!byKey) gridCache.set(sheet, (byKey = new Map()));
  let grid = byKey.get(key);
  if (!grid) {
    grid = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const frame = makeFrame(sheet, c * frameW, r * frameH, frameW, frameH);
        if (!frame) throw new Error(`Sheet is too small for a ${cols}x${rows} grid of ${frameW}x${frameH} frames`);
        return frame;
      }),
    );
    byKey.set(key, grid);
  }
  return grid;
}
