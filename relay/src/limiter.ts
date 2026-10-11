// Fixed-window request counter for one client address and bucket (see router.ts LIMITS). Pure and storage-agnostic so
// it is tested in Node; index.ts wires it to a Durable Object.

export interface LimiterState {
  start: number;
  count: number;
}

/** Count one request against `state`; returns the new state and whether the request is within `max`. */
export function hit(
  state: LimiterState | undefined,
  now: number,
  max: number,
  windowMs: number,
): { state: LimiterState; allowed: boolean } {
  const current = state && now - state.start < windowMs ? state : { start: now, count: 0 };
  const next = { start: current.start, count: current.count + 1 };
  return { state: next, allowed: next.count <= max };
}
