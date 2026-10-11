// Where the matchmaking relay (relay/) lives. Online play needs it to turn a short game code into a connection.
// Empty means no relay is set up, and the Online tab says so instead of offering games it can't start.

/** The deployed relay (relay/README.md says how it was set up). */
const DEPLOYED_RELAY_URL = 'https://me-rpg-relay.jbogaardt.workers.dev';

/** `VITE_RELAY_URL` overrides it at build time: the two-player browser test points it at a local relay. */
export const RELAY_URL: string = (import.meta.env.VITE_RELAY_URL ?? DEPLOYED_RELAY_URL).replace(/\/+$/, '');
