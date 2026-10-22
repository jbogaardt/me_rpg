// The units' spoken lines (`voiceLines.ts`, recorded as `public/audio/voice/<race>-<unit>-<line>.wav`, see
// credits in `public/audio/CREDITS.md`). Played into the sounds' output (`audio.ts`), so the mute button silences them too. Cosmetic: a
// line that is missing or cannot load is simply not said. One line at a time: a new one cuts the last short, and a line waits
// `GAP` seconds after the one before it, so tapping through a group does not pile up speech.

import { audioOutput, isMuted } from './audio';
import { voiceFile, type Line } from './voiceLines';
import type { Match, Unit } from './sim/sim';

/** The lines' loudness under the sounds (0 to 1). */
const VOLUME = 0.8;
/** Seconds a new line waits after the last one started. */
const GAP = 1.2;

const buffers = new Map<string, Promise<AudioBuffer | undefined>>();
let playing: AudioBufferSourceNode | undefined;
let lastAt = -Infinity;

function load(ctx: AudioContext, file: string): Promise<AudioBuffer | undefined> {
  let buffer = buffers.get(file);
  if (!buffer) {
    buffer = (async () => {
      try {
        const res = await fetch(new URL(file, document.baseURI).href);
        return res.ok ? await ctx.decodeAudioData(await res.arrayBuffer()) : undefined;
      } catch {
        return undefined; // a line that will not load is a silent one
      }
    })();
    buffers.set(file, buffer);
  }
  return buffer;
}

/** Say a unit's line (`pick` or `go`) for the player; quietly does nothing when there is no sound. */
export function say(m: Match, unit: Unit, line: Line) {
  const out = audioOutput();
  if (!out || isMuted() || out.ctx.state !== 'running') return;
  const now = out.ctx.currentTime;
  if (now - lastAt < GAP) return;
  lastAt = now;
  const file = voiceFile(m.players[unit.owner]!.race, unit.def.id, line);
  void load(out.ctx, file).then((buffer) => {
    if (!buffer || isMuted()) return;
    playing?.stop();
    const src = out.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = out.ctx.createGain();
    gain.gain.value = VOLUME;
    src.connect(gain).connect(out.out);
    src.start();
    playing = src;
  });
}
