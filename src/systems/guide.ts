// Pointing the way (Pixi-free): where the arrow over the hero should lead for the quest they are on, and the one-line
// reminder of it. The scene gives this a plain description of the zone the hero is in (`GuideWorld`); a target in another
// zone becomes the door that leads towards it, so the arrow always points at something in the zone being shown.

import { CELL } from '../map/types';
import type { Hero } from './combat';
import { nextZone, zoneName } from './places';
import { GIVERS, QUEST_GIVER, currentQuest, progressText, questStatus, siteOpen } from './quests';

export interface GuideWorld {
  /** The zone the hero is in. */
  zone: string;
  doors: { col: number; row: number; w: number; to: { zone: string } }[];
  /** The quest sites here, with where they stand (pixels). */
  sites: { kind: string; index: number; x: number; y: number }[];
  /** The mobs alive here, by their MOB_KINDS key. */
  mobs: { key: string; x: number; y: number }[];
  /** The quest giver here, if any. */
  giver: { x: number; y: number } | null;
}

export interface Guide {
  x: number;
  y: number;
  /** What the arrow leads to, in a word or two ("Maren", "The Sunscar Desert"): the zone it leaves for, or the person. */
  label: string;
  /**
   * Set for something to be *found* (a monster, a plant, a stone): then (x, y) is only the middle of the area to search,
   * this many pixels across from the middle to the edge, and no arrow points at it. Unset for a person or a door, which are
   * known places: those get the arrow.
   */
  radius?: number;
}

/** How far from the middle a search area reaches, and how coarse the grid its middle snaps to is (so it holds still as a mob wanders). */
export const SEARCH_RADIUS = 16 * CELL;
const SEARCH_GRID = 10 * CELL;
const SEARCH_PUSH = 4 * CELL;

/**
 * The middle of the area to search for something at (x, y): the target's grid square, pushed off-centre by a fixed amount
 * that depends only on the square. It never moves while the target stays in its square, and the target is always inside the
 * circle (the square's far corner is under 7.1 cells from its middle, the push is 4, the radius is 16).
 */
export function searchMiddle(x: number, y: number): { x: number; y: number } {
  const gx = Math.floor(x / SEARCH_GRID);
  const gy = Math.floor(y / SEARCH_GRID);
  const h = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453;
  const angle = (h - Math.floor(h)) * Math.PI * 2;
  return {
    x: (gx + 0.5) * SEARCH_GRID + Math.cos(angle) * SEARCH_PUSH,
    y: (gy + 0.5) * SEARCH_GRID + Math.sin(angle) * SEARCH_PUSH,
  };
}

const area = (target: { x: number; y: number }): Guide => ({
  ...searchMiddle(target.x, target.y),
  label: '',
  radius: SEARCH_RADIUS,
});

const doorCentre = (d: GuideWorld['doors'][number]) => ({ x: (d.col + d.w / 2) * CELL, y: (d.row + 0.5) * CELL });

/** The nearest of `points` to `from`. */
function nearest<T extends { x: number; y: number }>(points: T[], from: { x: number; y: number }): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d < bestD) [best, bestD] = [p, d];
  }
  return best;
}

/** Where the arrow should point for this hero's quest, or null when there is nothing to point at (all done, or nothing to find here). */
export function guideFor(hero: Hero, world: GuideWorld, from: { x: number; y: number }): Guide | null {
  const q = currentQuest(hero.quests);
  if (!q) return null;
  const status = questStatus(hero);
  const giver = GIVERS[QUEST_GIVER];
  const toGiver = status === 'offer' || status === 'ready';
  const zones = toGiver ? [giver?.zone ?? 'town'] : q.where.zones;

  if (!zones.includes(world.zone)) {
    const next = nextZone(world.zone, zones);
    const door = next
      ? nearest(
          world.doors.filter((d) => d.to.zone === next).map((d) => ({ ...doorCentre(d), d })),
          from,
        )
      : undefined;
    return door && next ? { x: door.x, y: door.y, label: zoneName(next) } : null;
  }
  if (toGiver) return world.giver ? { ...world.giver, label: giver?.tag ?? '' } : null;

  const o = q.objective;
  if (o.t === 'bring') {
    const door = nearest(
      world.doors.filter((d) => d.to.zone === q.where.door).map((d) => doorCentre(d)),
      from,
    );
    return door ? { ...door, label: zoneName(q.where.door ?? '') } : null;
  }
  if (o.t === 'gather') {
    const site = nearest(
      world.sites.filter((s) => siteOpen(hero, s.kind, world.zone, s.index)),
      from,
    );
    return site ? area(site) : null;
  }
  const mob = nearest(
    world.mobs.filter((m) => m.key === o.kind),
    from,
  );
  return mob ? area(mob) : null;
}

/** The reminder for the HUD: what the quest asks and how far along it is, or who to see. Empty when every quest is done. */
export function trackerText(hero: Hero): string {
  const q = currentQuest(hero.quests);
  if (!q) return '';
  const who = GIVERS[QUEST_GIVER]?.tag ?? 'the warden';
  switch (questStatus(hero)) {
    case 'offer':
      return `Speak to ${who} in ${zoneName(GIVERS[QUEST_GIVER]?.zone ?? 'town')}`;
    case 'ready':
      return `${q.title}: return to ${who}`;
    default:
      return `${q.title}: ${progressText(hero)}`;
  }
}
