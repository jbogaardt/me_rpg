// Capabilities: the engine's features a campaign can switch off or tune (Pixi-free, tested). Not every story wants
// every system: a dungeon crawl may have no overview map, a heroic tale no hunger and thirst, a low-magic world no
// combo spells, a cursed swamp double hunger and no map.
//
// A campaign sets them in its scenarios.json (`capabilities`), and a biome may override its zone's in biomes.json
// (`capabilities`, for the capabilities whose `scope` is `zone`); a random campaign takes them from its arc and its
// regions (packs). Each entry is `false` (off), `true` (on, default settings) or an object of settings (on, those
// settings): `{ "map": false, "needs": { "drain": 2 } }`. `ContentManager.install` hands them here, and the code of
// each feature asks `enabled(id, zone)` at its one gate, and `setting(id, key, zone)` for a tuned value.
//
// Every capability is listed in `CAPABILITIES`: what switching it off does, whether a zone may override it, what it
// needs on (`requires`) and its settings with their defaults and bounds. `checkCapabilities` is the one validator,
// used for campaign files and packs alike. tools/content/capabilities.test.ts checks that each capability is asked
// about somewhere in src/ and that CLAUDE.md lists it. Adding one: an entry here, `enabled('<id>', zone)` at the gate
// (and `setting` for anything tuned), a line in CLAUDE.md.
//
// Co-op: both players play the same content (the world check of net/session.ts), so both have the same capabilities;
// the host gates the rules, each side gates its own screens.

/** A tunable number or flag of a capability. */
export type SettingDef =
  { about: string; default: number; min: number; max: number } | { about: string; default: boolean };

export interface CapabilityInfo {
  /** What players would call it. */
  name: string;
  /** What is gone when it is off. */
  off: string;
  /** `campaign`: one switch for the whole game; `zone`: a biome may switch it for its own zone. */
  scope: 'campaign' | 'zone';
  /** Capabilities it makes no sense without: it is off wherever any of them is. */
  requires?: readonly string[];
  settings?: Record<string, SettingDef>;
}

export const CAPABILITIES = {
  map: {
    name: 'Area map',
    off: 'No M key or map button: the zone map that fills in as you explore is not there.',
    scope: 'zone',
    settings: {
      fog: { about: 'The map fills in as you explore; false shows the whole zone at once.', default: true },
    },
  },
  guide: {
    name: 'Quest guide',
    off: 'No quest arrow, no search circle on the map and no tracker line: the quest log’s words are all the help.',
    scope: 'zone',
  },
  needs: {
    name: 'Food and water',
    off: 'No hunger or thirst: the meters are hidden, never drain or starve, natural mending is at its plain rate, and ponds are not drunk from.',
    scope: 'zone',
    settings: {
      drain: { about: 'How fast food and water run down: 1 is normal, 2 twice as fast.', default: 1, min: 0, max: 10 },
    },
  },
  combos: {
    name: 'Combo spells',
    off: 'Wands and tomes cast no combos (their plain bolt still fires); their combos are not shown.',
    scope: 'campaign',
  },
  skills: {
    name: 'Innate skills',
    off: 'The training wizard teaches nothing, the Magic tab is hidden and known skills cannot be cast.',
    scope: 'campaign',
  },
  farming: {
    name: 'Farming',
    off: 'Crop plots are scenery: they cannot be watered or harvested.',
    scope: 'zone',
  },
  weather: {
    name: 'Weather',
    off: 'Always clear and still: no rain, snow, sand, wind or lightning. Ponds refill slowly on their own.',
    scope: 'zone',
    settings: {
      calm: {
        about: 'The share of the time the sky is clear and still (0.8 is normal).',
        default: 0.8,
        min: 0,
        max: 1,
      },
    },
  },
  dayNight: {
    name: 'Day and night',
    off: 'Always day: the night shade never falls.',
    scope: 'zone',
  },
  coop: {
    name: 'Online co-op',
    off: 'The Online tab is hidden: no hosting or joining (a join link is ignored).',
    scope: 'campaign',
  },
  trading: {
    name: 'Player trading',
    off: 'Players in a co-op game cannot trade: no Trade tab, and the host refuses trade commands.',
    scope: 'campaign',
    requires: ['coop'],
  },
} as const satisfies Record<string, CapabilityInfo>;

export type Capability = keyof typeof CAPABILITIES;
export const CAPABILITY_IDS = Object.keys(CAPABILITIES) as Capability[];

export const isCapability = (id: string): id is Capability => id in CAPABILITIES;

const info = (id: Capability): CapabilityInfo => CAPABILITIES[id];

/** The settings keys of a capability. */
type SettingsOf<C extends Capability> = (typeof CAPABILITIES)[C] extends { settings: infer S } ? keyof S : never;

/** What content says of one capability: off, on, or on with these settings. */
export type CapabilityValue = boolean | Record<string, number | boolean>;
/** What content says of the capabilities: those it names. */
export type CapabilitySpec = Partial<Record<Capability, CapabilityValue>>;

/**
 * What is wrong with a capability spec, one problem per entry, each prefixed with `path`. `scope` is where it is
 * written: a zone (a biome) may set only the capabilities whose scope is `zone`. A capability switched on while one
 * it requires is switched off in the same spec is a contradiction.
 */
