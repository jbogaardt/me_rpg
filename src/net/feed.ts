// Which mobs a snapshot tells one guest about. Pure maths, no Pixi: the host keeps one `MobFeed` per friend.
//
// Most of a snapshot is mob state, and most mobs are nowhere near a given friend or are standing still. So a friend is
// told about a mob only when it is within `radius` of their player (their view, plus a margin), and a mob whose state has
// not changed is repeated only every IDLE_RESEND seconds: the channel is lossy, so a still mob must still be said again
// now and then, or one lost packet would leave a stale picture on screen for good.

import type { MobSnap, MobFields } from './protocol';

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
