import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { neighbourLinks } from '../../src/map/doors';
import { CELL, parseMap, type MapData } from '../../src/map/types';

// The seamless crossing between open-air zones lays one zone's map beside the other's. This checks the offset between
// their coordinates (`neighbourLinks`) against the built maps themselves: they are cut from one world, so the same
// place must hold the same ground in both.

const dir = path.join(__dirname, '../../public/maps');
const load = (zone: string): MapData =>
  parseMap(JSON.parse(fs.readFileSync(path.join(dir, `${zone}.json`), 'utf8')) as unknown);
const zones = fs
  .readdirSync(dir)
  .map((f) => f.replace('.json', ''))
  .filter((z) => !load(z).indoor);
const maps = new Map(zones.map((z) => [z, load(z)]));

describe('links between open-air zones', () => {
  it('every gap has a link both ways, with opposite offsets', () => {
    let count = 0;
    for (const [name, data] of maps) {
      for (const l of neighbourLinks(data)) {
        const other = maps.get(l.zone);
        expect(other, `${name} -> ${l.zone}`).toBeTruthy();
        const back = neighbourLinks(other!).find((b) => b.zone === name);
        expect(back, `${l.zone} -> ${name}`).toBeTruthy();
        expect([back!.dx, back!.dy], `${name} <-> ${l.zone}`).toEqual([-l.dx + 0, -l.dy + 0]);
        count++;
      }
    }
    expect(count).toBeGreaterThan(10);
  });

  it('the offset lines the maps up better than any other: the same place holds the same ground in both', () => {
    const stack = (m: MapData, col: number, row: number) => {
      const cell = m.ground[row * m.width + col];
      if (!cell) return '';
      const parts: string[] = [];
      for (let k = 0; k + 2 < cell.length; k += 3) parts.push(`${m.sheets[cell[k]]}:${cell[k + 1]}:${cell[k + 2]}`);
      return parts.join('|');
    };
    let compared = 0;
    for (const [name, a] of maps) {
      const beyondA = a.surfaces.indexOf('beyond');
      for (const l of neighbourLinks(a)) {
        const b = maps.get(l.zone)!;
        const beyondB = b.surfaces.indexOf('beyond');
        // How much of A's own ground shows up unchanged in B's margin, with the maps shifted by `sx, sy` cells more.
        const score = (sx: number, sy: number) => {
          let same = 0;
          let total = 0;
          for (let row = 0; row < a.height; row++) {
            for (let col = 0; col < a.width; col++) {
              if (a.surface[row * a.width + col] === beyondA) continue; // A's own cell
              const [bc, br] = [col + l.dx / CELL + sx, row + l.dy / CELL + sy];
              if (bc < 0 || br < 0 || bc >= b.width || br >= b.height) continue;
              if (b.surface[br * b.width + bc] !== beyondB) continue; // not in B's margin: B has it as its own
              total++;
              if (stack(a, col, row) === stack(b, bc, br)) same++;
            }
          }
          return { total, share: same / Math.max(1, total) };
        };
        const right = score(0, 0);
        expect(right.total, `${name} -> ${l.zone} overlap`).toBeGreaterThan(50);
        for (const [sx, sy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          expect(right.share, `${name} -> ${l.zone} shifted ${sx},${sy}`).toBeGreaterThan(score(sx, sy).share);
        }
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(10);
  });
});
