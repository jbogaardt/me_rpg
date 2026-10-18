import { describe, expect, it } from 'vitest';
import { DEFAULT_SFX_VOLUME } from '../systems/gameSounds';
import { SfxSettings, clampVolume } from './soundSettings';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('sound-effect settings', () => {
  it('start on, at the default volume', () => {
    const s = new SfxSettings(memory());
    expect(s.muted).toBe(false);
    expect(s.volume).toBe(DEFAULT_SFX_VOLUME);
  });
  it('are remembered', () => {
    const store = memory();
    const a = new SfxSettings(store);
    a.setMuted(true);
    a.setVolume(0.3);
    const b = new SfxSettings(store);
    expect(b.muted).toBe(true);
    expect(b.volume).toBe(0.3);
  });
  it('clamp the volume and survive junk or blocked storage', () => {
    expect(clampVolume(5)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(NaN)).toBe(DEFAULT_SFX_VOLUME);
    const store = memory();
    store.setItem('me_rpg.sfx-volume', 'loud');
    expect(new SfxSettings(store).volume).toBe(DEFAULT_SFX_VOLUME);
    const fail = () => {
      throw new Error('blocked');
    };
    const s = new SfxSettings({ getItem: fail, setItem: fail, removeItem: fail });
    s.setMuted(true);
    expect(s.muted).toBe(true);
  });
});
