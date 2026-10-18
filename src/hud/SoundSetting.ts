import { sfxSettings } from '../core/soundSettings';
import { playGame } from './gameSfx';

// The Controls tab's sound-effects choice (markup `#sfx-setting` in index.html): a switch and a volume slider (both work
// by touch) for the game's own sounds (swing, hit, hurt...). Independent of the Dungeon Master's voice mute (`voice.ts`).
// The saving is in core/soundSettings.ts; the sounds are played by `gameSfx.ts`.

export class SoundSetting {
  private mute = document.getElementById('sfx-mute')!;
  private volume = document.getElementById('sfx-volume') as HTMLInputElement;
  private note = document.getElementById('sfx-note')!;

  constructor() {
    this.mute.addEventListener('click', () => {
      sfxSettings.setMuted(!sfxSettings.muted);
      this.refresh();
      playGame('hit'); // a sample, so a tap on a phone also wakes the sound
    });
    this.volume.addEventListener('input', () => {
      sfxSettings.setVolume(Number(this.volume.value) / 100);
      if (sfxSettings.muted && sfxSettings.volume > 0) sfxSettings.setMuted(false);
      this.refresh();
    });
    this.volume.addEventListener('change', () => playGame('hit'));
  }

  /** Called when the menu opens. */
  refresh() {
    const on = !sfxSettings.muted;
    this.mute.setAttribute('aria-checked', String(on));
    this.mute.textContent = on ? 'On' : 'Off';
    this.volume.value = String(Math.round(sfxSettings.volume * 100));
    this.note.textContent = on
      ? 'Swings, hits, spells and chests. The Dungeon Master’s voice has its own 🔊 button.'
      : 'Sound effects are off. The Dungeon Master’s voice is unaffected.';
  }
}
