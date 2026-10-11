import type { MapData } from '../map/types';
import { CELL } from '../map/types';

// Weather is local, cosmetic atmosphere: it never touches combat or collision. The model here is Pixi-free; it is
// drawn by `entities/WeatherLayer.ts` and blows leaves around through `Ambient.wind`.

export type Biome = 'plains' | 'desert' | 'tundra';
export type WeatherKind = 'clear' | 'wind' | 'rain' | 'storm' | 'snow' | 'blizzard' | 'sandstorm';

/** What can happen where, with relative odds. A desert never rains; the tundra only snows. */
export const WEATHER_TABLE: Record<Biome, Partial<Record<WeatherKind, number>>> = {
  plains: { clear: 5, wind: 3, rain: 2, storm: 1 },
  desert: { clear: 6, wind: 2, sandstorm: 2 },
  tundra: { clear: 4, snow: 4, blizzard: 1, wind: 1 },
};

/** Odds that walking into a new biome brings its own weather; otherwise it's the usual random draw. */
export const ARRIVAL_CHANCE = 0.05;

/** The weather that can greet you on walking into a biome. */
export const ARRIVAL: Record<Biome, WeatherKind> = { plains: 'rain', desert: 'sandstorm', tundra: 'snow' };

/** How hard the wind blows (0 to 1) under each kind of weather; the sign comes from the event's direction. */
export const WIND: Record<WeatherKind, number> = {
  clear: 0,
  wind: 0.7,
  rain: 0.25,
  storm: 0.9,
  snow: 0.2,
  blizzard: 1,
  sandstorm: 0.9,
};

/** How long an event lasts, in seconds [min, max]. */
const DURATION: Record<WeatherKind, [number, number]> = {
  clear: [40, 110],
  wind: [30, 70],
  rain: [150, 210],
  storm: [150, 210],
  snow: [150, 210],
  blizzard: [120, 180],
  sandstorm: [90, 150],
};

const RAMP = 6; // seconds to fade a weather in or out
const SETTLE = 1.5; // seconds the hero must stay in a new biome before the weather follows

export const isAllowed = (biome: Biome, kind: WeatherKind) => (WEATHER_TABLE[biome][kind] ?? 0) > 0;

/** Biome of one surface name; `null` for neutral ground (water, stone, grass counts as plains). */
export function biomeOfSurface(surface: string): Biome | null {
  if (surface === 'snow' || surface === 'ice') return 'tundra';
  if (surface === 'sand') return 'desert';
  if (surface === 'grass') return 'plains';
  return null;
}

/**
 * The biome around a world point: the most common biome among the cells within `reach` cells, so a border or a
 * pond doesn't flip the weather. `null` when the area is all neutral ground.
 */
export function sampleBiome(
  data: Pick<MapData, 'width' | 'height' | 'surface' | 'surfaces'>,
  x: number,
  y: number,
  reach = 3,
): Biome | null {
  const c0 = Math.floor(x / CELL),
    r0 = Math.floor(y / CELL);
  const votes: Record<Biome, number> = { plains: 0, desert: 0, tundra: 0 };
  for (let r = r0 - reach; r <= r0 + reach; r++) {
    for (let c = c0 - reach; c <= c0 + reach; c++) {
      if (c < 0 || r < 0 || c >= data.width || r >= data.height) continue;
      const id = data.surface[r * data.width + c];
      const biome = biomeOfSurface((id === undefined ? undefined : data.surfaces[id]) ?? '');
      if (biome) votes[biome]++;
    }
  }
  let best: Biome | null = null;
  for (const b of ['plains', 'desert', 'tundra'] as const)
    if (votes[b] > 0 && (!best || votes[b] > votes[best])) best = b;
  return best;
}

/** A random weather state machine: events of random length drawn from the current biome's table. */
export class Weather {
  kind: WeatherKind = 'clear';
  /** 0 to 1: how fully the current kind has faded in. Eases in and out, so weather rolls in rather than pops. */
  intensity = 0;
  /** +1 blows right, -1 blows left. */
  windDir: 1 | -1 = 1;
  biome: Biome;

  remaining = 0;
  private ending = true; // fading out; the next event is picked once it reaches nothing
  private arriving = false; // a new biome was entered: its own weather comes next
  private calm = false; // the arrival weather just ended: a clear spell comes next
  private pending: Biome | null = null;
  private pendingFor = 0;

  constructor(
    biome: Biome = 'plains',
    private rng: () => number = Math.random,
  ) {
    this.biome = biome;
  }

  /** The signed wind, -1 to 1, scaled by how far the weather has faded in. */
  get wind(): number {
    return this.windDir * WIND[this.kind] * this.intensity;
  }

  /** Jump straight to a kind (dev tools and tests); it then runs its normal course. */
  force(kind: WeatherKind) {
    this.kind = kind;
    this.intensity = 1;
    this.ending = false;
    this.remaining = this.duration(kind);
  }

  update(dt: number, biome: Biome | null) {
    this.followBiome(dt, biome);
    this.remaining -= dt;
    if (!isAllowed(this.biome, this.kind) || this.remaining <= 0) this.ending = true;

    if (this.ending) {
      this.intensity = Math.max(0, this.intensity - dt / RAMP);
      if (this.intensity === 0) this.begin(this.next());
    } else {
      this.intensity = Math.min(1, this.intensity + dt / RAMP);
    }
  }

  private followBiome(dt: number, biome: Biome | null) {
    if (!biome || biome === this.biome) {
      this.pending = null;
      return;
    }
    if (this.pending !== biome) {
      this.pending = biome;
      this.pendingFor = 0;
    }
    this.pendingFor += dt;
    if (this.pendingFor >= SETTLE) {
      this.biome = biome;
      this.pending = null;
      this.arriving = this.rng() < ARRIVAL_CHANCE;
      this.ending = true; // whatever was blowing fades out first
    }
  }

  private begin(kind: WeatherKind) {
    this.kind = kind;
    this.windDir = this.rng() < 0.5 ? 1 : -1;
    this.remaining = this.duration(kind);
    this.ending = false;
  }

  private duration(kind: WeatherKind): number {
    const [lo, hi] = DURATION[kind];
    return lo + this.rng() * (hi - lo);
  }

  /** Arrival weather first, then a clear spell, then the usual random draw. */
  private next(): WeatherKind {
    if (this.arriving) {
      this.arriving = false;
      this.calm = true;
      return ARRIVAL[this.biome];
    }
    if (this.calm) {
      this.calm = false;
      return 'clear';
    }
    return this.pick();
  }

  private pick(): WeatherKind {
    const entries = Object.entries(WEATHER_TABLE[this.biome]) as [WeatherKind, number][];
    let roll = this.rng() * entries.reduce((sum, [, w]) => sum + w, 0);
    for (const [kind, w] of entries) {
      roll -= w;
      if (roll < 0) return kind;
    }
    return 'clear';
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
