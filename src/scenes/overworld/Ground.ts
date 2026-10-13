import { DIR_VEC } from '../../core/direction';
import { GroundItem } from '../../entities/GroundItem';
import type { Player } from '../../entities/Player';
import type { GroundSnap } from '../../net/protocol';
import type { Item } from '../../systems/combat';
import { addToPack, GROUND_LIFETIME, itemFromCode, MAX_GROUND } from '../../systems/inventory';
import type { Arena } from './Arena';
import { PICKUP_REACH } from './constants';
import type { Simulation } from './Simulation';

/**
 * Items lying on the ground (dropped from a pack, so they crumble after a while): putting them down, picking them up,
 * letting time pass, and (co-op) showing the host's list to a guest. Each zone keeps its own list (`ZoneState.ground`); this
 * works on the arena's current zone.
 */
export class Ground {
  private nextId = 0; // host and solo: numbers the items on the ground (guests are told the numbers)
  private soloGround = new Map<string, { item: Item; x: number; y: number; age: number }[]>(); // a guest's solo items

  constructor(
    private arena: Arena,
    private sim: Pick<Simulation, 'text' | 'fx'>,
  ) {}

  /** No room for another item on the ground here. */
  get full(): boolean {
    return this.arena.ground.length >= MAX_GROUND;
  }

  add(item: Item, x: number, y: number, id = ++this.nextId, age = 0) {
    const g = new GroundItem(item, x, y, id, age);
    this.arena.ground.push(g);
    this.arena.world.layer.addChild(g);
  }

  remove(g: GroundItem) {
    this.arena.ground.splice(this.arena.ground.indexOf(g), 1);
    g.destroy({ children: true, context: true }); // also takes it off the world layer
  }

  /** The item a player is standing close enough to pick up, if any. */
  nearest(p: Player): GroundItem | undefined {
    let best: GroundItem | undefined;
    let bestDist = PICKUP_REACH;
    for (const g of this.arena.ground) {
      const d = Math.hypot(p.body.x - g.x, p.body.y - g.y);
      if (d < bestDist) [best, bestDist] = [g, d];
    }
    return best;
  }

  /** Pick an item up off the ground into the player's pack (it stays put if the pack is full). */
  pickUp(p: Player, g: GroundItem) {
    const [x, y, name] = [g.x, g.y, g.item.name];
    if (!addToPack(p.hero, g.item)) return this.sim.text(x, y - 22, 'Pack full', 0xff8a7a);
    this.remove(g);
    this.sim.text(x, y - 22, name, 0xffd34d);
  }

  /** Host and solo: let time pass for the items on the ground here; one that has lain too long puffs away. */
  age(dt: number) {
    for (const g of [...this.arena.ground]) {
      g.tick(dt);
      if (g.remaining > 0) continue;
      this.sim.fx('mobPoof', g.x, g.y - 8);
      this.remove(g);
    }
  }

  /** Put an item on the ground a step ahead of a player (or at their feet if something is in the way). */
  drop(p: Player, item: Item) {
    const { x, y, facing } = p.body;
    const [vx, vy] = DIR_VEC[facing];
    const fits = this.arena.collision.fitsMap(x + vx * 20, y + vy * 20);
    this.add(item, fits ? x + vx * 20 : x, fits ? y + vy * 20 : y);
  }

  // --- Co-op guest ---

  /** Guest: show the items the host says are on the ground in this zone (and no others). */
  sync(list: GroundSnap[]) {
    const ids = new Set(list.map((g) => g[0]));
    for (const g of [...this.arena.ground]) if (!ids.has(g.id)) this.remove(g);
    for (const [id, x, y, code, left] of list) {
      const known = this.arena.ground.find((g) => g.id === id);
      const item = itemFromCode(code);
      if (known) known.setRemaining(left);
      else if (item) this.add(item, x, y, id, GROUND_LIFETIME - left);
    }
  }

  /** Guest joining: set this machine's own items on the ground aside, and clear every zone for the host's. */
  stash() {
    this.soloGround.clear();
    for (const z of this.arena.zones.values()) {
      this.soloGround.set(
        z.name,
        z.ground.map((g) => ({ item: g.item, x: g.x, y: g.y, age: g.age })),
      );
      for (const g of [...z.ground]) {
        z.ground.splice(z.ground.indexOf(g), 1);
        g.destroy({ children: true, context: true });
      }
    }
    // Zones unloaded meanwhile keep their items in the arena's memory: set those aside too.
    for (const [name, memory] of this.arena.memory) {
      this.soloGround.set(
        name,
        memory.ground.map(({ item, x, y, age }) => ({ item, x, y, age })),
      );
      memory.ground = [];
    }
  }

  /** Back to solo: the host's items go, and this machine's own come back (with the time they had left). */
  restore() {
    for (const z of this.arena.zones.values()) {
      for (const g of [...z.ground]) {
        z.ground.splice(z.ground.indexOf(g), 1);
        g.destroy({ children: true, context: true });
      }
      for (const { item, x, y, age } of this.soloGround.get(z.name) ?? []) {
        const g = new GroundItem(item, x, y, ++this.nextId, age);
        z.ground.push(g);
        z.world.layer.addChild(g);
      }
      this.soloGround.delete(z.name);
    }
    // A zone that is not loaded now gets its items back when it is (Zones.add reads the memory).
    for (const [name, items] of this.soloGround) {
      const memory = this.arena.memory.get(name) ?? { opened: [], crops: [], ground: [] };
      memory.ground = items.map((g) => ({ ...g, id: ++this.nextId }));
      this.arena.memory.set(name, memory);
    }
    this.soloGround.clear();
  }
}
