// Weather is local, cosmetic atmosphere: it never touches combat or collision (lightning aside, which burns whoever
// stands where it lands). The model here is Pixi-free; it is drawn by `entities/WeatherLayer.ts` and blows leaves around
// through `Ambient.wind`.
//
// Every biome has its own weather. A zone's `climate` (a key of CLIMATES, set by its map) says which precipitation it
// can have: snow stays in the frostlands, sandstorms in the desert, ash over the undead lands, rain and storms in the
// green and wet ones. Precipitation and wind are separate: most of the time (CLEAR_SHARE) there is neither; the rest
// of the time it is precipitation, wind, or both together.

/** What falls from the sky (or, for `sand`, blows through it). */
export type Precip = 'rain' | 'storm' | 'snow' | 'blizzard' | 'sand' | 'ash';

/** In a fixed order: a precipitation travels over the network as its index here plus one (0 is none). */
export const PRECIPS: readonly Precip[] = ['rain', 'storm', 'snow', 'blizzard', 'sand', 'ash'];

/** How strongly the wind blows (0 to 1) in a plain breeze and in a gale. */
export const WIND_LEVELS = { breeze: 0.35, gale: 0.85 } as const;

/** How hard the wind leans on each precipitation by itself (0 to 1): a blizzard and a sandstorm are all wind. */
export const LEAN: Record<Precip, number> = { rain: 0.2, storm: 0.6, snow: 0.15, blizzard: 1, sand: 0.9, ash: 0.2 };

/** The share of the time (and of the weather events) with no weather at all. */
export const CLEAR_SHARE = 0.8;

/** Seconds a clear spell or a weather event lasts, [min, max]. The same for both, so the time share matches CLEAR_SHARE. */
const DURATION: [number, number] = [90, 180];
const RAMP = 6; // seconds to fade a weather in or out

/** A climate: the relative odds of each precipitation, and of a breeze or a gale, for the weather that does happen. */
export interface Climate {
  precip: Partial<Record<Precip, number>>;
  wind: { breeze: number; gale: number };
}

export const CLIMATES = {
  temperate: { precip: { rain: 3, storm: 1 }, wind: { breeze: 3, gale: 1 } }, // the Greenwood, the Eastwood, the town
  coast: { precip: { rain: 2, storm: 1 }, wind: { breeze: 2, gale: 2 } }, // the beach: windy
  desert: { precip: { sand: 1 }, wind: { breeze: 3, gale: 2 } }, // sandstorms, and nothing wet
  jungle: { precip: { rain: 4, storm: 2 }, wind: { breeze: 3, gale: 1 } }, // downpours
  swamp: { precip: { rain: 4, storm: 1 }, wind: { breeze: 3, gale: 1 } }, // the wetlands and the marsh
  undead: { precip: { ash: 3, storm: 1 }, wind: { breeze: 2, gale: 2 } }, // ash falls over the dead
  frost: { precip: { snow: 4, blizzard: 2 }, wind: { breeze: 2, gale: 2 } }, // the only place with snow
} as const satisfies Record<string, Climate>;

export type ClimateName = keyof typeof CLIMATES;
export const DEFAULT_CLIMATE: ClimateName = 'temperate';
export const isClimate = (name: string): name is ClimateName => name in CLIMATES;

/** [precipitation (0 none, else index + 1 in PRECIPS), wind level in percent, intensity in percent, 1 if it blows right]. */
export type WeatherSnap = [number, number, number, number];

/** Clear sky, for a zone with no weather (a room) in a snapshot. */
export const NO_WEATHER: WeatherSnap = [0, 0, 0, 1];

/** What the weather is doing, to show or to send: the precipitation and wind of one zone. */
export class Weather {
  /** What is falling (null: nothing). */
  precip: Precip | null = null;
  /** How hard the wind blows on top of the precipitation's own lean: 0, a breeze or a gale. */
  windLevel = 0;
  /** 0 to 1: how fully the current weather has faded in. Eases in and out, so weather rolls in rather than pops. */
  intensity = 0;
  /** +1 blows right, -1 blows left. */
  windDir: 1 | -1 = 1;

  remaining = 0;
  private ending = false; // fading out; the next event is picked once it reaches nothing
  private thunder: Lightning;

