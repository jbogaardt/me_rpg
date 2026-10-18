// The sound-effects settings (Pixi-free): a mute and a volume for the game's own sounds (swing, hit, hurt...), saved in
// localStorage and independent of the Dungeon Master's voice mute (`hud/voice.ts`). Local to this browser; nothing is sent.

import { DEFAULT_SFX_VOLUME } from '../systems/gameSounds';

const MUTE_KEY = 'me_rpg.sfx-muted';
const VOLUME_KEY = 'me_rpg.sfx-volume';

export const clampVolume = (v: number): number =>
  Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_SFX_VOLUME;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeStorage(): Store | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export class SfxSettings {
  muted = false;
  volume = DEFAULT_SFX_VOLUME;

  constructor(private readonly storage: Store | undefined = safeStorage()) {
    try {
      this.muted = storage?.getItem(MUTE_KEY) === '1';
      const raw = storage?.getItem(VOLUME_KEY);
      if (raw !== null && raw !== undefined && raw !== '') this.volume = clampVolume(Number(raw));
    } catch {
      /* blocked storage: the defaults stand */
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.save(MUTE_KEY, muted ? '1' : null);
  }

  setVolume(volume: number) {
    this.volume = clampVolume(volume);
    this.save(VOLUME_KEY, this.volume === DEFAULT_SFX_VOLUME ? null : String(this.volume));
  }

  private save(key: string, value: string | null) {
    try {
      if (value === null) this.storage?.removeItem(key);
      else this.storage?.setItem(key, value);
    } catch {
      /* private mode: lasts for this visit only */
    }
  }
}

/** The page's settings. */
export const sfxSettings = new SfxSettings();
