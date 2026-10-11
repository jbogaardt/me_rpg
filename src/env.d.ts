/** Set in vite.config.ts: changes on every build. */
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** Matchmaking relay base URL override (see src/net/relayConfig.ts). */
  readonly VITE_RELAY_URL?: string;
}
