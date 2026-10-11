import { TOUCH_CODES, loadBindings, saveBindings, type Action } from './bindings';
import { input } from './input';

// The player's bindings (saved in localStorage) joined to the input state. Game code asks about actions, never keys.
// The on-screen buttons always work as well, whatever the keyboard is bound to.

export const bindings = loadBindings();

export const persistBindings = () => saveBindings(bindings);

export const actionDown = (a: Action) => input.isHeld(...bindings.codes(a)) || input.isTouched(...TOUCH_CODES[a]);

export const actionPressed = (a: Action) => input.wasHit(...bindings.codes(a)) || input.wasTouched(...TOUCH_CODES[a]);
