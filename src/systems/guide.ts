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
}

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
    return site ? { x: site.x, y: site.y, label: '' } : null;
  }
  const mob = nearest(
    world.mobs.filter((m) => m.key === o.kind),
    from,
  );
  return mob ? { x: mob.x, y: mob.y, label: '' } : null;
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
