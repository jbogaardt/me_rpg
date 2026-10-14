import { isTrialZone } from '../../src/systems/skills';
import { CHEST_KINDS, CHEST_LOOTS } from '../../src/systems/chests';
import { CROPS, MAX_CROPS } from '../../src/systems/crops';
import { ITEMS } from '../../src/systems/items';
import { PET_KINDS } from '../../src/systems/pets';
import { GIVERS, SITE_KINDS } from '../../src/systems/quests';
import { ZONE_NAMES } from '../../src/systems/places';
import { SHOPS } from '../../src/systems/shops';
import { isClimate } from '../../src/systems/weather';
import { CELL, type DoorSpawn, type MapData } from '../../src/map/types';
import { doorCells as cellsOf, onDoor } from '../../src/map/doors';
import { coverage, sheet } from './image';
import { BARE_WALL } from './zone';
import { CLASH_DE, groundReport } from './ground';
import { walkFrom } from './walk';

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
    for (let k = 0; k + 2 < g.length; k += 3) {
      const img = sheet(d.sheets[g[k]]);
      if (g[k + 1] + CELL > img.width || g[k + 2] + CELL > img.height)
        errors.push(`ground ${at(i)} reads outside ${d.sheets[g[k]]}`);
    }
  });
  // Cells of a neighbouring biome far off the edge of the screen are left bare on purpose (tools/map/world.ts).
  const beyond = d.surfaces.indexOf('beyond');
  const bare = d.ground.filter((g, i) => !g && d.surface[i] !== beyond).length;
  if (bare) warnings.push(`${bare} cells have no ground (they show the background colour)`);
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

  if (!isClimate(d.climate)) errors.push(`climate "${d.climate}" isn't in CLIMATES (src/systems/weather.ts)`);

  // Points of interest are inside the map and on open ground.
  const points: [string, { col: number; row: number }][] = [['spawn', d.spawn]];
  if (d.npc) points.push(['npc', d.npc]);
  for (const sh of d.shops) {
    points.push([`shopkeeper ${sh.shop}`, sh]);
    if (!SHOPS[sh.shop]) errors.push(`shopkeeper at (${sh.col},${sh.row}) runs unknown shop "${sh.shop}" (SHOPS)`);
  }
  for (const p of d.pets) {
    points.push([`pet ${p.kind}`, p]);
    if (!PET_KINDS[p.kind]) errors.push(`pet at (${p.col},${p.row}) is an unknown kind "${p.kind}" (PET_KINDS)`);
  }
  for (const g of d.givers) {
    points.push([`quest giver ${g.giver}`, g]);
    if (!GIVERS[g.giver]) errors.push(`quest giver at (${g.col},${g.row}) is unknown "${g.giver}" (GIVERS)`);
  }
  for (const s of d.sites) {
    points.push([`quest site ${s.kind}`, s]);
    if (!SITE_KINDS[s.kind])
      errors.push(`quest site at (${s.col},${s.row}) is an unknown kind "${s.kind}" (SITE_KINDS)`);
  }
  for (const pl of d.places)
    if (!inMap(pl.col, pl.row)) errors.push(`place "${pl.name}" (${pl.col},${pl.row}) is outside the map`);
  if (d.sites.length > 30) errors.push('a map holds at most 30 quest sites');
  const doorCells = new Set<number>();
  for (const door of d.doors) {
    for (const [col, row] of cellsOf(door)) {
      points.push([`door to ${door.to.zone}`, { col, row }]);
      doorCells.add(row * W + col);
    }
    if (door.w < 1) errors.push(`door at (${door.col},${door.row}) is ${door.w} cells wide`);
    if (!door.to.zone) errors.push(`door at (${door.col},${door.row}) leads nowhere`);
  }
  const portNames = new Set<string>();
  for (const port of d.ports) {
    const at = `port "${port.name}" at (${port.col},${port.row})`;
    if (portNames.has(port.name)) errors.push(`${at}: the name is used twice`);
    portNames.add(port.name);
    if (port.w < 1) errors.push(`${at} is ${port.w} cells wide`);
    for (const [col, row] of cellsOf(port)) {
      points.push([`port ${port.name}`, { col, row }]);
      doorCells.add(row * W + col);
    }
    points.push([`port ${port.name}'s arrival`, port.arrive]);
    if (!port.seal?.length)
      errors.push(`${at} has no seal (z.port's last argument): left unbound it would be an open way to nowhere`);
  }
  for (const port of d.ports)
    if (doorCells.has(port.arrive.row * W + port.arrive.col))
      errors.push(
        `port "${port.name}" arrives on a doorway (${port.arrive.col},${port.arrive.row}), which would bounce the player back`,
      );
  const chestPoints: [string, { col: number; row: number }][] = d.chests.map((c) => {
    if (!(CHEST_KINDS as readonly string[]).includes(c.kind))
      errors.push(`chest at (${c.col},${c.row}) has unknown kind "${c.kind}" (CHEST_KINDS)`);
    if (!CHEST_LOOTS[c.loot]) errors.push(`chest at (${c.col},${c.row}) has unknown loot "${c.loot}" (CHEST_LOOTS)`);
    return [`chest ${c.loot}`, c];
  });
  if (d.chests.length > 30) errors.push('a map holds at most 30 chests');
  for (const c of d.crops) {
    const kind = (CROPS as Record<string, { item: string }>)[c.kind];
    if (!kind) errors.push(`crop at (${c.col},${c.row}) has unknown kind "${c.kind}" (CROPS)`);
    else if (!ITEMS[kind.item])
      errors.push(
        `crop ${c.kind} at (${c.col},${c.row}) yields "${kind.item}", which this campaign's items.json lacks`,
      );
    chestPoints.push([`crop ${c.kind}`, c]); // solid like a chest: picked from a reachable cell beside it
  }
  if (d.crops.length && !Object.values(ITEMS).some((i) => i.waters))
    errors.push("crop plots, but nothing in this campaign's items.json `waters` them");
  if (d.crops.length > MAX_CROPS) errors.push(`a map holds at most ${MAX_CROPS} crop plots`);
  // A signpost names at least two ways (a fork), each a zone or a place on this map, and is read from beside it.
  const placeNames = new Set(d.places.map((p) => p.name));
  for (const sg of d.signs) {
    const ways = Object.entries(sg.ways);
    if (ways.length < 2) errors.push(`signpost at (${sg.col},${sg.row}) names fewer than two ways`);
    for (const [dir, to] of ways)
      if (!['up', 'down', 'left', 'right'].includes(dir) || !to || (!ZONE_NAMES[to] && !placeNames.has(to)))
        errors.push(
          `signpost at (${sg.col},${sg.row}): "${dir}" leads to "${to}", not a zone (ZONE_NAMES) or a place here`,
        );
    chestPoints.push(['signpost', sg]);
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
  // Jarring ground (tools/map/ground.ts): hard seams and clashing shades, measured on the art. Rooms are exempt: their
  // walls meet their floors on purpose.
  if (!d.indoor) {
    const g = groundReport(d);
    const where = (ps: { col: number; row: number }[]) =>
      ps
        .slice(0, 8)
        .map((p) => `(${p.col},${p.row})`)
        .join(' ') + (ps.length > 8 ? ` …(+${ps.length - 8})` : '');
    if (g.seams.length)
      errors.push(
        `${g.seams.length} hard seams in the ground (the colour jumps on a cell boundary: a fill against a fill, a ` +
          `paved rect, a plateau top unlike its rim) at ${where(g.seams)}; use a soft-edged terrain or a patch`,
      );
    if (g.clashes.length) {
      const kinds = [...new Set(g.clashes.map((c) => c.surface))].join(', ');
      errors.push(
        `${g.clashes.length} clashing shades of ${kinds} next to each other at ${where(g.clashes)}: a biome's ` +
          `grounds must be close in colour (ΔE <= ${CLASH_DE})`,
      );
    }
  }
  const bareWall = [...reasons].filter(([, why]) => why === BARE_WALL).map(([i]) => i);
  if (bareWall.length)
    errors.push(
      `a wall's border row has cells with nothing drawn on them at ${bareWall.slice(0, 12).map(at).join(' ')}`,
    );
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
      } else if (target.doors.some((t) => onDoor(t, col, row))) {
        errors.push(
          `${where} arrives on a door of "${door.to.zone}" (${col},${row}), which would bounce the player back`,
        );
      }
      if (!target.doors.some((t) => t.to.zone === name) && !isTrialZone(name)) {
        errors.push(`${where}: "${door.to.zone}" has no door back to "${name}"`);
      }
    }
  }
  return errors;
}

