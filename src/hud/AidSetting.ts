import { aidSetting, type Aids } from '../systems/aids';

// The Controls tab's map aids (markup `#aid-setting` in index.html): quest hints (search circle and star on the map, the
// tracker line) and the compass arrow, each on or off for this player. The story may switch them off as well
// (capabilities `guide` and `compass`); the map itself is always on. Saved per browser (systems/aids.ts), local UI state:
// online it is never sent and a guest has the same choice as anyone.

const KEYS: (keyof Aids)[] = ['hints', 'compass'];

export class AidSetting {
  private buttons = new Map<keyof Aids, HTMLButtonElement>();
  private note = document.getElementById('aid-note')!;

  constructor() {
    for (const key of KEYS) {
      const button = document.querySelector<HTMLButtonElement>(`#aid-setting [data-aid="${key}"]`)!;
      button.addEventListener('click', () => {
        aidSetting.set(key, !aidSetting.aids[key]);
        this.refresh();
      });
      this.buttons.set(key, button);
    }
  }

  /** Called when the menu opens. */
  refresh() {
    for (const [key, button] of this.buttons) button.setAttribute('aria-checked', String(aidSetting.aids[key]));
    const { hints, compass } = aidSetting.aids;
    this.note.textContent =
      hints && compass
        ? 'The map is always there. Turn these off to find your own way; some stories give none anyway.'
        : `The map is always there. ${hints ? 'Hints on.' : 'No search circles or tracker line.'} ${compass ? 'Compass on.' : 'No compass arrow.'}`;
  }
}
