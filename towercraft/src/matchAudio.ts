// What a match starts and loads: the effects its races need, the ambience and the battle music of its map's theme (nothing of this
// loads before a match but the interface sounds and the title's music). One call from `main.ts` at the start of a match.

import { loadKinds, onUnlock } from './audio';
import { playMusic } from './music';
import { kindsForMatch, themeOf } from './soundClass';
import type { RaceId } from './sim/races';

export function startMatchAudio(races: readonly RaceId[], boardId: string) {
  onUnlock(() => {
    void loadKinds(kindsForMatch(races));
  });
  playMusic(themeOf(boardId));
}
