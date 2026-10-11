import type { Ambient } from '../../entities/ambient';
import type { Character } from '../../entities/Character';
import type { Chest } from '../../entities/Chest';
import type { Effects } from '../../entities/effects';
import type { Mob } from '../../entities/Mob';
import { Player } from '../../entities/Player';
import type { MapView } from '../../map/MapView';
import { CELL, type CellPoint, type MapData } from '../../map/types';
import type { Role } from '../../net/session';
import { newHero } from '../../systems/combat';
import type { Collision } from '../../systems/collision';
import { PLAYER_COLORS, playerName, playerOutfit, playerTag } from '../../systems/looks';
import type { Wardrobe } from '../../sprites/Wardrobe';

/**
 * What the parts of the overworld share: the world and everyone in it (the local player, the friends, the mobs, the
 * chests), the effects layer, and the role this game is running in. The scene builds it; the simulation, the visuals
 * and the two co-op links work on it. It owns the roster of players: adding and removing the friends' players, who
 * blocks whom, and the "P2" tags.
 */
export class Arena {
  /** solo, host or client (see net/session.ts); the scene keeps it in step with the session. */
  role: Role = 'solo';
  /** Seconds since the scene started: drives the guest's invulnerability blink and the ages of world events. */
  clock = 0;
  /** Everyone else in a co-op game, by player number. */
  readonly remotes = new Map<number, Player>();
  /** Everything mobs may attack: the local player's body, then the friends'. */
  readonly heroBodies: [Character, ...Character[]];
  private blockers: Character[] = [];

  constructor(
    readonly world: MapView,
    readonly data: MapData,
    readonly collision: Collision,
    readonly effects: Effects,
    readonly ambient: Ambient,
    readonly wardrobe: Wardrobe,
    readonly local: Player,
    readonly mobs: Mob[],
    readonly chests: Chest[],
    /** Characters that stand still but block others (the NPC, the shopkeepers). */
    private readonly fixed: Character[],
  ) {
    this.heroBodies = [local.body];
  }

  get spawn(): CellPoint {
    return this.data.spawn;
  }

  /** Where a character standing in this cell has its feet (entities are positioned by their feet so they y-sort). */
  cellToFeet(p: CellPoint): [number, number] {
    return [(p.col + 0.5) * CELL, (p.row + 0.9) * CELL];
  }

  /** The local player, then everyone else in the game. */
  players(): Player[] {
    return [this.local, ...this.remotes.values()];
  }

  /** The player with this number, if they are in the game. */
  playerNumbered(slot: number | undefined): Player | undefined {
    return this.players().find((p) => p.slot === slot);
  }

  /**
   * Every character that blocks others. Built once per frame (`refreshBodies`): every mob step asks for it, and a mob that
   * dies mid-frame simply stops blocking from the next one.
   */
  bodies(): Character[] {
    return this.blockers;
  }

  refreshBodies() {
    this.blockers = [
      ...this.players().map((p) => p.body),
      ...this.fixed,
      ...this.mobs.filter((m) => m.alive).map((m) => m.body),
    ];
  }

  // --- The roster ---

  /** Put another player in the world. Their stats are theirs alone: they start as a fresh hero. */
  addRemote(slot: number): Player {
    const hero = newHero();
    hero.name = playerName(slot);
    const remote = new Player(this.wardrobe.sheet(playerOutfit(slot, hero)), hero, slot);
    this.world.layer.addChild(remote.body);
    this.remotes.set(slot, remote);
    this.syncHeroBodies();
    this.applyTags();
    return remote;
  }

  /** Take a player out of the world, with `notice` called first (to float a message where they stood). */
  removeRemote(slot: number, notice: (p: Player) => void) {
    const remote = this.remotes.get(slot);
    if (!remote) return;
    notice(remote);
    this.remotes.delete(slot);
    this.world.layer.removeChild(remote.body);
    this.ambient.forget(remote.body);
    remote.body.destroy({ children: true });
    this.syncHeroBodies();
  }

  /** In a co-op game every player wears a coloured tag ("P2") over their head, so friends can tell each other apart. */
  applyTags() {
    for (const p of this.players()) p.body.setTag(playerTag(p.slot), PLAYER_COLORS[p.slot]);
  }

  private syncHeroBodies() {
    this.heroBodies.splice(
      0,
      this.heroBodies.length,
      this.local.body,
      ...[...this.remotes.values()].map((p) => p.body),
    );
  }
}
