// Which engine says the Dungeon Master (Pixi-free, no DOM): the natural voice is the default, the browser's own is the
// fallback. Kept apart from `voice.ts` so the rules are unit-tested without a browser.

export type EngineState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Does this player want the natural voice? `stored` is what `localStorage` held: an explicit '0' (the player chose the
 * browser's voice in the Controls tab) turns it off, so a fresh profile, a cleared one or blocked storage hears the natural
 * voice. On a `phone` it is not the default (a 90 MB model in a phone's browser often cannot load): only an explicit '1'
 * asks for it. Where it cannot run at all the answer is no.
 */
export function wantsNaturalVoice(stored: string | null, supported: boolean, phone = false): boolean {
  return supported && (stored === '1' || (stored !== '0' && !phone));
}

/** The browser's voice stands in while the natural one is not ready: it is not chosen, still loading, or failed. */
export function usesNaturalNow(wants: boolean, state: EngineState): boolean {
  return wants && state === 'ready';
}

/** The words to show when the natural voice cannot be had (null when nothing needs saying). */
export function fallbackNote(wants: boolean, supported: boolean, state: EngineState, reason = ''): string | null {
  if (!supported) return 'This browser cannot run the natural voice; the browser’s own speaks.';
  if (wants && state === 'failed')
    return `The natural voice could not be loaded${reason ? ` (${reason})` : ' (offline?)'}. The browser’s voice speaks instead.`;
  return null;
}

/** Voices that are jokes, not speech (macOS novelty voices). */
const NOVELTY =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox/i;

/** Names of the plainer men's voices the major platforms ship: the wise old wanderer the DM is. */
const MALE = /daniel|george|arthur|oliver|thomas|guy|ryan|alex|david|mark|james|google uk english male|male/i;

/**
 * The best of the browser's own voices for the DM: English, the neural or "natural" ones the browser may offer first, then
 * a British man, never a novelty voice. Null when it has no English voice at all (the browser's default then speaks).
 */
export function pickVoice<T extends { name: string; lang: string }>(voices: readonly T[]): T | null {
  const score = (v: T) =>
    (/natural|neural|online/i.test(v.name) ? 8 : 0) +
    (MALE.test(v.name) ? 4 : 0) +
    (/^en[-_]gb/i.test(v.lang) ? 2 : /^en[-_]/i.test(v.lang) ? 1 : 0) +
    (/google|microsoft|apple|siri/i.test(v.name) ? 1 : 0);
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang) && !NOVELTY.test(v.name));
  return english.reduce<T | null>((best, v) => (!best || score(v) > score(best) ? v : best), null);
}
