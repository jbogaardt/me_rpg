// Pointing the way (Pixi-free): where the arrow over the hero should lead for the quest they are on, and the one-line
// reminder of it. The scene gives this a plain description of the zone the hero is in (`GuideWorld`); a target in another
// zone becomes the door that leads towards it, so the arrow always points at something in the zone being shown.

import { CELL } from '../map/types';
import type { Hero } from './combat';
import { nextZone, zoneName } from './places';
import { GIVERS, completerOf, currentQuest, offererOf, progressText, questStatus, siteOpen } from './quests';

export interface GuideWorld {
  /** The zone the hero is in. */
  zone: string;
  doors: { col: number; row: number; w: number; to: { zone: string } }[];
  /** The quest sites here, with where they stand (pixels). */
  sites: { kind: string; index: number; x: number; y: number }[];
  /** The mobs alive here, by their MOB_KINDS key. */
  mobs: { key: string; x: number; y: number }[];
  /** The quest givers here (a key of GIVERS and where they stand). */
  givers: { id: string; x: number; y: number }[];
  /** The named places of this zone (MapData.places), where they are in pixels. */
  places: { name: string; x: number; y: number }[];
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
  // A person (to be given a task, or to hand one in to) is a known place; most other things are to be found.
  const toGiver = status === 'offer' || status === 'ready';
  const who = toGiver ? (status === 'offer' ? offererOf(q) : completerOf(q)) : '';
  const giver = GIVERS[who];
  const zones = toGiver ? [giver?.zone ?? ''] : q.where.zones;

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
  if (toGiver) {
    const there = world.givers.find((g) => g.id === who);
    return there ? { x: there.x, y: there.y, label: giver?.tag ?? '' } : null;
  }

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
  if (o.t === 'visit') {
    const place = world.places.find((p) => p.name === o.place);
    return place ? area(place) : null;
  }
  if (o.t === 'meet') return null; // done on taking it: there is nothing to look for
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
  const status = questStatus(hero);
  const person = GIVERS[status === 'offer' ? offererOf(q) : completerOf(q)];
  switch (status) {
    case 'offer':
      return `Speak to ${person?.tag ?? 'the warden'} in ${zoneName(person?.zone ?? '')}`;
    case 'ready':
      return q.objective.t === 'meet' || q.objective.t === 'visit' || offererOf(q) !== completerOf(q)
        ? `${q.title}: speak to ${person?.tag ?? 'them'} in ${zoneName(person?.zone ?? '')}`
        : `${q.title}: return to ${person?.tag ?? 'the warden'}`;
    default:
      return `${q.title}: ${progressText(hero)}`;
  }
}
