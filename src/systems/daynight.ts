// The day and night cycle: purely cosmetic light. The model is Pixi-free; `entities/NightLayer.ts` draws it as a screen
// tint. Nothing in combat or collision depends on the hour.
//
// Time of day is a number from 0 to 1: 0 is midnight, 0.25 dawn, 0.5 noon, 0.75 dusk. It is a function of the wall clock
// (`DayClock`), so every player in a co-op game sees the same hour with nothing sent over the network.

/** Real seconds in one full day. */
export const DAY_LENGTH = 720;

/** One colour stop of the sky: the light at that time of day, as a multiply tint (white leaves the world as drawn). */
interface Stop {
  at: number;
  color: number;
}

/** In order, from midnight round to midnight again (the first and last match so the day wraps smoothly). */
export const SKY: readonly Stop[] = [
  { at: 0, color: 0x2a3566 },
  { at: 0.2, color: 0x323d70 },
  { at: 0.26, color: 0xd29a9a }, // first light
  { at: 0.31, color: 0xffe4cc }, // sunrise
  { at: 0.38, color: 0xffffff },
  { at: 0.64, color: 0xffffff },
  { at: 0.71, color: 0xffe2b4 }, // golden hour
  { at: 0.77, color: 0xe58a62 }, // sunset
  { at: 0.84, color: 0x5d5390 }, // dusk
  { at: 0.92, color: 0x323d70 },
  { at: 1, color: 0x2a3566 },
];

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Blend two 0xRRGGBB colours (k = 0 gives `a`, 1 gives `b`). */
export function mix(a: number, b: number, k: number): number {
  const r = lerp((a >> 16) & 255, (b >> 16) & 255, k);
  const g = lerp((a >> 8) & 255, (b >> 8) & 255, k);
  const bl = lerp(a & 255, b & 255, k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** The multiply tint for a time of day (0 to 1, wrapping). */
export function skyColor(time: number): number {
  const t = ((time % 1) + 1) % 1;
  for (let i = 1; i < SKY.length; i++) {
    const next = SKY[i]!;
    if (t <= next.at) {
      const prev = SKY[i - 1]!;
      return mix(prev.color, next.color, (t - prev.at) / (next.at - prev.at));
    }
  }
  return SKY[SKY.length - 1]!.color;
}

/** 0 (deepest night) to 1 (full day): how bright the world is at that time. */
export function daylight(time: number): number {
  const c = skyColor(time);
  const luma = (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
  const night =
    (((SKY[0]!.color >> 16) & 255) * 0.3 + ((SKY[0]!.color >> 8) & 255) * 0.59 + (SKY[0]!.color & 255) * 0.11) / 255;
  return Math.min(1, Math.max(0, (luma - night) / (1 - night)));
}

/** True when the light is low enough to call it night (for text or, later, rules). */
export const isNight = (time: number) => daylight(time) < 0.4;

/** "6:30" style clock for a time of day. */
export function clockText(time: number): string {
  const minutes = Math.floor((((time % 1) + 1) % 1) * 24 * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** The hour as the wall clock gives it; `shift` lets dev tools jump to another hour. */
export class DayClock {
  /** Added to the real time of day (a fraction of a day), so a playtest can ask for dusk. */
  shift = 0;

  constructor(private now: () => number = Date.now) {}

  /** The time of day, 0 to 1. */
  time(): number {
    const t = (this.now() / 1000 / DAY_LENGTH + this.shift) % 1;
    return t < 0 ? t + 1 : t;
  }

  /** Make it this hour (0 to 24) right now. */
  setHour(hour: number) {
    this.shift = 0;
    this.shift = hour / 24 - this.time();
  }
}
