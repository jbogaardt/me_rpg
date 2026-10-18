import { describe, expect, it } from 'vitest';
import { Delve } from './delve';
import { buildDelveFx } from './delveFx';
import {
  decalTile,
  DECALS,
  DECAL_COLUMNS,
  DRY_MIX,
  fadeTile,
  FADE_ROWS,
  foamTile,
  FX_CELL,
  FX_SHEET,
  hash,
  maskOf,
  pickDecal,
  pickWeighted,
  rimTile,
  roofTile,
  ROOF_VARIANTS,
  shadeAt,
  shadowTile,
  WET_MIX,
} from './delveStyle';
import type { ZoneApi } from './zone';

describe('hash', () => {
  it('is the same every time and spread over 0..1', () => {
    expect(hash(3, 9, 2)).toBe(hash(3, 9, 2));
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const h = hash(i % 50, Math.floor(i / 50), 5);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      sum += h;
    }
    expect(sum / 2000).toBeGreaterThan(0.45);
    expect(sum / 2000).toBeLessThan(0.55);
  });
});

describe('pickWeighted', () => {
  it('follows the weights', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) counts[pickWeighted([6, 3, 1], hash(i, 7))]++;
    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBeGreaterThan(150);
  });
  it('never runs off the end', () => {
    expect(pickWeighted([1, 1], 0.999999)).toBe(1);
    expect(pickWeighted([1, 1], 0)).toBe(0);
  });
});

describe('pickDecal', () => {
  it('detail a given share of cells, never the same on every cell, and a wet place has more puddles', () => {
    const tally = (mix: typeof WET_MIX) => {
      const by: Record<string, number> = {};
      let n = 0;
      for (let i = 0; i < 4000; i++) {
        const d = pickDecal(mix, hash(i, 1), hash(i, 2));
        if (d) {
          n++;
          by[d.kind] = (by[d.kind] ?? 0) + 1;
        }
      }
      return { n, by };
    };
    const wet = tally(WET_MIX);
    expect(wet.n / 4000).toBeGreaterThan(WET_MIX.share - 0.04);
    expect(wet.n / 4000).toBeLessThan(WET_MIX.share + 0.04);
    expect(Object.keys(wet.by).length).toBe(5);
    expect((wet.by.puddle ?? 0) / (tally(DRY_MIX).by.puddle ?? 1)).toBeGreaterThan(3);
  });
});

describe('the overlay sheet layout', () => {
  it('keeps every tile inside 16 x 6 cells and none on another', () => {
    const tiles: [number, number][] = [];
    for (let m = 1; m < 16; m++) tiles.push([...shadowTile(m)], [...foamTile(m)], [...rimTile(m)]);
    for (let v = 0; v < FADE_ROWS; v++) tiles.push([...fadeTile(v)]);
    for (let v = 0; v < ROOF_VARIANTS; v++) tiles.push([...roofTile(v)]);
    for (const d of DECALS) for (let v = 0; v < d.count; v++) tiles.push([...decalTile(d.kind, v)]);
    for (const [x, y] of tiles) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(16 * FX_CELL);
      expect(y).toBeLessThan(6 * FX_CELL);
    }
    expect(new Set(tiles.map((t) => t.join(','))).size).toBe(tiles.length);
    expect(DECAL_COLUMNS).toBeLessThanOrEqual(16);
  });
  it('shades the foot of a wall darker than the middle of the floor', () => {
    expect(shadeAt(0)).toBeGreaterThan(shadeAt(6));
    expect(shadeAt(6)).toBeGreaterThan(shadeAt(11));
    expect(shadeAt(14)).toBe(0);
  });
  it('draws a shadow only on the sides asked for, and foam hugging its edge', () => {
    const img = buildDelveFx();
    const alpha = (tile: readonly [number, number], x: number, y: number) =>
      img.data[((tile[1] + y) * img.width + tile[0] + x) * 4 + 3];
    const north = maskOf(true, false, false, false);
    expect(alpha(shadowTile(north), 16, 0)).toBeGreaterThan(100);
    expect(alpha(shadowTile(north), 16, 31)).toBe(0);
    const foam = foamTile(north);
    expect(alpha(foam, 16, 0)).toBeGreaterThan(200);
    expect(alpha(foam, 16, 20)).toBe(0);
  });
});

