// The player's choice of the quick-item pop-up (Pixi-free, tested): the selected item's icon floats over the hero for a
// moment when the player cycles or uses it. On by default, per browser (localStorage), local UI state like the aim: online
// it is never sent and each side draws its own.

const STORAGE_KEY = 'me_rpg.itempopup';

export function loadItemPopup(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveItemPopup(
  on: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = safeStorage(),
) {
  try {
    if (on) storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, 'off');
  } catch {
    // private mode or blocked storage: the choice lasts for this visit only
  }
}

export const itemPopup = {
  on: loadItemPopup(),
  set(on: boolean) {
    this.on = on;
    saveItemPopup(on);
  },
};

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
