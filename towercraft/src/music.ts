// The match's background music: an intro, then a loop that runs until the match ends. One track serves every map
// (`public/audio/music/`, credits in `public/audio/CREDITS.md`). It plays into the sounds' output (`audio.ts`), so the mute
// button covers it, and it waits for the first click or key press like the sounds do: a match begun before that starts
// its music once audio is unlocked.

import { audioOutput } from './audio';

const INTRO = 'audio/music/heartfelt-battle_intro.ogg';
const LOOP = 'audio/music/heartfelt-battle_loop.ogg';
/** The music's loudness under the sounds (0 to 1). */
const VOLUME = 0.3;
/** How long (s) the music takes to fade out when a match ends. */
const FADE = 1.5;

interface Track {
  ctx: AudioContext;
  gain: GainNode;
  nodes: AudioBufferSourceNode[];
}

let wanted = false;
let starting = false;
let track: Track | undefined;
let decoded: { ctx: AudioContext; intro: AudioBuffer; loop: AudioBuffer } | undefined;

async function decode(ctx: AudioContext): Promise<{ intro: AudioBuffer; loop: AudioBuffer } | undefined> {
  try {
    const [intro, loop] = await Promise.all(
      [INTRO, LOOP].map(async (path) => {
        const res = await fetch(new URL(path, document.baseURI).href);
        return ctx.decodeAudioData(await res.arrayBuffer());
      }),
    );
    return { intro: intro!, loop: loop! };
  } catch {
    return undefined; // music that will not load is silence, not a broken match
  }
}

/** Start the match's music now, or as soon as audio is unlocked. Safe to call again. */
export function playMusic() {
  wanted = true;
  void begin();
}

async function begin() {
  const output = audioOutput();
  if (!wanted || !output || track || starting) return;
  starting = true;
  try {
    const { ctx, out } = output;
    if (decoded?.ctx !== ctx) {
      const files = await decode(ctx);
      if (!files) return;
      decoded = { ctx, ...files };
    }
    if (!wanted || track) return;
    const at = ctx.currentTime + 0.05;
    const gain = ctx.createGain();
    gain.gain.value = VOLUME;
    gain.connect(out);
    const intro = ctx.createBufferSource();
    intro.buffer = decoded.intro;
    intro.connect(gain);
    intro.start(at);
    const loop = ctx.createBufferSource();
    loop.buffer = decoded.loop;
    loop.loop = true;
    loop.connect(gain);
    loop.start(at + decoded.intro.duration); // the loop follows the intro without a gap
    track = { ctx, gain, nodes: [intro, loop] };
  } finally {
    starting = false;
  }
}

/** Fade the music out (the match is over). */
export function stopMusic() {
  wanted = false;
  if (!track) return;
  const { ctx, gain, nodes } = track;
  track = undefined;
  gain.gain.setTargetAtTime(0, ctx.currentTime, FADE / 4);
  for (const node of nodes) node.stop(ctx.currentTime + FADE);
}