const STEP_OF = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] } as const;
/** How many cells past a door the way ahead must stay open, and how far a body must be able to walk from it. */
const CLEAR_AHEAD = 6;
const WALK_OUT = 30;

/**
 * What a player meets after stepping through each door (`maps` is every zone by name): they arrive on open ground that
 * fits their feet; the line ahead of every door cell stays open for `CLEAR_AHEAD` cells, so there is no bush or trunk in
 * the doorway; and walking with the real collision box they get at least `WALK_OUT` cells away (or to the zone's
 * spawn, in a small zone), so the doorway is not a pocket. Doors that name no direction (shop doors) are left to `checkDoors`.
 */
export function checkCrossings(maps: Map<string, MapData>): string[] {
  const errors: string[] = [];
  for (const [name, d] of maps) {
    for (const door of d.doors) {
      const target = maps.get(door.to.zone);
      if (!target || !door.dir) continue;
      const { col, row } = door.to;
      const where = `${name}: door (${door.col},${door.row}) into ${door.to.zone} (${col},${row})`;
      const blocked = new Set(target.collision);
      const [dc, dr] = STEP_OF[door.dir];
      let shut = -1;
      for (let k = 0; k < CLEAR_AHEAD && shut < 0; k++) {
        const c = col + k * dc,
          r = row + k * dr;
        if (c < 0 || r < 0 || c >= target.width || r >= target.height || blocked.has(r * target.width + c)) shut = k;
      }
      if (shut >= 0) {
        errors.push(`${where}: the way ahead is blocked ${shut} cells past the door`);
        continue;
      }
      const walk = walkFrom(target, col, row, WALK_OUT);
      if (!walk.start) errors.push(`${where}: the feet do not fit where the player arrives`);
      else if (walk.far < WALK_OUT && !walk.reached(target.spawn.col, target.spawn.row))
        errors.push(
          `${where}: a dead end, a body can only walk ${walk.far} cells from here and never reaches the spawn`,
        );
    }
  }
  return errors;
}

