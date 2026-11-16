// A quiet bed per map theme (`public/audio/ambience/<theme>.ogg`: wind and birds, cold wind, dry wind, swamp, rumble and fire),
// seamless loops made offline. It plays from `audioOutput().amb` (under the sfx volume, dipped by `duck` under big events), starts
// with a match and fades out with it; a hidden tab suspends the whole context, so it pauses with the page. Cosmetic, per page.

import { audioOutput, decodeFile } from './audio';
import type { Theme } from './soundClass';

const FADE = 3;
export const ambienceFile = (theme: Theme) => `audio/ambience/${theme}.ogg`;

let playing: { src: AudioBufferSourceNode; gain: GainNode; theme: Theme } | undefined;
let token = 0;

/** Start the bed for a theme (replacing another). Quietly nothing when audio is locked or the file is missing. */
export async function startAmbience(theme: Theme) {
  const output = audioOutput();
  if (!output || playing?.theme === theme) return;
  const mine = ++token;
  stopAmbience(false);
  const buffer = await decodeFile(output.ctx, ambienceFile(theme));
  if (!buffer || mine !== token) return;
  const { ctx, amb } = output;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(gain).connect(amb);
  src.start();
  playing = { src, gain, theme };
}

/** Fade the bed out (the match ended). */
export function stopAmbience(invalidate = true) {
  if (invalidate) token++;
  if (!playing) return;
  const { src, gain } = playing;
  playing = undefined;
  const t = gain.context.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(0, t + 1.5);
  src.stop(t + 1.6);
}
