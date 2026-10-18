import { aimToward, loadAimMode, saveAimMode, type Aim, type AimMode } from './aim';
import { FIXED_KEYS, HOTBAR_KEYS, TOUCH_CODES, loadBindings, saveBindings, type Action } from './bindings';
import { input } from './input';

// The player's bindings (saved in localStorage) joined to the input state. Game code asks about actions, never keys.
// The on-screen buttons always work as well, whatever the keyboard is bound to.

export const bindings = loadBindings();

export const persistBindings = () => saveBindings(bindings);

export const actionDown = (a: Action) => input.isHeld(...bindings.codes(a)) || input.isTouched(...TOUCH_CODES[a]);

export const actionPressed = (a: Action) => input.wasHit(...bindings.codes(a)) || input.wasTouched(...TOUCH_CODES[a]);

/** A press of this action's on-screen pad direction, with no key pressed for it (a thumb, not a keyboard). */
export const actionTouchedOnly = (a: Action) =>
  input.wasTouched(...TOUCH_CODES[a]) && !input.wasHit(...bindings.codes(a));

/** How the player aims (saved): along the way they last walked, or at the mouse / the last tap. */
export const aimSetting = {
  mode: loadAimMode(),
  set(mode: AimMode) {
    this.mode = mode;
    saveAimMode(mode);
  },
};

/** The direction to aim in from `from` (CSS px on screen), if the player aims with the mouse and has pointed somewhere. */
export function pointerAim(from: { x: number; y: number }): Aim | null {
  const at = aimSetting.mode === 'mouse' ? input.pointer() : null;
  return at ? aimToward(from.x, from.y, at.x, at.y) : null;
}

/** The menu key (Esc / Tab, or the ☰ button) went down this frame. */
export const menuPressed = () => input.wasPressed(...FIXED_KEYS.menu);

/** The map key (M, or the M button) went down this frame. */
export const mapPressed = () => input.wasPressed(...FIXED_KEYS.map);

/** Where the game was clicked or tapped (CSS px) this frame, or null: the DM clicks or taps a foe to possess it. */
export const clickedAt = (): { x: number; y: number } | null =>
  input.wasHit('Mouse0') ? input.pointer() : input.tap();

/** The hotbar slot (0-based) whose number key went down this frame, or -1. */
export const hotbarPressed = (): number => HOTBAR_KEYS.findIndex((code) => input.wasPressed(code));

/** The quick-item keys (bindable: use, previous, next) went down this frame; the wheel is read by hud/ItemButton.ts. */
export const itemKeys = () => ({
  use: actionPressed('itemUse'),
  prev: actionPressed('itemPrev'),
  next: actionPressed('itemNext'),
});

/** The Dungeon Master's stop-time key (T) went down this frame. */
export const stopPressed = () => input.wasPressed(...FIXED_KEYS.stop);

/**
 * -1 / +1 when the player pressed left / right: the move keys, as they are bound, and the D-pad. In an open menu or shop
 * counter these flip the tabs, so there is one idea of "left" and "right" everywhere.
 */
export const tabStep = (): -1 | 0 | 1 => (actionPressed('left') ? -1 : actionPressed('right') ? 1 : 0);
