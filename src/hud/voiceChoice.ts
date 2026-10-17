// Which engine says the Dungeon Master (Pixi-free, no DOM): the natural voice is the default, the browser's own is the
// fallback. Kept apart from `voice.ts` so the rules are unit-tested without a browser.

export type EngineState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Does this player want the natural voice? Only an explicit choice of it in the Controls tab (`stored` is '1') does: the
 * browser's own voice speaks at once and costs nothing, while the model is a 90 MB download that takes seconds to make each
 * sentence and keeps a core busy, which a game that must stay smooth (and a host and friends sharing one machine) cannot
 * spare by default. Where it cannot run at all the answer is no.
 */
export function wantsNaturalVoice(stored: string | null, supported: boolean): boolean {
  return supported && stored === '1';
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
