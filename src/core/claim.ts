// A guest's word about where its own hero stands (Pixi-free, tested; core engine, co-op). The host used to walk every
// friend itself and correct the friend's screen toward its own idea, which tugs a hero that already walked smoothly. Now
// the friend says where it stands (`InputMsg.px/py`, with each input) and the host moves that hero there when it is
// believable: no faster than a hero can walk (with a short burst of credit for a late packet), onto ground the host also
// calls open. What is not believable is ignored and the host's own walking stands, so the friend is corrected by the usual
// reconciliation (`prediction.ts`). The host checks the spot, not the path: this is a game among friends, not an arena.

/** px: how much farther than the allowance a claim may be (rounding, a hero nudged a step by something the guest cannot see). */
export const CLAIM_SLACK = 10;
/** px: the most walking credit a hero can have saved up (a burst after a stall of the connection, about half a second). */
export const CLAIM_BURST = 60;
/** How much faster than its top speed a hero may be seen to travel (frame times and packets do not arrive evenly). */
export const CLAIM_SPEED = 1.5;

export type Verdict = 'adopt' | 'hold' | 'reject';

export class PositionClaim {
  private allowance = CLAIM_BURST;
  private lastN = -1;
  private last: Verdict = 'reject';

  /** Time passes `dt` seconds for a hero whose top speed is `speed` px/s: more walking is allowed. */
  tick(dt: number, speed: number) {
    this.allowance = Math.min(CLAIM_BURST, this.allowance + dt * speed * CLAIM_SPEED);
  }

  /**
   * What to do with claim number `n` for (x, y) when the hero stands at `from` on the host, and `fits` says whether the
   * host finds the spot open. `adopt`: move the hero there. `hold`: this claim was adopted already, stay put. `reject`:
   * not believable, walk the hero from the keys as usual.
   */
  judge(n: number, x: number, y: number, from: { x: number; y: number }, fits: boolean): Verdict {
    if (n === this.lastN) return this.last === 'adopt' ? 'hold' : 'reject';
    this.lastN = n;
    const dist = Math.hypot(x - from.x, y - from.y);
    if (!fits || dist > this.allowance + CLAIM_SLACK) return (this.last = 'reject');
    this.allowance = Math.max(0, this.allowance - dist);
    return (this.last = 'adopt');
  }

  /** Forget the claim in hand and start with a full allowance (the hero was moved by the host: a door, a respawn). */
  reset() {
    this.allowance = CLAIM_BURST;
    this.lastN = -1;
    this.last = 'reject';
  }
}