  constructor(
    private climate: Climate = CLIMATES[DEFAULT_CLIMATE],
    private rng: () => number = Math.random,
  ) {
    this.thunder = new Lightning(rng);
    this.begin(this.pick());
    this.remaining *= rng(); // zones don't all change at the same moments
  }

  /** Nothing falling and no wind. */
  get clear(): boolean {
    return this.precip === null && this.windLevel === 0;
  }

  /** The signed wind, -1 to 1, scaled by how far the weather has faded in. */
  get wind(): number {
    const strength = Math.max(this.precip ? LEAN[this.precip] : 0, this.windLevel);
    return this.windDir * strength * this.intensity;
  }

  /** A storm that has built up: lightning strikes in it. */
  get stormy(): boolean {
    return this.precip === 'storm' && this.intensity > 0.5;
  }

  /** Jump straight to some weather (dev tools and tests); it then runs its normal course. */
  force(precip: Precip | null, windLevel = 0) {
    this.precip = precip;
    this.windLevel = windLevel;
    this.intensity = 1;
    this.ending = false;
    this.remaining = this.duration();
  }

  /** Co-op host: the weather as it is right now, for the snapshot. */
  snapshot(): WeatherSnap {
    return [
      this.precip ? PRECIPS.indexOf(this.precip) + 1 : 0,
      Math.round(this.windLevel * 100),
      Math.round(this.intensity * 100),
      this.windDir === 1 ? 1 : 0,
    ];
  }

  /** Co-op guest: show the host's weather instead of rolling our own (the host fades it in and out). */
  setRemote([precip, wind, percent, right]: WeatherSnap) {
    this.precip = PRECIPS[precip - 1] ?? null;
    this.windLevel = Math.min(1, Math.max(0, wind / 100));
    this.intensity = Math.min(1, Math.max(0, percent / 100));
    this.windDir = right ? 1 : -1;
  }

  update(dt: number) {
    this.remaining -= dt;
    if (this.remaining <= 0) this.ending = true;

    if (this.ending) {
      this.intensity = Math.max(0, this.intensity - dt / RAMP);
      if (this.intensity === 0) this.begin(this.pick());
    } else {
      this.intensity = Math.min(1, this.intensity + dt / RAMP);
    }
  }

  /** True on the frames a lightning bolt should strike (only in a storm); the host or a solo game decides, a guest never asks. */
  strikeDue(dt: number): boolean {
    return this.thunder.update(dt, this.stormy);
  }

  private begin(next: { precip: Precip | null; windLevel: number }) {
    this.precip = next.precip;
    this.windLevel = next.windLevel;
    this.windDir = this.rng() < 0.5 ? 1 : -1;
    this.remaining = this.duration();
    this.ending = false;
  }

  private duration(): number {
    return DURATION[0] + this.rng() * (DURATION[1] - DURATION[0]);
  }

  /** The next spell: clear (CLEAR_SHARE of the time), else precipitation alone, wind alone, or both. */
  private pick(): { precip: Precip | null; windLevel: number } {
    if (this.rng() < CLEAR_SHARE) return { precip: null, windLevel: 0 };
    const roll = this.rng();
    const precip = roll < 0.75 ? this.weighted(this.climate.precip) : null; // precipitation alone or with wind
    const wind = roll >= 0.4 ? WIND_LEVELS[this.weighted(this.climate.wind)] : 0; // wind alone or with precipitation
    return { precip, windLevel: wind };
  }

  private weighted<K extends string>(table: Partial<Record<K, number>>): K {
    const entries = Object.entries(table) as [K, number][];
    let roll = this.rng() * entries.reduce((sum, [, w]) => sum + w, 0);
    for (const [key, w] of entries) {
      roll -= w;
      if (roll < 0) return key;
    }
    return entries[0]![0];
  }
}

/**
 * Decides when lightning strikes during a storm: a random gap of a few seconds, and sometimes a quick double
 * strike. `update` returns true on the frame a strike should be shown.
 */
export class Lightning {
  private wait: number;

  constructor(private rng: () => number = Math.random) {
    this.wait = this.gap();
  }

  update(dt: number, stormy: boolean): boolean {
    if (!stormy) return false;
    this.wait -= dt;
    if (this.wait > 0) return false;
    this.wait = this.rng() < 0.3 ? 0.15 + this.rng() * 0.2 : this.gap();
    return true;
  }

  private gap() {
    return 3 + this.rng() * 7;
  }
}
