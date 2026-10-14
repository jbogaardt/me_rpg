/** Set in vite.config.ts: changes on every build (the co-op version handshake compares it). */
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** Matchmaking relay base URL override (see src/net/relayConfig.ts). */
  readonly VITE_RELAY_URL?: string;
  /** The campaign to play (a folder of public/content/); default campaign2, see src/main.ts. */
  readonly VITE_CAMPAIGN?: string;
}

declare module 'virtual:asset-versions' {
  /** Content hash per file the game fetches from public/ (`maps/greenwood.json` -> hash); empty in the dev server. */
  const versions: Readonly<Record<string, string>>;
  export default versions;
}
