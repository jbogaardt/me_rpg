// Small sounds for the interface (`synth.ts` makes them, `audio.ts` plays them through the sfx volume): a soft click on a button,
// a low thud when a purchase or a building is refused, a two-note confirm when a unit is trained and a light tick when a unit is
// picked and its voice line does not play. Cosmetic and per page; nothing goes over the wire.

import { installAudioLifecycle, playSynth } from './audio';

/** performance.now() of the last interface sound: one gesture makes one sound (a refusal or confirm replaces the click). */
let lastAt = -Infinity;
const RECENT = 90;

function play(kind: 'click' | 'tick' | 'refuse' | 'confirm') {
  lastAt = performance.now();
  playSynth(kind);
}

export const uiClick = () => play('click');
export const uiTick = () => play('tick');
export const uiRefuse = () => play('refuse');
export const uiConfirm = () => play('confirm');

/** One delegated listener for every button (the dock and cards are rebuilt all the time), and the audio unlock/pause hooks. */
export function installUiSound() {
  installAudioLifecycle();
  document.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('button') : null;
    // The ghost's OK is answered by the building going up; the speaker button by silence.
    if (!b || b.id === 'ghost-ok' || b.id === 'cam-sound') return;
    if (performance.now() - lastAt < RECENT) return; // a handler already made this gesture's sound
    if (b.disabled || b.classList.contains('poor') || b.classList.contains('lock')) uiRefuse();
    else uiClick();
  });
  // A disabled button gets no click, but a press on it still says "no" where the browser reports the press.
  document.addEventListener('pointerdown', (e) => {
    const b = e.target instanceof Element ? e.target.closest('button') : null;
    if (b?.disabled && performance.now() - lastAt >= RECENT) uiRefuse();
  });
}