export function checkCapabilities(spec: unknown, path: string, scope: 'campaign' | 'zone' = 'campaign'): string[] {
  if (spec === undefined) return [];
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) return [`${path}: must be an object`];
  const out: string[] = [];
  const entries = Object.entries(spec as Record<string, unknown>);
  for (const [id, value] of entries) {
    const at = `${path}.${id}`;
    if (!isCapability(id)) {
      out.push(`${at}: is not a capability (${CAPABILITY_IDS.join(', ')})`);
      continue;
    }
    if (scope === 'zone' && info(id).scope !== 'zone') out.push(`${at}: is set for the whole campaign, not per zone`);
    if (typeof value === 'boolean') continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      out.push(`${at}: must be true, false or an object of settings`);
      continue;
    }
    const defs: Record<string, SettingDef> = info(id).settings ?? {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const def = defs[key];
      if (!def) {
        const known = Object.keys(defs);
        out.push(`${at}.${key}: is not a setting of ${id} (${known.length ? known.join(', ') : 'it has none'})`);
      } else if (typeof def.default === 'boolean') {
        if (typeof v !== 'boolean') out.push(`${at}.${key}: must be true or false`);
      } else if ('min' in def && (typeof v !== 'number' || !Number.isFinite(v) || v < def.min || v > def.max)) {
        out.push(`${at}.${key}: must be a number from ${def.min} to ${def.max}`);
      }
    }
  }
  const on = (id: string) => (spec as Record<string, unknown>)[id];
  for (const [id] of entries)
    if (isCapability(id) && on(id) !== false)
      for (const need of info(id).requires ?? [])
        if (on(need) === false && on(id) !== undefined) out.push(`${path}.${id}: needs ${need}, which is switched off`);
  return out;
}

interface Resolved {
  on: boolean;
  settings: Record<string, number | boolean>;
}

/** One capability as a campaign spec and a zone's override make it (the zone's word wins; settings merge). */
function resolveOne(id: Capability, campaign: CapabilitySpec, zone: CapabilitySpec = {}): Resolved {
  const settings: Record<string, number | boolean> = {};
  for (const [key, def] of Object.entries(info(id).settings ?? {})) settings[key] = def.default;
  let on = true;
  for (const value of [campaign[id], info(id).scope === 'zone' ? zone[id] : undefined]) {
    if (value === undefined) continue;
    if (typeof value === 'boolean') on = value;
    else {
      on = true;
      Object.assign(settings, value);
    }
  }
  return { on, settings };
}

/** The capabilities as a campaign's content sets them, asked without touching the installed ones (the content checks use it). */
export class CapabilityTable {
  constructor(
    readonly campaign: CapabilitySpec = {},
    /** Per zone (a map's name): what its biome overrides. */
    readonly zones: Record<string, CapabilitySpec> = {},
  ) {}

  /** Is `id` on (in `zone`, if given; else campaign-wide)? Off wherever a capability it requires is off. */
  enabled(id: Capability, zone?: string): boolean {
    const z = zone === undefined ? undefined : this.zones[zone];
    if (!resolveOne(id, this.campaign, z).on) return false;
    return (info(id).requires ?? []).every((need) => this.enabled(need as Capability, zone));
  }

  /** Is `id` on anywhere: campaign-wide or in some zone? */
  anywhere(id: Capability): boolean {
    return this.enabled(id) || Object.keys(this.zones).some((zone) => this.enabled(id, zone));
  }

  setting<C extends Capability>(id: C, key: SettingsOf<C>, zone?: string): number | boolean {
    const z = zone === undefined ? undefined : this.zones[zone];
    const value = resolveOne(id, this.campaign, z).settings[key as string];
    if (value === undefined) throw new Error(`${id} has no setting "${String(key)}"`);
    return value;
  }
}

let current = new CapabilityTable();

/** Install a campaign's capabilities, and its zones' overrides by zone (map) name. Anything not named is on. */
export function setCapabilities(campaign: CapabilitySpec = {}, zones: Record<string, CapabilitySpec> = {}) {
  current = new CapabilityTable(campaign, zones);
}

/** Is this capability on in the campaign being played (in `zone`, when the feature is in one)? */
export const enabled = (id: Capability, zone?: string): boolean => current.enabled(id, zone);

/** Is this capability on anywhere in the campaign (shops that serve every zone ask this)? */
export const enabledAnywhere = (id: Capability): boolean => current.anywhere(id);

/** A tuned value of a capability (its default unless the campaign or the zone sets it). */
export function setting<C extends Capability>(id: C, key: SettingsOf<C>, zone?: string): number {
  const v = current.setting(id, key, zone);
  if (typeof v !== 'number') throw new Error(`${id}.${String(key)} is not a number`);
  return v;
}

/** A tuned flag of a capability. */
export function flag<C extends Capability>(id: C, key: SettingsOf<C>, zone?: string): boolean {
  const v = current.setting(id, key, zone);
  if (typeof v !== 'boolean') throw new Error(`${id}.${String(key)} is not a flag`);
  return v;
}

/** The capabilities switched off campaign-wide, for the log and the dev handle. */
export const disabledCapabilities = (): Capability[] => CAPABILITY_IDS.filter((id) => !current.enabled(id));

/** The installed table (the dev handle). */
export const capabilityTable = (): CapabilityTable => current;
