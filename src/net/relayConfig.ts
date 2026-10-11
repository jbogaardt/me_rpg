// Where the matchmaking relay (relay/) lives. Online play needs it to turn a short game code into a connection.
// Empty means no relay is set up, and the Online tab says so instead of offering games it can't start.

/** The deployed relay, e.g. "https://me-rpg-relay.<your-subdomain>.workers.dev" (printed by the relay deploy). */
const DEPLOYED_RELAY_URL = '';

/** `VITE_RELAY_URL` overrides it at build time: the two-player browser test points it at a local relay. */
export const RELAY_URL: string = (import.meta.env.VITE_RELAY_URL ?? DEPLOYED_RELAY_URL).replace(/\/+$/, '');
