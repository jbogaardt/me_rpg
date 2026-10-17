// The Dungeon Master's spoken voice, on the player's device, so each page says the caption it was told and nothing goes
// over the wire. Two engines: the browser's own speech synthesis (the default, free, instant) and a natural voice, the
// Kokoro model run in the page (`naturalVoice.ts`, opt-in because it downloads the model once). A line is said by the
// natural voice only once that is ready; until then, or if it fails, the browser's says it. The choices to mute and for the
// natural voice are remembered in this browser only. A line is spoken a sentence at a time and is never cut short by the
// next one: `Dialog` waits for `busy` to end before it shows the next caption. HUD (DOM); silent where there is no speech.

import { natural } from './naturalVoice';
import { speechParts } from './speechParts';

const KEY = 'voice-muted';
const ENGINE_KEY = 'voice-natural';

const synth = (): SpeechSynthesis | null => (typeof speechSynthesis === 'undefined' ? null : speechSynthesis);

let muted = false;
try {
  muted = localStorage.getItem(KEY) === '1';
} catch {
  /* storage can be blocked: the voice stays on */
}

let wantsNatural = false;
try {
  wantsNatural = localStorage.getItem(ENGINE_KEY) === '1';
} catch {
  /* storage can be blocked: the browser's voice stays */
}
if (wantsNatural && natural.supported) void natural.load(); // chosen before: load it while the game starts

/** Sentences still waiting to be spoken or being spoken (counted by us: `speechSynthesis.speaking` lags behind). */
let pending = 0;

export const voice = {
  get available(): boolean {
    return (synth() !== null && typeof SpeechSynthesisUtterance !== 'undefined') || (wantsNatural && natural.supported);
  },
  /** Has the player asked for the natural voice (it may still be loading, or have failed)? */
  get natural(): boolean {
    return wantsNatural;
  },
  /** Choose the natural voice (starting its download the first time) or the browser's own. */
  setNatural(value: boolean) {
    wantsNatural = value && natural.supported;
    try {
      localStorage.setItem(ENGINE_KEY, wantsNatural ? '1' : '0');
    } catch {
      /* not remembered */
    }
    if (wantsNatural) void natural.load();
  },
  get muted(): boolean {
    return muted;
  },
  /** Something is still being said. */
  get busy(): boolean {
    return pending > 0;
  },
  setMuted(value: boolean) {
    muted = value;
    try {
      localStorage.setItem(KEY, value ? '1' : '0');
    } catch {
      /* not remembered */
    }
    if (value) this.stop();
  },
  /** Say `text` after anything still being said. */
  speak(text: string) {
    if (muted || !this.available || !text) return;
    const done = () => {
      pending = Math.max(0, pending - 1);
    };
    const useNatural = wantsNatural && natural.state === 'ready';
    for (const sentence of speechParts(text)) {
      pending++;
      if (useNatural) {
        natural.say(sentence, done);
        continue;
      }
      const s = synth();
      if (!s || typeof SpeechSynthesisUtterance === 'undefined') {
        done();
        continue;
      }
      const u = new SpeechSynthesisUtterance(sentence);
      u.rate = 0.95;
      u.pitch = 0.85; // an old wanderer
      u.lang = 'en-US';
      u.onend = done;
      u.onerror = done;
      s.speak(u);
    }
  },
  /** Stop at once and forget what was waiting (mute, leaving the game). */
  stop() {
    pending = 0;
    natural.stop();
    synth()?.cancel();
  },
};
