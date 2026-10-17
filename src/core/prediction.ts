// Client-side prediction for a co-op guest's own hero (pure maths, no Pixi). The host owns the simulation; the guest moves
// its hero at once from its own keys (so turns feel instant) and reconciles against the host's snapshots.
//
// The host tells each friend the newest input number it has received (`SnapMsg.ia`). The guest remembers where its hero
// stood when it sent each input; the host's position should match the remembered one for `ia` (give or take the last
// few ms of held keys). The difference is the error: it is eased away over a few frames, or, above HARD_SNAP, taken at
// once (a respawn, a door, a shove). The remembered positions move with each correction, so one error is never counted twice.

export const HISTORY = 90; // inputs remembered (3 s at 30 Hz)
export const DEADZONE = 1.5; // px: smaller errors are rounding in the snapshot (positions are whole px)
export const CORRECT_RATE = 12; // 1/s: closes ~63% of a pending correction in 80 ms
export const HARD_SNAP = 48; // px: a bigger error is a teleport, not drift

interface Sent {
  n: number;
  x: number;
  y: number;
  at: number; // ms
}

export class Reconciler {
  private sent: Sent[] = [];
  private pending = { x: 0, y: 0 }; // correction still to be shown
  /** For the debug readout: the last error seen (px), and the last round trip (ms) from sending an input to hearing it acknowledged. */
  lastError = 0;
  rtt = 0;

  /** Input `n` was sent while the hero stood at (x, y). */
  record(n: number, x: number, y: number, at: number) {
    this.sent.push({ n, x, y, at });
    if (this.sent.length > HISTORY) this.sent.shift();
  }

  /**
   * A snapshot said the host has applied input `ia` and puts the hero at (hx, hy). Returns a hard correction (the new
   * position to jump to) or null (a soft one is queued for `step`, or there is nothing to do). `slack` (px) is a lead the
   * host always has over the remembered position while keys are held: it applies input `ia` from the moment it arrives,
   * the guest recorded where it stood as it sent it. An error that small is not drift: correcting it would push the hero
   * ahead while walking and pull it back, visibly, when it stops.
   */
  reconcile(ia: number, hx: number, hy: number, now: number, slack = 0): { x: number; y: number } | null {
    const at = this.sent.findIndex((s) => s.n === ia);
    const known = this.sent[at];
    if (!known) return null; // too old, or none sent yet
    this.rtt = now - known.at;
    const ex = hx - known.x;
    const ey = hy - known.y;
    const err = Math.hypot(ex, ey);
    this.lastError = err;
    this.sent.splice(0, at); // older inputs will not be acknowledged again
    if (err > HARD_SNAP) {
      this.reset();
      return { x: hx, y: hy };
    }
    if (err <= Math.max(DEADZONE, slack)) return null;
    for (const s of this.sent) {
      s.x += ex;
      s.y += ey;
    }
    this.pending.x += ex;
    this.pending.y += ey;
    return null;
  }

  /** How far to shift the hero this frame to ease in the queued correction. */
  step(dt: number): { x: number; y: number } {
    const f = 1 - Math.exp(-CORRECT_RATE * dt);
    const out = { x: this.pending.x * f, y: this.pending.y * f };
    this.pending.x -= out.x;
    this.pending.y -= out.y;
    return out;
  }

  /** Forget everything (a new zone, a teleport, leaving the game). */
  reset() {
    this.sent = [];
    this.pending = { x: 0, y: 0 };
  }
}