/** A zone that only records what the painter asks of it. */
function recorder(w: number, h: number) {
  const tile = new Map<string, string>();
  const overlays = new Map<string, string[]>();
  const voids = new Set<string>();
  const backdrop = { name: '' };
  const z = {
    width: w,
    height: h,
    indoor() {},
    dark() {},
    backdrop: (name: string) => void (backdrop.name = name),
    clearGround: (r: { col: number; row: number }) => void voids.add(`${r.col},${r.row}`),
    fill() {},
    block() {},
    tileAt: (col: number, row: number, _n: string, _s: string, x: number) => tile.set(`${col},${row}`, `${x}`),
    overlay: (col: number, row: number, sheet: string, x: number, y: number) => {
      expect(sheet).toBe(FX_SHEET);
      const k = `${col},${row}`;
      overlays.set(k, [...(overlays.get(k) ?? []), `${x},${y}`]);
    },
  };
  return { z: z as unknown as ZoneApi, tile, overlays, voids, backdrop };
}

describe('Delve.paint dressing', () => {
  const room = () => new Delve(30, 24).rect(3, 4, 24, 16).rect(6, 9, 18, 4, '~');

  it('shades floor under a wall, foams the water edge on the floor side, and leaves the roof for the backdrop', () => {
    const { z, overlays, voids, backdrop } = recorder(30, 24);
    room().paint(z, 'sewer');
    expect(overlays.get('10,4')).toContainEqual(`${shadowTile(maskOf(true, false, false, false))[0]},0`);
    expect(overlays.get('10,9')).toContainEqual(`${foamTile(maskOf(true, false, false, false))[0]},${FX_CELL}`);
    expect(overlays.get('10,12')).toContainEqual(`${foamTile(maskOf(false, false, true, false))[0]},${FX_CELL}`);
    expect(overlays.get('10,10')).toBeUndefined(); // the middle of the water has no edge
    expect(voids.has('1,1')).toBe(true); // the roof shows the backdrop
    expect(overlays.get('1,1')).toBeUndefined();
    expect(voids.has('10,10')).toBe(false); // the water does not
    expect(backdrop.name).toBe('sewer');
  });

  it('gives open floor a lit lip on a south, east or west edge to the dark and hangs a cliff face under the south one', () => {
    const { z, overlays, voids } = recorder(30, 24);
    const filled: string[] = [];
    (z as unknown as { fill: (g: string, r?: { col: number; row: number }) => void }).fill = (g, r) => {
      if (r) filled.push(`${r.col},${r.row}=${g}`);
    };
    // A floor 12 wide with thick rock round it: nothing but roof south, east and west of it.
    new Delve(30, 24).rect(8, 4, 12, 6).paint(z, 'cave');
    const lip = (m: number) => `${rimTile(m)[0]},${rimTile(m)[1]}`;
    expect(overlays.get('12,9')).toContainEqual(lip(maskOf(false, false, true, false)));
    expect(overlays.get('8,6')).toContainEqual(lip(maskOf(false, false, false, true)));
    expect(overlays.get('19,6')).toContainEqual(lip(maskOf(false, true, false, false)));
    expect(overlays.get('12,6')).toBeUndefined(); // the middle of the floor has no edge
    // Two rows of face hang under the south edge, fading to dark; below them the backdrop shows.
    expect(overlays.get('12,10')).toContainEqual(`${fadeTile(0)[0]},${fadeTile(0)[1]}`);
    expect(overlays.get('12,11')).toContainEqual(`${fadeTile(1)[0]},${fadeTile(1)[1]}`);
    expect(filled).toContain('12,10=caveFaceU');
    expect(filled).toContain('12,11=caveFaceL');
    expect(voids.has('12,10')).toBe(false);
    expect(voids.has('12,12')).toBe(true);
  });

  it('is the same every time', () => {
    const a = recorder(30, 24);
    const b = recorder(30, 24);
    room().paint(a.z, 'sewer');
    room().paint(b.z, 'sewer');
    expect([...a.overlays]).toEqual([...b.overlays]);
    expect([...a.tile]).toEqual([...b.tile]);
  });

  it('turns the sewer floor over so no two-by-two grid repeats', () => {
    const { z, tile } = recorder(30, 24);
    room().paint(z, 'sewer');
    const at = (c: number, r: number) => tile.get(`${c},${r}`);
    expect(new Set(tile.values()).size).toBeGreaterThanOrEqual(5);
    let same = 0;
    let pairs = 0;
    for (let r = 4; r < 9; r++)
      for (let c = 3; c < 26; c++) {
        pairs++;
        if (at(c, r) === at(c + 1, r)) same++;
      }
    expect(same / pairs).toBeLessThan(0.45);
    let period2 = 0;
    for (let r = 4; r < 9; r++)
      for (let c = 3; c < 24; c++) if (at(c, r) === at(c + 2, r) && at(c, r) === at(c, r + 1)) period2++;
    expect(period2 / (5 * 21)).toBeLessThan(0.3);
  });
});
