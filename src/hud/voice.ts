// The Dungeon Master's spoken voice, on the player's device, so each page says the caption it was told and nothing goes
// over the wire. Two engines: a natural voice, the Kokoro model run in the page (`naturalVoice.ts`, the default: it
// downloads the model once) and the browser's own speech synthesis (free, instant; the fallback and a setting). A line is
// said by the natural voice only once that is ready; until then, or if it fails, the browser's says it (`onFallback` lets
// the HUD say so). Only an explicit choice of the browser's voice is stored ('0'); the choices to mute and for the
// engine are remembered in this browser only. A line is spoken a sentence at a time and is never cut short by the
// next one: `Dialog` waits for `busy` to end before it shows the next caption. HUD (DOM); silent where there is no speech.

import { natural } from './naturalVoice';
import { speechParts } from './speechParts';
import { fallbackNote, usesNaturalNow, wantsNaturalVoice } from './voiceChoice';

const KEY = 'voice-muted';
const ENGINE_KEY = 'voice-natural';

const synth = (): SpeechSynthesis | null => (typeof speechSynthesis === 'undefined' ? null : speechSynthesis);

let muted = false;
try {
  muted = localStorage.getItem(KEY) === '1';
} catch {
  /* storage can be blocked: the voice stays on */
}

let stored: string | null = null;
try {
  stored = localStorage.getItem(ENGINE_KEY);
} catch {
  /* storage can be blocked: the default (natural) stands */
}
const phone = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
let wantsNatural = wantsNaturalVoice(stored, natural.supported, phone);
if (wantsNatural) void natural.load(); // the default: load it while the game starts

// A phone lets a page make sound only after a tap, click or key, and speech synthesis likewise: the first one wakes both
// engines (a silent blip, an empty utterance), or the DM would be "speaking" to a locked speaker for the whole game.
const WAKERS = ['touchend', 'click', 'keydown'] as const;
function wake() {
  for (const type of WAKERS) window.removeEventListener(type, wake, true);
  natural.unlock();
  const s = synth();
  if (s && typeof SpeechSynthesisUtterance !== 'undefined') {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    s.speak(u);
  }
}
if (typeof window !== 'undefined') for (const type of WAKERS) window.addEventListener(type, wake, true);

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
  /** Why the browser's voice is speaking instead of the natural one, or null. */
  get fallback(): string | null {
    return fallbackNote(wantsNatural, natural.supported, natural.state, natural.error);
  },
  /** Call `fn` with the note when the natural voice fails to load (once per failure). Returns the way to stop. */
  onFallback(fn: (note: string) => void): () => void {
    let told = false;
    return natural.onChange(() => {
      const note = natural.state === 'failed' ? this.fallback : null;
      if (note && !told) fn(note);
      told = note !== null;
    });
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
    const useNatural = usesNaturalNow(wantsNatural, natural.state);
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
