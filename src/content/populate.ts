// Who stands in a zone when it loads: the entities its scenario node places, plus the enemies its biome generates
// (`generation.roam`). Pixi-free and tested. It is deterministic (the same map, node and seeds give the same list in
// the same order), which co-op relies on: a guest builds the same mobs as the host and the host's snapshots refer to
// them by index.

import type { MapData, MobSpawn } from '../map/types';
import { mulberry32 } from '../systems/particles';
import type { BiomeDef, EntityDef, Placement, RoamRule, ScenarioNode } from './schema';

/** A person placed by a scenario: drawn, blocks, and says its `lines` when talked to. */
export interface FolkSpawn {
  entity: string;
  def: EntityDef;
  col: number;
  row: number;
}

export interface Population {
  mobs: MobSpawn[];
  folk: FolkSpawn[];
}

/** A roamer keeps at least this many cells from the neighbouring biome (and the map's edge), clear of the walls. */
export const ROAM_BORDER = 7;

type Ground = Pick<MapData, 'width' | 'height' | 'collision' | 'surface' | 'surfaces'>;

/**
 * Cells far enough from any neighbouring biome's cells (surface `beyond`) and from the map's edge: distance (8-way, in
 * cells) at least `ROAM_BORDER`.
 */
function inland(map: Ground): Uint8Array {
  const { width: w, height: h } = map;
  const beyond = map.surfaces.indexOf('beyond');
  const far = ROAM_BORDER;
  const dist = new Uint8Array(w * h).fill(far);
  let frontier: number[] = [];
  for (let i = 0; i < w * h; i++) {
    const col = i % w;
    const row = (i - col) / w;
    if (map.surface[i] === beyond || col === 0 || row === 0 || col === w - 1 || row === h - 1) {
      dist[i] = 0;
      frontier.push(i);
    }
  }
  for (let d = 1; d < far && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const col = i % w;
      const row = (i - col) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const c = col + dx;
          const r = row + dy;
          if (c < 0 || r < 0 || c >= w || r >= h) continue;
          const j = r * w + c;
          if (dist[j]! > d) {
            dist[j] = d;
            next.push(j);
          }
        }
    }
    frontier = next;
  }
  return dist;
}

/**
 * Spread a roam rule's enemies over the map's open ground: on cells whose whole 3x3 block is open, inland, at least
 * `apart` cells from each other (and from `taken`, roamers placed by an earlier rule), outside every `avoid` circle and, when
 * the rule has `within`, inside one of those. A rule's `level` bands every foe it places (`systems/bands.ts`).
 * Fewer than `count` if there is not the room.
 */
export function roam(map: Ground, rule: RoamRule, taken: [number, number][] = []): MobSpawn[] {
  const { width: w, height: h } = map;
  const blocked = new Uint8Array(w * h);
  for (const i of map.collision) blocked[i] = 1;
  const dist = inland(map);
  const open = (c: number, r: number) => c >= 0 && r >= 0 && c < w && r < h && !blocked[r * w + c];
  const cells: [number, number][] = [];
  for (let row = 1; row < h - 1; row++)
    for (let col = 1; col < w - 1; col++) {
      if (dist[row * w + col]! < ROAM_BORDER) continue;
      let roomy = true;
      for (let dy = -1; dy <= 1 && roomy; dy++)
        for (let dx = -1; dx <= 1 && roomy; dx++) roomy = open(col + dx, row + dy);
      if (roomy) cells.push([col, row]);
    }
  const rand = mulberry32(rule.seed);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  const out: MobSpawn[] = [];
  for (const [col, row] of cells) {
    if (out.length >= rule.count || rule.kinds.length === 0) break;
    if (taken.some(([c, r]) => Math.hypot(c - col, r - row) < rule.apart)) continue;
    if (rule.avoid.some((a) => Math.hypot(a.x - col, a.y - row) < a.radius)) continue;
    if (rule.within && !rule.within.some((a) => Math.hypot(a.x - col, a.y - row) < a.radius)) continue;
    out.push({
      kind: rule.kinds[out.length % rule.kinds.length]!,
      col,
      row,
      ...(rule.level ? { level: rule.level } : {}),
    });
    taken.push([col, row]);
  }
  return out;
}

/**
 * Everyone a zone starts with: the node's placements (mobs, then the roamers of the biome's rules, then whoever a
 * Dungeon Master cast there, in order) and the people it places. With no node (a zone no scenario names), only the biome's roamers.
 */
export function populate(
  map: Ground,
  biome: BiomeDef | undefined,
  node: ScenarioNode | undefined,
  entities: Record<string, EntityDef>,
): Population {
  const mobs: MobSpawn[] = [];
  const folk: FolkSpawn[] = [];
  const place = (p: Placement) => {
    const def = entities[p.entity];
    if (!def) throw new Error(`Scenario "${node?.node_id}" places unknown entity "${p.entity}"`);
    const at = { col: Math.round(p.x), row: Math.round(p.y) };
    if (def.type === 'mob') mobs.push({ kind: p.entity, ...at, ...(p.level ? { level: p.level } : {}) });
    else folk.push({ entity: p.entity, def, ...at });
  };
  (node?.entities ?? []).forEach(place);
  const taken: [number, number][] = [];
  for (const rule of biome?.generation.roam ?? []) mobs.push(...roam(map, rule, taken));
  (node?.cast ?? []).forEach(place); // a Dungeon Master's, after the roamers: see ScenarioNode.cast
  return { mobs, folk };
}
