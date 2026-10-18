// The debug/accessibility choice to show damage numbers (Pixi-free, tested). OFF by default: the game shows a blow by its
// weight (hit-pause, kick, spark size and colour), not by a number. On, a number floats from each blow THIS page's
// simulation lands (solo and the host); a co-op guest is not told the damage, so it has none. Per browser (localStorage),
// local UI state: nothing is sent.

const STORAGE_KEY = 'me_rpg.damagenumbers';

export function loadDamageNumbers(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveDamageNumbers(
  on: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = safeStorage(),
) {
  try {
    if (on) storage?.setItem(STORAGE_KEY, 'on');
    else storage?.removeItem(STORAGE_KEY);
  } catch {
    // private mode or blocked storage: the choice lasts for this visit only
  }
}

export const damageNumbers = {
  on: loadDamageNumbers(),
  set(on: boolean) {
    this.on = on;
    saveDamageNumbers(on);
  },
};

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
