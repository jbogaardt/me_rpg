// Gates: ways a quest opens (Pixi-free, tested; core engine, capability `changes`). A map marks them (`z.gate`,
// `MapData.gates`); the hero's story names which quest step opens each (`Quest.opens`, `systems/gates.ts`). A zone is built
// with every gate's objects in it, the ones that do not apply faded out, so opening one later (`openGate`) only changes
// what is shown, blocked and walkable: the zone's foes, chests and whoever stands in it carry on. Co-op: a hero's story is
// solo only, so online every gate stands open from the start and nothing is sent.

import { doorCells } from '../map/doors';
import type { DoorSpawn, GateSpawn, MapData } from '../map/types';

/** One gate of a built zone: which objects of the wired map are its seal and its reveal, and the cells it blocks. */
export interface GateLayout {
  gate: GateSpawn;
  /** Indices into the wired map's `objects`. */
  seal: number[];
  reveal: number[];
  /** The cells (row * width + col) the gate blocks while shut: only those the map itself leaves open. */
  cells: number[];
  open: boolean;
}

/** The door a gate makes when it opens (none when it is only a passage). */
export function gateDoor(g: GateSpawn): DoorSpawn | null {
  if (!g.door) return null;
  const door: DoorSpawn = { col: g.col, row: g.row, w: g.w, to: { ...g.door } };
  if (g.h > 1) door.h = g.h;
  return door;
}

/**
 * The map as the game uses it with its gates wired: every gate's seal and reveal objects appended (so each has a fixed
 * index to fade in or out), a shut gate's cells blocked, an open gate's door made. `shut(name)` says which the story
 * keeps shut. Returns a new MapData and one layout per gate; `data` is not changed. No gates: it comes back as it is.
 */
export function wireGates(data: MapData, shut: (name: string) => boolean): { data: MapData; layouts: GateLayout[] } {
  const gates = data.gates ?? [];
  if (!gates.length) return { data, layouts: [] };
  const objects = [...data.objects];
  const doors = [...data.doors];
  const blocked = new Set(data.collision);
  const layouts: GateLayout[] = [];
  for (const gate of gates) {
    const closed = shut(gate.name);
    const seal = (gate.seal ?? []).map((o) => objects.push(o) - 1);
    const reveal = (gate.reveal ?? []).map((o) => objects.push(o) - 1);
    const cells = doorCells(gate)
      .map(([c, r]) => r * data.width + c)
      .filter((i) => !blocked.has(i));
    if (closed) for (const i of cells) blocked.add(i);
    else {
      const door = gateDoor(gate);
      if (door) doors.push(door);
    }
    layouts.push({ gate, seal, reveal, cells, open: !closed });
  }
  return { data: { ...data, objects, doors, collision: [...blocked].sort((a, b) => a - b) }, layouts };
}

/** How visible each object of a wired map's gates starts: a seal only while shut, a reveal only once open (index, alpha). */
export function gateAlphas(layouts: readonly GateLayout[]): [index: number, alpha: number][] {
  return layouts.flatMap((l) => [
    ...l.seal.map((i): [number, number] => [i, l.open ? 0 : 1]),
    ...l.reveal.map((i): [number, number] => [i, l.open ? 1 : 0]),
  ]);
}

/** Every door of a map as it can be once its gates are open: its own and the ones its gates make (the map checks walk these). */
export const allDoors = (data: Pick<MapData, 'doors' | 'gates'>): DoorSpawn[] => [
  ...data.doors,
  ...(data.gates ?? []).flatMap((g) => gateDoor(g) ?? []),
];