/** The parts of the world layout (tools/map/world.ts `World`) the seam check needs. */
export interface SeamWorld {
  width: number;
  height: number;
  names: string[];
  owner: Int16Array; // per world cell: index into `names`
  crop(name: string): { col: number; row: number; w: number; h: number };
}

/**
 * The borders between biomes match: for every two neighbouring world cells owned by different biomes, both sides are
 * walled (blocked in their own maps), or both are doors leading straight across to each other. Nothing else may be
 * open there, and every cell on the edge of the world is blocked. `maps` holds every zone by name.
 */
export function checkSeams(world: SeamWorld, maps: Map<string, MapData>): string[] {
  const errors = new Map<string, string[]>();
  const fail = (what: string, at: string) => errors.set(what, [...(errors.get(what) ?? []), at]);
  const views = world.names.map((name) => {
    const d = maps.get(name);
    if (!d) throw new Error(`no map for biome ${name}`);
    const crop = world.crop(name);
    const blocked = new Set(d.collision);
    const doors = new Map<number, DoorSpawn>();
    for (const door of d.doors) for (let k = 0; k < door.w; k++) doors.set(door.row * d.width + door.col + k, door);
    return { name, d, crop, blocked, doors };
  });
  const cell = (k: number, col: number, row: number) => {
    const v = views[k];
    const i = (row - v.crop.row) * v.d.width + col - v.crop.col;
    return { v, blocked: v.blocked.has(i), door: v.doors.get(i) };
  };
  const W = world.width;
  for (let row = 0; row < world.height; row++) {
    for (let col = 0; col < W; col++) {
      const a = world.owner[row * W + col];
      if (row === 0 || col === 0 || row === world.height - 1 || col === W - 1) {
        if (!cell(a, col, row).blocked) fail(`${world.names[a]}: open on the edge of the world`, `(${col},${row})`);
      }
      for (const [dc, dr, dir] of [
        [1, 0, 'right'],
        [0, 1, 'down'],
      ] as const) {
        const [bc, br] = [col + dc, row + dr];
        if (bc >= W || br >= world.height) continue;
        const b = world.owner[br * W + bc];
        if (a === b) continue;
        const A = cell(a, col, row),
          B = cell(b, bc, br);
        const seam = `${A.v.name}|${B.v.name}`;
        const at = `(${col},${row})`;
        if (A.blocked && B.blocked) continue;
        if (A.blocked !== B.blocked) {
          fail(`${seam}: the walls don't match (open on the ${A.blocked ? B.v.name : A.v.name} side only)`, at);
          continue;
        }
        // Both open: a gap, so both must be doors straight across to each other.
        const across = (door: DoorSpawn | undefined, to: (typeof views)[number], c: number, r: number, way: string) => {
          if (!door || door.to.zone !== to.name) return false;
          const wc = door.to.col + to.crop.col,
            wr = door.to.row + to.crop.row;
          return dc ? wr === r && (way === 'right' ? wc > c : wc < c) : wc === c && (way === 'down' ? wr > r : wr < r);
        };
        const back = dir === 'right' ? 'left' : 'up';
        if (!across(A.door, B.v, col, row, dir) || !across(B.door, A.v, bc, br, back))
          fail(`${seam}: open across the border without a pair of doors straight across`, at);
      }
    }
  }
  return [...errors].map(
    ([what, at]) => `${what} at ${at.slice(0, 6).join(' ')}${at.length > 6 ? ` …(+${at.length - 6})` : ''}`,
  );
}
