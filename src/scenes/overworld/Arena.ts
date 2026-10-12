import { Character } from '../../entities/Character';
import { Player } from '../../entities/Player';
import type { Role } from '../../net/session';
import { newHero, type Hero } from '../../systems/combat';
import { heroOutfit, PLAYER_COLORS, playerName, playerOutfit, playerTag } from '../../systems/looks';
import type { Wardrobe } from '../../sprites/Wardrobe';
import type { ZoneMemory, ZoneState } from '../ZoneState';

/**
 * What the parts of the overworld share: who is in the game (the local player at this keyboard, and the co-op friends),
 * which zones are loaded, the role this game is running in, the clock and the weather.
 *
 * The zone context: the rules are written once and serve every zone. `zone` is the zone the code is working in right now
 * (outside the per-zone loops it is the local player's zone); a loop that handles another zone wraps its work in
 * `inZone(z, ...)`, and the zone-shaped getters below (`mobs`, `collision`, `effects`...) then answer for that zone.
 */
export class Arena {
  /** solo, host or client (see net/session.ts); the scene keeps it in step with the session. */
  role: Role = 'solo';
  /** Seconds since the scene started: drives the guest's invulnerability blink and the ages of world events. */
  clock = 0;
  /** The window size in CSS px (set by the scene on resize). */
  screen = { width: 0, height: 0 };
  /** Every loaded zone, by name. */
  readonly zones = new Map<string, ZoneState>();
  /** What the zones that were unloaded remember (opened chests, items on the ground), restored when they load again. */
  readonly memory = new Map<string, ZoneMemory>();
  /** Everyone else in a co-op game, by player number. */
  readonly remotes = new Map<number, Player>();
  readonly local: Player;

  /** Where the game starts and where a defeated player wakes (set when the first zone is added). */
  home!: ZoneState;
  /** The zone the code is working in right now. */
  zone!: ZoneState;
  /** The local player's zone: what is drawn, and what `zone` goes back to. */
  view!: ZoneState;
  private depth = 0; // how many `inZone` calls are open

  constructor(readonly wardrobe: Wardrobe) {
    const hero = newHero();
    this.local = new Player(wardrobe.sheet(heroOutfit(hero)), hero);
  }

  get player(): Character {
    return this.local.body;
  }

  get hero(): Hero {
    return this.local.hero;
  }

  /** Run `fn` with `z` as the zone the code is working in. */
  inZone<T>(z: ZoneState, fn: () => T): T {
    const before = this.zone;
    this.zone = z;
    this.depth++;
    try {
      return fn();
    } finally {
      this.depth--;
      // If the local player changed zones meanwhile (a door, a defeat), the outermost call ends in their new zone.
      this.zone = this.depth === 0 ? this.view : before;
    }
  }

  /** Point the context at the local player's zone, unless a per-zone loop is running. */
  setView(z: ZoneState) {
    this.view = z;
    if (this.depth === 0) this.zone = z;
  }

  // The zone being worked in, under the names the rules use.
  get world() {
    return this.zone.world;
  }
  get camera() {
    return this.zone.camera;
  }
  get collision() {
    return this.zone.collision;
  }
  get effects() {
    return this.zone.effects;
  }
  get data() {
    return this.zone.data;
  }
  get npc() {
    return this.zone.npc;
  }
  get pets() {
    return this.zone.pets;
  }
  get keepers() {
    return this.zone.keepers;
  }
  get mobs() {
    return this.zone.mobs;
  }
  get chests() {
    return this.zone.chests;
  }
  get ground() {
    return this.zone.ground;
  }

  /** Every player in the game, wherever they are: the local one, then the rest. */
  everyone(): Player[] {
    return [this.local, ...this.remotes.values()];
  }

  /** The zone a player is in (the start zone for one that is somewhere unknown). */
  zoneOf(p: Player): ZoneState {
    return this.zones.get(p.zone) ?? this.home;
  }

  /** The players in the zone being worked in: the local one first if it is here, then the rest. */
  players(): Player[] {
    return this.everyone().filter((p) => p.zone === this.zone.name);
  }

  /** The player with this number, if they are in the zone being worked in. */
  playerNumbered(slot: number | undefined): Player | undefined {
    return this.players().find((p) => p.slot === slot);
  }

  /** The zones that have a player in them: the only ones worth simulating. The local player's comes first. */
  occupiedZones(): ZoneState[] {
    return [...new Set(this.everyone().map((p) => this.zoneOf(p)))];
  }

  /** Every character that blocks others in the zone being worked in. */
  bodies(): Character[] {
    return [
      ...this.players().map((p) => p.body),
      ...(this.npc ? [this.npc] : []),
      ...this.keepers.map((k) => k.body),
      ...this.mobs.filter((m) => m.alive).map((m) => m.body),
    ];
  }

  /** In every zone, the bodies of the players there: everyone mobs may attack, and everyone who blocks others. */
  syncHeroBodies() {
    for (const z of this.zones.values()) {
      z.heroBodies.splice(
        0,
        z.heroBodies.length,
        ...this.everyone()
          .filter((p) => p.zone === z.name)
          .map((p) => p.body),
      );
    }
  }

  /** In a co-op game every player wears a coloured tag ("P2") over their head, so friends can tell each other apart. */
  applyTags() {
    for (const p of this.everyone()) p.body.setTag(playerTag(p.slot), PLAYER_COLORS[p.slot]);
  }

  /** Redraw a player (the local one by default) for what they now wear. */
  refreshLook(p: Player = this.local) {
    p.body.setSheet(this.wardrobe.sheet(playerOutfit(p.slot, p.hero)));
  }

  /** Put another player in the world. Their stats are theirs alone: they start as a fresh hero. */
  addRemote(slot: number, where: ZoneState = this.zone): Player {
    const hero = newHero();
    hero.name = playerName(slot);
    const remote = new Player(this.wardrobe.sheet(playerOutfit(slot, hero)), hero, slot);
    remote.zone = where.name;
    where.world.layer.addChild(remote.body);
    this.remotes.set(slot, remote);
    this.syncHeroBodies();
    this.applyTags();
    return remote;
  }

  /**
   * Take a player out of the world, with `notice` called first (to float a message where they stood). Whoever tracks that
   * friend elsewhere (the host's per-friend state) forgets them too.
   */
  removeRemote(slot: number, notice: (p: Player) => void) {
    const remote = this.remotes.get(slot);
    if (!remote) return;
    const where = this.zoneOf(remote);
    this.inZone(where, () => notice(remote));
    this.remotes.delete(slot);
    remote.body.parent?.removeChild(remote.body);
    where.ambient?.forget(remote.body);
    remote.body.destroy({ children: true, context: true });
    this.syncHeroBodies();
  }
}
