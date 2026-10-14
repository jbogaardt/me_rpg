// Packs MapData into the on-disk map format (PackedMap in src/map/types.ts): shared ground stacks and object parts, so
// a big zone's file stays small. parseMap reads it back.

import type { GroundCell, MapData, PackedMap } from '../../src/map/types';

export function packMap(d: MapData): PackedMap {
  const palette: GroundCell[] = [];
  const stackIndex = new Map<string, number>();
  const ground = d.ground.map((g) => {
    if (!g) return -1;
    const key = g.join(',');
    let k = stackIndex.get(key);
    if (k === undefined) stackIndex.set(key, (k = palette.push(g) - 1));
    return k;
  });
  const tags: string[] = [];
  const parts: PackedMap['parts'] = [];
  const partIndex = new Map<string, number>();
  const objects: number[] = [];
  for (const o of d.objects) {
    let tag = -1;
    if (o.tag) {
      tag = tags.indexOf(o.tag);
      if (tag < 0) tag = tags.push(o.tag) - 1;
    }
    const part: PackedMap['parts'][number] = [o.s, o.x, o.y, o.w, o.h, tag, o.z ?? null];
    const key = part.join(',');
    let k = partIndex.get(key);
    if (k === undefined) partIndex.set(key, (k = parts.push(part) - 1));
    objects.push(k, o.px, o.py);
  }
  const { version: _v, ground: _g, objects: _o, ports, ...rest } = d;
  // A map with no ports leaves the field out (parseMap reads it as none), so the files of maps without any stay as they were.
  return { version: 3, ...rest, ...(ports.length ? { ports } : {}), palette, ground, tags, parts, objects };
}

/** The file contents for a map. */
export const mapJson = (d: MapData) => JSON.stringify(packMap(d));
