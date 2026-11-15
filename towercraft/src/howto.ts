// The "How to play" panel (layer: this game's own, cosmetic). Shown once on a device's first match (`localStorage` `towercraft:howto`), and
// from the title screen and the in-match menu. Wording follows the pointer: a phone is told taps and holds, a mouse clicks and drags.
import { icon } from './icons';

const KEY = 'towercraft:howto';

/** The lines of the panel: a picture (HTML) and the words. `touch` picks the wording. */
export function howtoSteps(touch: boolean): { pic: string; text: string }[] {
  return [
    { pic: '<i class="w"></i><i class="s"></i>', text: 'Build mills and quarries first: they pay you wood and stone.' },
    { pic: icon('unlock'), text: 'Build a producer building to unlock new units.' },
    {
      pic: icon('shield'),
      text: touch
        ? 'Tap a building in the dock, drag its ghost into place and tap Build. Hold it to read its stats.'
        : 'Click a building in the dock for its card, then click the field to place it.',
    },
    { pic: icon('heart'), text: 'Tap a building on the field for its card: train units and buy upgrades there.' },
    {
      pic: icon('sword'),
      text: touch
        ? 'Units walk the road. Press, hold and drag to box-select them, then tap a foe to send them.'
        : 'Units walk the road. Drag a box round them (Ctrl+A picks all), then click a foe to send them.',
    },
  ];
}

export const KEYS_LINE = '1-9 pick a building · H home · F whole map · + / − zoom · WASD pan · M sound · Esc menu';

export function initHowto(touch: () => boolean) {
  const el = document.getElementById('howto')!;
  const list = document.getElementById('howto-list')!;
  const keys = document.getElementById('howto-keys')!;
  const close = () => {
    el.hidden = true;
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* not remembered: it shows again next time */
    }
  };
  const show = () => {
    const t = touch();
    list.innerHTML = howtoSteps(t)
      .map((s) => `<li><span class="pic">${s.pic}</span><span>${s.text}</span></li>`)
      .join('');
    keys.hidden = t;
    keys.textContent = KEYS_LINE;
    el.hidden = false;
  };
  document.getElementById('howto-x')!.onclick = close;
  return {
    show,
    close,
    isOpen: () => !el.hidden,
    /** On the first match ever on this device. */
    firstRun() {
      try {
        if (localStorage.getItem(KEY)) return;
      } catch {
        return; // no storage: never nag
      }
      show();
    },
  };
}
