import { AIM_MODES, type AimMode } from '../core/aim';
import { aimSetting } from '../core/controls';
import type { TouchControls } from '../core/touch';

// The Controls tab's aim choice (markup `#aim-setting` in index.html): aim weapons and spells the way you last walked
// (the original), or at the mouse pointer. On a touch screen the "mouse" is the spot you last tapped on the game.
// The saving and the rules are in core/aim.ts; the scene reads the choice through `pointerAim` in core/controls.ts.

export class AimSetting {
  private buttons = new Map<AimMode, HTMLButtonElement>();
  private note = document.getElementById('aim-note')!;

  constructor(private readonly touch: TouchControls) {
    for (const mode of AIM_MODES) {
      const button = document.querySelector<HTMLButtonElement>(`#aim-mode [data-aim="${mode}"]`)!;
      button.addEventListener('click', () => {
        aimSetting.set(mode);
        this.refresh();
      });
      this.buttons.set(mode, button);
    }
  }

  /** Called when the menu opens. */
  refresh() {
    const touch = this.touch.active;
    this.buttons.get('mouse')!.textContent = touch ? 'Tap' : 'Mouse';
    for (const [mode, button] of this.buttons) button.setAttribute('aria-checked', String(mode === aimSetting.mode));
    this.note.textContent =
      aimSetting.mode === 'mouse'
        ? touch
          ? 'Tap the game to point; the attack button and your spells go that way.'
          : 'Weapons and spells point at the mouse. Range is unchanged.'
        : 'Weapons and spells point the way you last walked.';
  }
}
