// Named bosses of the content (Pixi-free, tested; core engine, co-op). A boss here is *authored*: an entity of
// entities.json with `"boss": true` (its own look, tougher stats and a long telegraph), placed once in a zone by a scenario
// node and named by a `boss` objective of a quest. It is not the Dungeon Master's boss (`dmBoss.ts`), which is made for a
// party out of the land's toughest foe; the two never meet (`MobKind.named` here, `MobKind.boss` there).
//
// Rules that make it a climax rather than a big mob: it does not respawn once it falls (so its kill is the story's), it
// mends fully when a knockout leaves no hero in its zone (a wipe starts the fight again, it never wears a party down
// between attempts), and its kill counts for everyone in the zone like any kill (the host owns the fight, the party
// shares it: nothing new is sent, a friend builds the same foe from the same content).

import type { MobKind } from './combat';

/** Is this kind an authored boss? */
export const isNamedBoss = (kind: Pick<MobKind, 'named'>): boolean => kind.named === true;

/** Should a boss mend itself: it is alive, hurt, and no hero is in its zone (a knockout sent them all home)? */
export function bossMends(
  boss: { named: boolean; alive: boolean; hp: number; maxHp: number },
  heroesHere: number,
): boolean {
  return boss.named && boss.alive && boss.hp < boss.maxHp && heroesHere === 0;
}
