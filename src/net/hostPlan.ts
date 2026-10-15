// What a host chose in the lobby, carried across the page reload that moves them into the world they picked
// (Pixi-free, tested). The world is the page's own (`?campaign=...`), so choosing another one reloads the page; this
// keeps the rest of the choices (how hard the world pushes) and tells the new page to create the game at once. Nobody
// types an address: the player picks a story and the game takes care of it.

import { isPressure, type Pressure } from '../systems/dmPowers';

export interface HostPlan {
  pressure: Pressure;
}

const KEY = 'me_rpg.hostplan';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const safeStore = (): Store | undefined => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};

/** Remember the plan for the next page load (best effort: storage can be blocked). */
export function saveHostPlan(plan: HostPlan, storage: Store | undefined = safeStore()) {
  try {
    storage?.setItem(KEY, JSON.stringify(plan));
  } catch {
    // blocked storage: the new page simply starts as a plain host
  }
}

/** The plan the previous page left, once (it is removed as it is read), or null. */
export function takeHostPlan(storage: Store | undefined = safeStore()): HostPlan | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    storage?.removeItem(KEY);
    const plan = JSON.parse(raw) as Partial<HostPlan> | null;
    return plan && isPressure(plan.pressure) ? { pressure: plan.pressure } : null;
  } catch {
    return null;
  }
}
