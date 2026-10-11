import { MOB_KINDS } from '../../src/game/combat';
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
    if (g[1] + CELL > img.width || g[2] + CELL > img.height) errors.push(`ground ${at(i)} reads outside ${d.sheets[g[0]]}`);
  });
  if (d.ground.some((g) => !g)) warnings.push(`${d.ground.filter((g) => !g).length} cells have no ground (they show the background colour)`);
  for (const o of d.objects) {
    const img = sheet(d.sheets[o.s]);
    if (o.x + o.w > img.width || o.y + o.h > img.height) errors.push(`object at px ${o.px},${o.py} reads outside ${d.sheets[o.s]}`);
  }

  // Points of interest are inside the map and on open ground.
  const points: [string, { col: number; row: number }][] = [['spawn', d.spawn]];
  if (d.npc) points.push(['npc', d.npc]);
  for (const m of d.mobs) {
    points.push([`mob ${m.kind}`, m]);
    if (!MOB_KINDS[m.kind]) errors.push(`mob kind "${m.kind}" at (${m.col},${m.row}) isn't in MOB_KINDS (src/game/combat.ts)`);
  }
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
      const c = i % W, r = Math.floor(i / W);
      for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
        const j = nr * W + nc;
        if (inMap(nc, nr) && !reach[j] && !blocked.has(j)) {
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
  const unreachable = d.width * d.height - blocked.size - reach.reduce((n, v) => n + v, 0);
  if (unreachable > 0) {
    const first = reach.findIndex((v, i) => !v && !blocked.has(i));
    warnings.push(`${unreachable} open cells are unreachable from the spawn, e.g. ${at(first)}`);
  }

  // Collision matches the art.
  const cov = coverage(d);
  const hidden: number[] = [];
  const walls: number[] = [];
  cov.forEach((c, i) => {
    const below = i + W;
    // Foliage over an open cell is fine only as the walk-behind fringe just above something solid.
    if (!blocked.has(i) && c >= 0.5 && !(below < cov.length && blocked.has(below))) hidden.push(i);
    if (blocked.has(i) && c < 0.15 && !reasons.has(i)) walls.push(i);
  });
  const list = (cells: number[]) => cells.slice(0, 12).map(at).join(' ') + (cells.length > 12 ? ` …(+${cells.length - 12})` : '');
  if (hidden.length) warnings.push(`player can walk into foliage at ${list(hidden)}`);
  if (walls.length) warnings.push(`invisible walls (blocked, almost no art) at ${list(walls)}`);

  return { errors, warnings };
}
