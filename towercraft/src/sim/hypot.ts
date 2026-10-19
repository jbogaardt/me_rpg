/**
 * Euclidean length. `Math.hypot` is not required to give the same last digit in every browser engine, and an online
 * match (net/lockstep.ts) needs both players' sims to agree exactly; `sqrt` of a plain sum of squares is exact everywhere.
 */
export const hypot = (x: number, y: number) => Math.sqrt(x * x + y * y);
