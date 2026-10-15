import type { Menu } from '../../hud/Menu';
import type { PartyRow } from '../../hud/Party';
import { CELL } from '../../map/types';
import { PLAYER_COLORS, playerName } from '../../systems/looks';
import { zoneName } from '../../systems/places';
import { currentQuest } from '../../systems/quests';
import type { Arena } from './Arena';
import type { Zones } from './Zones';

/** What the Dungeon Master's Party tab shows and does: the players listed, and stepping to one's side. */
export class PartyUi {
  constructor(
    private arena: Arena,
    private zones: Zones,
    private menu: Menu,
    /** Let go of a foe the DM is holding (the DM goes alone). */
    private release: () => void,
  ) {}

  /** The players as the Dungeon Master's Party tab lists them. */
  rows(): PartyRow[] {
    const { arena } = this;
    return [...arena.remotes.values()]
      .filter((p) => !p.dm)
      .map((p) => ({
        slot: p.slot,
        name: playerName(p.slot),
        color: PLAYER_COLORS[p.slot] ?? 0xffffff,
        level: p.hero.stats.level,
        hp: p.hero.stats.hp,
        maxHp: p.hero.stats.maxHp,
        where: zoneName(p.zone),
        quest: currentQuest(p.hero.quests)?.title ?? '',
        here: p.zone === arena.local.zone,
      }));
  }

  /** The Dungeon Master steps to a player's side, through the iris, wherever in the world they are. */
  goTo(slot: number) {
    const { arena } = this;
    const p = arena.remotes.get(slot);
    if (!arena.local.dm || !p || this.zones.transition.busy) return;
    this.release(); // a held foe stays where it is: the DM goes alone
    this.menu.close();
    const dest = arena.zoneOf(p);
    this.zones.travel(arena.local, dest, { col: Math.floor(p.body.x / CELL), row: Math.floor(p.body.y / CELL) });
  }
}
