// Weather is local, cosmetic atmosphere: it never touches combat or collision. The model here is Pixi-free; it is
// drawn by `entities/WeatherLayer.ts` and blows leaves around through `Ambient.wind`.

export type WeatherKind = 'clear' | 'wind' | 'rain' | 'storm' | 'snow' | 'blizzard' | 'sandstorm';

/** Kinds in a fixed order: a kind travels over the network as its index here. */
export const WEATHER_KINDS: readonly WeatherKind[] = [
  'clear',
  'wind',
  'rain',
  'storm',
  'snow',
  'blizzard',
  'sandstorm',
];

/** [kind index, intensity in percent, 1 if the wind blows right]: what a co-op host tells its friends. */
export type WeatherSnap = [number, number, number];

/** Weather covers the whole map at once, wherever you stand: every kind can happen anywhere, with relative odds. */
export const WEATHER_TABLE: Partial<Record<WeatherKind, number>> = {
  clear: 5,
  wind: 2,
  rain: 2,
  storm: 1,
  snow: 3,
  blizzard: 1,
  sandstorm: 2,
};

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

/** A random weather state machine: events of random length drawn from one table for the whole map. */
export class Weather {
  kind: WeatherKind = 'clear';
  /** 0 to 1: how fully the current kind has faded in. Eases in and out, so weather rolls in rather than pops. */
  intensity = 0;
  /** +1 blows right, -1 blows left. */
  windDir: 1 | -1 = 1;

  remaining = 0;
  private ending = true; // fading out; the next event is picked once it reaches nothing

  constructor(private rng: () => number = Math.random) {}

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

  /** Co-op host: the weather as it is right now, for the snapshot. */
  snapshot(): WeatherSnap {
    return [WEATHER_KINDS.indexOf(this.kind), Math.round(this.intensity * 100), this.windDir === 1 ? 1 : 0];
  }

  /** Co-op guest: show the host's weather instead of rolling our own (the host fades it in and out). */
  setRemote([kind, percent, right]: WeatherSnap) {
    this.kind = WEATHER_KINDS[kind] ?? 'clear';
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

  private pick(): WeatherKind {
    const entries = Object.entries(WEATHER_TABLE) as [WeatherKind, number][];
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
