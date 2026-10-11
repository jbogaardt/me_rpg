import { FIXED_KEYS, TOUCH_CODES, loadBindings, saveBindings, type Action } from './bindings';
import { input } from './input';

// The player's bindings (saved in localStorage) joined to the input state. Game code asks about actions, never keys.
// The on-screen buttons always work as well, whatever the keyboard is bound to.

export const bindings = loadBindings();

export const persistBindings = () => saveBindings(bindings);

export const actionDown = (a: Action) => input.isHeld(...bindings.codes(a)) || input.isTouched(...TOUCH_CODES[a]);

export const actionPressed = (a: Action) => input.wasHit(...bindings.codes(a)) || input.wasTouched(...TOUCH_CODES[a]);

/** The menu key (Esc / Tab, or the ☰ button) went down this frame. */
export const menuPressed = () => input.wasPressed(...FIXED_KEYS.menu);

/** The map key (M, or the M button) went down this frame. */
export const mapPressed = () => input.wasPressed(...FIXED_KEYS.map);

/**
 * -1 / +1 when the player pressed left / right: the move keys, as they are bound, and the D-pad. In an open menu or shop
 * counter these flip the tabs, so there is one idea of "left" and "right" everywhere.
 */
export const tabStep = (): -1 | 0 | 1 => (actionPressed('left') ? -1 : actionPressed('right') ? 1 : 0);
