// The in-match menu (layer: this game's own, cosmetic): Resume, sound and music volume, sound on/off, How to play, Leave match. A solo
// match pauses while it is open (`main.ts` reads `isOpen`); an online one never does (lockstep: the rival's clock runs on). Leaving asks
// first, then calls `leave` (`main.ts` tears the match down the way "Play again" does).
import { isMuted, setMuted, setVolume, volume } from './audio';

export type PauseOptions = {
  /** Whether the match is online: no pause, and the wording says so. */
  online: () => boolean;
  /** Back to the title screen. */
  leave: () => void;
  howto: () => void;
  /** The sound button on the camera bar shows the mute too. */
  muteChanged: () => void;
};

export function initPauseMenu(o: PauseOptions) {
  const el = document.getElementById('pause')!;
  const note = document.getElementById('pause-note')!;
  const sound = document.getElementById('pause-sound') as HTMLButtonElement;
  const leaveBtn = document.getElementById('pause-leave') as HTMLButtonElement;
  const sfx = document.getElementById('vol-sfx') as HTMLInputElement;
  const music = document.getElementById('vol-music') as HTMLInputElement;
  let confirming = false;

  const showSound = () => {
    sound.textContent = isMuted() ? 'Sound: off' : 'Sound: on';
    sound.classList.toggle('on', !isMuted());
  };
  const showLeave = () => {
    leaveBtn.textContent = confirming ? 'Really leave?' : 'Leave match';
    leaveBtn.classList.toggle('danger', confirming);
  };
  const close = () => {
    el.hidden = true;
    confirming = false;
    showLeave();
  };
  const open = () => {
    sfx.value = String(Math.round(volume('sfx') * 100));
    music.value = String(Math.round(volume('music') * 100));
    note.textContent = o.online()
      ? 'The match goes on while this is open: your rival is still playing.'
      : 'The match is paused.';
    showSound();
    el.hidden = false;
    (document.getElementById('pause-resume') as HTMLElement).focus({ preventScroll: true });
  };
  sfx.oninput = () => setVolume('sfx', Number(sfx.value) / 100);
  music.oninput = () => setVolume('music', Number(music.value) / 100);
  sound.onclick = () => {
    setMuted(!isMuted());
    showSound();
    o.muteChanged();
  };
  document.getElementById('pause-resume')!.onclick = close;
  document.getElementById('pause-howto')!.onclick = o.howto;
  leaveBtn.onclick = () => {
    if (!confirming) {
      confirming = true;
      showLeave();
      return;
    }
    close();
    o.leave();
  };
  return {
    open,
    close,
    toggle: () => (el.hidden ? open() : close()),
    isOpen: () => !el.hidden,
    /** The sound toggled elsewhere (the M key). */
    refreshSound: () => {
      if (!el.hidden) showSound();
    },
  };
}
