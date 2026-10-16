// The Dungeon Master's spoken voice: the browser's own speech synthesis, free and on the player's device, so each page
// says the aside it was told and nothing goes over the wire. A player's choice to mute is remembered in this browser only.
// HUD (DOM); silent where the browser has no speech.

const KEY = 'voice-muted';

const synth = (): SpeechSynthesis | null => (typeof speechSynthesis === 'undefined' ? null : speechSynthesis);

let muted = false;
try {
  muted = localStorage.getItem(KEY) === '1';
} catch {
  /* storage can be blocked: the voice stays on */
}

export const voice = {
  get available(): boolean {
    return synth() !== null && typeof SpeechSynthesisUtterance !== 'undefined';
  },
  get muted(): boolean {
    return muted;
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
  /** Say `text` now, over anything still being said. */
  speak(text: string) {
    const s = synth();
    if (!s || muted || !this.available || !text) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 0.85; // an old wanderer
    u.lang = 'en-US';
    s.speak(u);
  },
  stop() {
    synth()?.cancel();
  },
};
