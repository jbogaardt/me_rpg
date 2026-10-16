// The Dungeon Master's spoken voice: the browser's own speech synthesis, free and on the player's device, so each page
// says the caption it was told and nothing goes over the wire. A player's choice to mute is remembered in this browser only.
// A line is spoken a sentence at a time (some browsers cut a long utterance off after about 15 seconds) and is never cut
// short by the next one: `Dialog` waits for `busy` to end before it shows the next caption. HUD (DOM); silent where the
// browser has no speech.

const KEY = 'voice-muted';

const synth = (): SpeechSynthesis | null => (typeof speechSynthesis === 'undefined' ? null : speechSynthesis);

let muted = false;
try {
  muted = localStorage.getItem(KEY) === '1';
} catch {
  /* storage can be blocked: the voice stays on */
}

/** Sentences still waiting to be spoken or being spoken (counted by us: `speechSynthesis.speaking` lags behind). */
let pending = 0;

export const voice = {
  get available(): boolean {
    return synth() !== null && typeof SpeechSynthesisUtterance !== 'undefined';
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
    const s = synth();
    if (!s || muted || !this.available || !text) return;
    for (const part of text.match(/[^.!?]+[.!?]*/g) ?? [text]) {
      const sentence = part.trim();
      if (!sentence) continue;
      const u = new SpeechSynthesisUtterance(sentence);
      u.rate = 0.95;
      u.pitch = 0.85; // an old wanderer
      u.lang = 'en-US';
      pending++;
      const done = () => {
        pending = Math.max(0, pending - 1);
      };
      u.onend = done;
      u.onerror = done;
      s.speak(u);
    }
  },
  /** Stop at once and forget what was waiting (mute, leaving the game). */
  stop() {
    pending = 0;
    synth()?.cancel();
  },
};
