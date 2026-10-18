// What the attack key and the interact key mean (Pixi-free, tested), and the player's choice between the two designs.
//
// SPLIT (the default): the attack key only swings, casts and shoots; the interact key only talks, opens, picks up, harvests,
// drinks and reads. A press always does what its key says, so nothing is swallowed beside a chest or a person.
// CONTEXTUAL (the older single key, a setting): one key does both, deciding by what is near: a living foe within
// `FIGHT_RANGE` (Interactions) makes it a sword, otherwise a thing within reach is used, otherwise it swings.
// Per browser (localStorage), local UI state. Online each page tells the host which design it plays (`KEY.split`, net/protocol.ts).

export type KeyName = 'attack' | 'interact';
/** What a press does: swing the weapon, use what is near, or nothing. */
export type KeyUse = 'swing' | 'use' | 'none';

/** What `key` does. `foe` is a living enemy close by, `thing` something in reach to talk to, open or pick up. */
export function keyMeaning(contextual: boolean, key: KeyName, near: { foe: boolean; thing: boolean }): KeyUse {
  if (!contextual) return key === 'attack' ? 'swing' : 'use';
  // One key: a fight wins, then a thing, else the weapon (the interact key does not exist in this design).
  return near.foe ? 'swing' : near.thing ? 'use' : 'swing';
}

const STORAGE_KEY = 'me_rpg.contextkey';

export function loadContextKey(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveContextKey(
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

/** The live choice: `on` means the single contextual key. Off (split) unless the player switched it on. */
export const contextKey = {
  on: loadContextKey(),
  set(on: boolean) {
    this.on = on;
    saveContextKey(on);
  },
};

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
