import { describe, expect, it } from 'vitest';
import { BATTLE, CROSSFADE, nextIndex, PLAYLISTS, PRELOAD, stage } from './playlist';
import { THEMES } from './soundClass';

describe('the music rotation', () => {
  it('gives each theme a rotation of distinct tracks that all exist, and each theme a different first track or order', () => {
    for (const t of THEMES) {
      const list = PLAYLISTS[t];
      expect(new Set(list).size, t).toBe(list.length);
      for (const id of list) expect(BATTLE[id], id).toBeDefined();
    }
    expect(new Set(THEMES.map((t) => PLAYLISTS[t].join())).size).toBe(THEMES.length);
  });

  it('wraps round the rotation', () => {
    expect([0, 1, 2].map((i) => nextIndex(i, 3))).toEqual([1, 2, 0]);
    expect(nextIndex(0, 1)).toBe(0);
  });

  it('decodes the next track a while before the crossfade, then crossfades near the end', () => {
    expect(stage(0, 100, 10)).toBe('play');
    expect(stage(0, 100, 100 - CROSSFADE - PRELOAD + 1)).toBe('preload');
    expect(stage(0, 100, 100 - CROSSFADE + 0.5)).toBe('crossfade');
    expect(stage(0, 100, 140)).toBe('crossfade');
  });
});
