// Which engine says the Dungeon Master (Pixi-free, no DOM): the natural voice is the default, the browser's own is the
// fallback. Kept apart from `voice.ts` so the rules are unit-tested without a browser.

export type EngineState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Does this player want the natural voice? `stored` is what `localStorage` held: only an explicit '0' (the player chose the
 * browser's voice in the Controls tab) turns it off, so a fresh profile, a cleared one or blocked storage hears the natural
 * voice. Where it cannot run at all the answer is no.
 */
export function wantsNaturalVoice(stored: string | null, supported: boolean): boolean {
  return supported && stored !== '0';
}

/** The browser's voice stands in while the natural one is not ready: it is not chosen, still loading, or failed. */
export function usesNaturalNow(wants: boolean, state: EngineState): boolean {
  return wants && state === 'ready';
}

/** The words to show when the natural voice cannot be had (null when nothing needs saying). */
export function fallbackNote(wants: boolean, supported: boolean, state: EngineState): string | null {
  if (!supported) return 'This browser cannot run the natural voice; the browser’s own speaks.';
  if (wants && state === 'failed')
    return 'The natural voice could not be loaded (offline?). The browser’s voice speaks instead.';
  return null;
}
