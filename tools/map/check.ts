import { CHEST_KINDS, CHEST_LOOTS } from '../../src/systems/chests';
import { MOB_KINDS } from '../../src/systems/combat';
import { SHOPS } from '../../src/systems/shops';
import { CELL, type MapData } from '../../src/map/types';
import { coverage, sheet } from './image';

export interface Report {
  errors: string[]; // the map is broken (fails the build)
  warnings: string[]; // probably looks or plays wrong; fix it or block()/unblock() with intent
}

/**
 * Sanity checks an agent (or CI) can run on any map. `reasons` are cells blocked on purpose via
 * zone.block(), which aren't reported as invisible walls.
 */
export function checkMap(d: MapData, reasons: Map<number, string> = new Map()): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const W = d.width;
  const blocked = new Set(d.collision);
  const at = (i: number) => `(${i % W},${Math.floor(i / W)})`;
  const inMap = (c: number, r: number) => c >= 0 && r >= 0 && c < d.width && r < d.height;

  // Assets exist and every rect is inside its sheet.
  d.ground.forEach((g, i) => {
    if (!g) return;
    const img = sheet(d.sheets[g[0]]);
    if (g[1] + CELL > img.width || g[2] + CELL > img.height)
      errors.push(`ground ${at(i)} reads outside ${d.sheets[g[0]]}`);
  });
  if (d.ground.some((g) => !g))
    warnings.push(`${d.ground.filter((g) => !g).length} cells have no ground (they show the background colour)`);
  for (const o of d.objects) {
    const img = sheet(d.sheets[o.s]);
    if (o.x + o.w > img.width || o.y + o.h > img.height)
      errors.push(`object at px ${o.px},${o.py} reads outside ${d.sheets[o.s]}`);
  }

  // Terrain metadata is complete and consistent.
  const cells = d.width * d.height;
  if (d.surface.length !== cells || d.level.length !== cells)
    errors.push('surface/level arrays must have width*height entries');
  else if (d.surface.some((v) => !d.surfaces[v])) errors.push('a cell references a surface that is not in `surfaces`');
  const ramps = new Set(d.ramps);
  const isOpen = (i: number) => !blocked.has(i);
  /** Can a body step between two adjacent cells? Same level, or either cell is a ramp (stairs). */
  const connects = (a: number, b: number) => d.level[a] === d.level[b] || ramps.has(a) || ramps.has(b);
  // Every level change must happen on stairs: an open cell next to an open cell of another level is a gap in a rim.
  const leaks: string[] = [];
  for (let i = 0; i < cells; i++) {
    if (!isOpen(i)) continue;
    const c = i % W;
    for (const j of [c + 1 < W ? i + 1 : -1, i + W]) {
      if (j >= 0 && j < cells && isOpen(j) && !connects(i, j)) leaks.push(`${at(i)}-${at(j)}`);
    }
  }
  if (leaks.length)
    errors.push(
      `open cells on different levels touch without stairs (a plateau rim has a gap): ${leaks.slice(0, 8).join(' ')}${leaks.length > 8 ? ` …(+${leaks.length - 8})` : ''}`,
    );
  // Ramps come in runs (a staircase is two cells); a run must connect two different levels.
  const seenRamp = new Set<number>();
  for (const start of d.ramps) {
    if (seenRamp.has(start)) continue;
    const run = [start];
    seenRamp.add(start);
    for (let k = 0; k < run.length; k++) {
      for (const j of [run[k] + 1, run[k] - 1, run[k] + W, run[k] - W]) {
        if (ramps.has(j) && !seenRamp.has(j)) {
          seenRamp.add(j);
          run.push(j);
        }
      }
    }
    for (const i of run) if (!isOpen(i)) errors.push(`ramp ${at(i)} is blocked`);
    const levels = new Set<number>();
    for (const i of run) {
      levels.add(d.level[i]);
      for (const j of [i + 1, i - 1, i + W, i - W])
        if (j >= 0 && j < cells && isOpen(j) && !ramps.has(j)) levels.add(d.level[j]);
    }
    if (levels.size < 2) warnings.push(`stairs at ${at(start)} don't border a different level, so they lead nowhere`);
  }

  // Points of interest are inside the map and on open ground.
  const points: [string, { col: number; row: number }][] = [['spawn', d.spawn]];
  if (d.npc) points.push(['npc', d.npc]);
  for (const m of d.mobs) {
    points.push([`mob ${m.kind}`, m]);
    if (!MOB_KINDS[m.kind])
      errors.push(`mob kind "${m.kind}" at (${m.col},${m.row}) isn't in MOB_KINDS (src/systems/combat.ts)`);
  }
  for (const sh of d.shops) {
    points.push([`shopkeeper ${sh.shop}`, sh]);
    if (!SHOPS[sh.shop]) errors.push(`shopkeeper at (${sh.col},${sh.row}) runs unknown shop "${sh.shop}" (SHOPS)`);
  }
  const doorCells = new Set<number>();
  for (const door of d.doors) {
    for (let i = 0; i < door.w; i++) {
      points.push([`door to ${door.to.zone}`, { col: door.col + i, row: door.row }]);
      doorCells.add(door.row * W + door.col + i);
    }
    if (door.w < 1) errors.push(`door at (${door.col},${door.row}) is ${door.w} cells wide`);
    if (!door.to.zone) errors.push(`door at (${door.col},${door.row}) leads nowhere`);
  }
  const chestPoints: [string, { col: number; row: number }][] = d.chests.map((c) => {
    if (!(CHEST_KINDS as readonly string[]).includes(c.kind))
      errors.push(`chest at (${c.col},${c.row}) has unknown kind "${c.kind}" (CHEST_KINDS)`);
    if (!CHEST_LOOTS[c.loot]) errors.push(`chest at (${c.col},${c.row}) has unknown loot "${c.loot}" (CHEST_LOOTS)`);
    return [`chest ${c.loot}`, c];
  });
  if (d.chests.length > 30) errors.push('a map holds at most 30 chests');
  for (const [name, p] of points) {
    if (!inMap(p.col, p.row)) errors.push(`${name} (${p.col},${p.row}) is outside the map`);
    else if (blocked.has(p.row * W + p.col)) errors.push(`${name} (${p.col},${p.row}) is on a blocked cell`);
  }

  // Everything is reachable from the spawn (4-way flood fill over open cells).
  const reach = new Uint8Array(d.width * d.height);
  if (inMap(d.spawn.col, d.spawn.row)) {
    const stack = [d.spawn.row * W + d.spawn.col];
    reach[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const c = i % W,
        r = Math.floor(i / W);
      for (const [nc, nr] of [
        [c + 1, r],
        [c - 1, r],
        [c, r + 1],
        [c, r - 1],
      ]) {
        const j = nr * W + nc;
        if (inMap(nc, nr) && !reach[j] && !blocked.has(j) && connects(i, j)) {
          reach[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  for (const [name, p] of points.slice(1)) {
    if (inMap(p.col, p.row) && !blocked.has(p.row * W + p.col) && !reach[p.row * W + p.col]) {
      errors.push(`${name} (${p.col},${p.row}) can't be reached from the spawn`);
    }
  }
  // A chest is solid, so it is opened from a reachable cell beside it.
  for (const [name, p] of chestPoints) {
    const beside = [p.col + 1, p.col - 1].map((c) => [c, p.row]).concat([p.row + 1, p.row - 1].map((r) => [p.col, r]));
    if (!beside.some(([c, r]) => inMap(c, r) && reach[r * W + c]))
      errors.push(`${name} (${p.col},${p.row}) has no reachable cell beside it`);
  }
  const unreachable = d.width * d.height - blocked.size - reach.reduce((n, v) => n + v, 0);
  if (unreachable > 0) {
    const first = reach.findIndex((v, i) => !v && !blocked.has(i));
    warnings.push(`${unreachable} open cells are unreachable from the spawn, e.g. ${at(first)}`);
  }

  // Collision matches the art.
  const cov = coverage(d);
  // Cliff art is flat ground (its grass fringe is walkable), so it doesn't count as foliage to walk into.
  const foliage = coverage({ ...d, objects: d.objects.filter((o) => o.tag !== 'cliff') });
  const hidden: number[] = [];
  const walls: number[] = [];
  cov.forEach((c, i) => {
    const below = i + W;
    // Foliage over an open cell is fine only as the walk-behind fringe just above something solid.
    if (!blocked.has(i) && foliage[i] >= 0.5 && !(below < cov.length && blocked.has(below)) && !doorCells.has(i)) {
      hidden.push(i);
    }
    if (blocked.has(i) && c < 0.15 && !reasons.has(i)) walls.push(i);
  });
  const list = (cells: number[]) =>
    cells.slice(0, 12).map(at).join(' ') + (cells.length > 12 ? ` …(+${cells.length - 12})` : '');
  if (hidden.length) warnings.push(`player can walk into foliage at ${list(hidden)}`);
  if (walls.length) warnings.push(`invisible walls (blocked, almost no art) at ${list(walls)}`);

  return { errors, warnings };
}

/**
 * Checks across zones: every door leads to a zone that exists, lands on an open cell that is not itself a door, and the
 * other zone has a door back (travel is two-way). `maps` is every zone by name.
 */
export function checkDoors(maps: Map<string, MapData>): string[] {
  const errors: string[] = [];
  for (const [name, d] of maps) {
    for (const door of d.doors) {
      const where = `${name}: door at (${door.col},${door.row})`;
      const target = maps.get(door.to.zone);
      if (!target) {
        errors.push(`${where} leads to unknown zone "${door.to.zone}"`);
        continue;
      }
      const { col, row } = door.to;
      const index = row * target.width + col;
      if (col < 0 || row < 0 || col >= target.width || row >= target.height) {
        errors.push(`${where} arrives outside "${door.to.zone}" at (${col},${row})`);
      } else if (target.collision.includes(index)) {
        errors.push(`${where} arrives on a blocked cell of "${door.to.zone}" (${col},${row})`);
      } else if (target.doors.some((t) => row === t.row && col >= t.col && col < t.col + t.w)) {
        errors.push(
          `${where} arrives on a door of "${door.to.zone}" (${col},${row}), which would bounce the player back`,
        );
      }
      if (!target.doors.some((t) => t.to.zone === name)) {
        errors.push(`${where}: "${door.to.zone}" has no door back to "${name}"`);
      }
    }
  }
  return errors;
}
