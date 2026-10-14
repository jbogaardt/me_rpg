// Capabilities: the engine's features a campaign can switch off (Pixi-free, tested). Not every story wants every
// system: a dungeon crawl may have no overview map, a heroic tale no hunger and thirst, a low-magic world no combo
// spells. A campaign says which it turns off (`capabilities` in its scenarios.json, or an arc's in a pack), `ContentManager.install`
// hands them here, and the code of each feature asks `enabled(id)` at its one gate.
//
// Every capability is listed in `CAPABILITIES`, with what switching it off does; `capabilities.test.ts` checks that
// each one is asked about somewhere in src/ (a capability nothing gates would be a switch connected to nothing) and that
// the docs list it. Adding one: an entry here, `enabled('<id>')` at the gate, a line in CLAUDE.md.
//
// Co-op: both players play the same content (the world check of net/session.ts), so both have the same capabilities;
// the host gates the rules, each side gates its own screens.

export interface CapabilityInfo {
  /** What players would call it. */
  name: string;
  /** What is gone when it is off. */
  off: string;
}

export const CAPABILITIES = {
  map: {
    name: 'Area map',
    off: 'No M key or map button: the zone map that fills in as you explore is not there.',
  },
  guide: {
    name: 'Quest guide',
    off: 'No quest arrow, no search circle on the map and no tracker line: the quest log’s words are all the help.',
  },
  needs: {
    name: 'Food and water',
    off: 'No hunger or thirst: the meters are hidden, never drain or starve, natural mending is at its plain rate, and ponds are not drunk from.',
  },
  combos: {
    name: 'Combo spells',
    off: 'Wands and tomes cast no combos (their plain bolt still fires); their combos are not shown.',
  },
  skills: {
    name: 'Innate skills',
    off: 'The training wizard teaches nothing, the Magic tab is hidden and known skills cannot be cast.',
  },
  farming: {
    name: 'Farming',
    off: 'Crop plots are scenery: they cannot be watered or harvested.',
  },
  weather: {
    name: 'Weather',
    off: 'Always clear and still: no rain, snow, sand, wind or lightning. Ponds refill slowly on their own.',
  },
  dayNight: {
    name: 'Day and night',
    off: 'Always day: the night shade never falls.',
  },
  coop: {
    name: 'Online co-op',
    off: 'The Online tab is hidden: no hosting or joining (a join link is ignored).',
  },
  trading: {
    name: 'Player trading',
    off: 'Players in a co-op game cannot trade: no Trade tab, and the host refuses trade commands.',
  },
} as const satisfies Record<string, CapabilityInfo>;

export type Capability = keyof typeof CAPABILITIES;
export const CAPABILITY_IDS = Object.keys(CAPABILITIES) as Capability[];

export const isCapability = (id: string): id is Capability => id in CAPABILITIES;

/** Which capabilities are on: all of them unless the campaign says otherwise. */
export type Capabilities = Record<Capability, boolean>;

export const allCapabilities = (): Capabilities =>
  Object.fromEntries(CAPABILITY_IDS.map((id) => [id, true])) as Capabilities;

let current: Capabilities = allCapabilities();

/** Install a campaign's capabilities: those it names take its value, every other one is on. */
export function setCapabilities(off: Partial<Capabilities>) {
  current = { ...allCapabilities(), ...off };
}

/** Is this capability on in the campaign being played? */
export const enabled = (id: Capability): boolean => current[id];

/** The capabilities switched off, for the log and the dev handle. */
export const disabledCapabilities = (): Capability[] => CAPABILITY_IDS.filter((id) => !current[id]);
