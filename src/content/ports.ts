// Ports: doorways whose far side the content decides (Pixi-free, tested). A map marks them (`z.port`, MapData.ports);
// a campaign's biomes.json binds each to another map's port (`BiomeDef.ports`), and a random campaign's assembler
// does the binding itself. When a zone is loaded the bound ports become ordinary doors (`wireDoors`), so travel,
// prefetching and co-op see nothing new; a port nothing binds is walled up.

import { doorCells } from '../map/doors';
import type { CellPoint, DoorSpawn, MapData } from '../map/types';

/** Where a port leads: the port `port` of the map `map`. */
export interface PortBinding {
  map: string;
  port: string;
}

/**
 * The map as the game uses it: each bound port made a door to the other map's port (`to.port` names it; the arrival is
 * that port's `arrive`, read from the other map when the player goes through, `portArrival`), and each unbound port's
 * cells blocked and its `seal` drawn across them. Returns a new MapData; `data` is not changed. A map with no ports comes back as it is.
 */
export function wireDoors(data: MapData, bindings: Record<string, PortBinding> | undefined): MapData {
  if (!data.ports.length) return data;
  const doors: DoorSpawn[] = [...data.doors];
  const blocked = new Set(data.collision);
  const objects = [...data.objects];
  for (const port of data.ports) {
    const to = bindings?.[port.name];
    if (to) {
      doors.push(portDoor(port, to));
    } else {
      for (const [c, r] of doorCells(port)) blocked.add(r * data.width + c);
      objects.push(...(port.seal ?? [])); // the doorway is seen to be closed
    }
  }
  return { ...data, doors, objects, collision: [...blocked].sort((a, b) => a - b) };
}

/** Where a player coming in through `port` appears (the map's spawn if it has no such port). */
export function portArrival(data: Pick<MapData, 'ports' | 'spawn'>, port: string): CellPoint {
  return data.ports.find((p) => p.name === port)?.arrive ?? data.spawn;
}

/** Where a door puts a player in `dest`: its own cell, or the arrival of the port it names. */
export const doorArrival = (door: DoorSpawn, dest: Pick<MapData, 'ports' | 'spawn'>): CellPoint =>
  door.to.port ? portArrival(dest, door.to.port) : door.to;

/** The door a port becomes when it is bound to `to`. */
function portDoor(port: MapData['ports'][number], to: PortBinding): DoorSpawn {
  const door: DoorSpawn = {
    col: port.col,
    row: port.row,
    w: port.w,
    to: { zone: to.map, col: -1, row: -1, port: to.port },
  };
  if (port.h > 1) door.h = port.h;
  return door;
}

/**
 * Opening a port of a zone already built (a live world's story reached it): `raw` is the map as loaded and `before`
 * the bindings it was wired with (`wireDoors`). Says the door the port becomes, the cells its seal blocked that are
 * open on the map itself, and which of the wired map's objects are that seal (to fade out). Null when the port does
 * not exist or was already bound.
 */
export function openPort(
  raw: MapData,
  before: Record<string, PortBinding> | undefined,
  name: string,
  to: PortBinding,
): { door: DoorSpawn; cells: number[]; seal: number[] } | null {
  let index = raw.objects.length; // wireDoors draws the seals after the map's own objects, port by port
  const open = new Set(raw.collision);
  for (const port of raw.ports) {
    if (before?.[port.name]) continue;
    const size = port.seal?.length ?? 0;
    if (port.name === name) {
      const cells = doorCells(port)
        .map(([c, r]) => r * raw.width + c)
        .filter((cell) => !open.has(cell));
      return { door: portDoor(port, to), cells, seal: Array.from({ length: size }, (_, i) => index + i) };
    }
    index += size;
  }
  return null;
}
