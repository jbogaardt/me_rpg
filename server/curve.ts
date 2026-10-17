// The engagement curve: the bot already reads the table every few seconds with Jev (pulse.ts: how hard pressed the party is,
// whether the players are at a loss). It only printed them. Here they are kept as a time series, so a long campaign's report
// says how the evening felt block by block in a few numbers instead of thousands of lines: pressure (0 cruising, 1 overwhelmed)
// and how stalled the table looked. No key means no reads and no curve; the report then simply has no such line.

import type { Pulse } from './pulse';

/** One read of the table, `t` seconds into the game. */
export interface PulseSample {
  t: number;
  pressure: number;
  stalled: number;
}

export interface CurveBlock {
  pressureAvg: number;
  pressureMax: number;
  stalledAvg: number;
  reads: number;
}

export class Curve {
  readonly samples: PulseSample[] = [];

  add(t: number, pulse: Pick<Pulse, 'pressure' | 'stalled'>) {
    this.samples.push({ t, pressure: pulse.pressure, stalled: pulse.stalled });
  }

  /** The samples in blocks of `seconds`, by block number. */
  blocks(seconds: number): Map<number, CurveBlock> {
    const by = new Map<number, PulseSample[]>();
    for (const s of this.samples) by.set(Math.floor(s.t / seconds), [...(by.get(Math.floor(s.t / seconds)) ?? []), s]);
    return new Map(
      [...by].map(([k, list]) => [
        k,
        {
          pressureAvg: list.reduce((a, s) => a + s.pressure, 0) / list.length,
          pressureMax: Math.max(...list.map((s) => s.pressure)),
          stalledAvg: list.reduce((a, s) => a + s.stalled, 0) / list.length,
          reads: list.length,
        },
      ]),
    );
  }
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** A block's curve in words. */
export const curveText = (b: CurveBlock): string =>
  `table read: pressure avg ${pct(b.pressureAvg)} max ${pct(b.pressureMax)}, stalled avg ${pct(b.stalledAvg)}`;
