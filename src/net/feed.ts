// Which mobs and events a snapshot tells one guest about. Pure maths, no Pixi: the host keeps one `MobFeed` per friend.
//
// Most of a snapshot is mob state, and most mobs are nowhere near a given friend or are standing still. So a friend is
// told about a mob only when it is within `radius` of their player (their view, plus a margin), and a mob whose state has
// not changed is repeated only every IDLE_RESEND seconds: the channel is lossy, so a still mob must still be said again
// now and then, or one lost packet would leave a stale picture on screen for good.

import type { EventWire, MobFields, MobSnap, WorldEvent } from './protocol';

/** Seconds between repeats of a mob whose state has not changed. */
export const IDLE_RESEND = 0.24;

/** What a guest is assumed to see before it says otherwise (world px from its player). */
export const DEFAULT_VIEW = 640;
/** Extra reach beyond the view, so a mob that walks on screen has been in the guest's picture for a moment already. */
export const VIEW_MARGIN = 160;

export class MobFeed {
  private sent = new Map<number, { key: string; at: number }>();

  /**
   * The mobs to put in this friend's next snapshot. `states` is every mob's state in map order, `viewer` is where the
   * friend's player stands, `view` how far they can see and `now` the host's clock in seconds.
   */
  select(states: readonly MobFields[], viewer: { x: number; y: number }, view: number, now: number): MobSnap[] {
    const reach = view + VIEW_MARGIN;
    const out: MobSnap[] = [];
    states.forEach((state, index) => {
      if (Math.hypot(state[0] - viewer.x, state[1] - viewer.y) > reach) {
        this.sent.delete(index); // out of sight: the moment it is back in range it is told in full
        return;
      }
      const key = state.join();
      const last = this.sent.get(index);
      if (last && last.key === key && now - last.at < IDLE_RESEND) return;
      this.sent.set(index, { key, at: now });
      out.push([index, ...state]);
    });
    return out;
  }
}

/**
 * Does a friend at `viewer`, seeing `view` px, need to hear about this event? Like mobs, only what happens within their
 * view (plus the margin) is sent; a shot counts if it could fly into view (`boltRange`: how far a bolt flies; an arrow
 * carries its own range). A defeat has no place and always counts.
 */
export function eventInView(e: WorldEvent, viewer: { x: number; y: number }, view: number, boltRange: number): boolean {
  if (e.type === 'defeat') return true;
  const travel = e.type === 'arrow' ? e.range : e.type === 'bolt' ? boltRange : 0;
  return Math.hypot(e.x - viewer.x, e.y - viewer.y) <= view + VIEW_MARGIN + travel;
}

/**
 * Characters a snapshot should stay under: a message over about 1.2 KB is split in transit, and on this lossy channel
 * losing any piece loses all of it. Events fill whatever room the rest of the snapshot leaves.
 */
export const SNAP_BUDGET = 1100;

/** Room events always get, even when the rest of a snapshot is already large (a few hit numbers still get through). */
export const MIN_EVENT_ROOM = 160;

/**
 * As many of these events (oldest first, each with its JSON length) as fit in `room` characters and `max` events,
 * newest kept first (an older one has already ridden in earlier snapshots), returned oldest first.
 */
export function fitEvents(
  events: readonly { wire: EventWire; size: number }[],
  room: number,
  max: number,
): EventWire[] {
  const budget = Math.max(room, MIN_EVENT_ROOM);
  let used = 0;
  let from = events.length;
  while (from > 0 && events.length - from < max) {
    const next = events[from - 1];
    if (!next || used + next.size + 1 > budget) break; // +1: the comma
    used += next.size + 1;
    from--;
  }
  return events.slice(from).map((ev) => ev.wire);
}
