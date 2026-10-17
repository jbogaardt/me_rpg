// Where a quest's goal lies from one player, in a sentence a friend would say (Pixi-free, tested; core engine). The DM's
// answers to "where do I go?" are built from this instead of left to a writer's guess: the goal, which way from THAT
// player (north is up), roughly how far, and, when it is in another land, which way out leads there.

import { direction } from './bearing';
import { zoneName } from './places';

export interface Spot {
  x: number;
  y: number;
}

/**
 * The way to `goal` (its title, land and spot) for a player standing at `from` in land `here`. `door` is the exit of
 * their land that leads toward the goal's, when it is another. "Reach the Old Mill: it lies a short way to the north-east
 * of you."
 */
export function wayToGoal(
  from: Spot,
  here: string,
  goal: Spot & { zone: string; title: string },
  door: Spot | null,
): string {
  if (goal.zone === here) return `${goal.title}: it lies ${direction(from, goal)} of you.`;
  const lead = `${goal.title}: you are in ${zoneName(here)} and it is in ${zoneName(goal.zone)}.`;
  return door ? `${lead} The way on is ${direction(from, door)} of you.` : lead;
}
