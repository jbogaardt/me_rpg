import { Hotbar } from '../systems/hotbar';

// The quick slots' storage (the button that shows them is hud/ItemButton.ts). Layer: core engine, per-player UI state. A
// slot holds an item name; using one is an Inventory action done by the scene through the same path as the menu (so a co-op
// guest asks the host). Assignment is per player and saved in this browser only (`me_rpg.hotbar`); it is made from the
// Inventory tab, and a new consumable fills a free shown slot by itself. Four slots are stored, three are shown.

const STORAGE_KEY = 'me_rpg.hotbar';

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function load(): Hotbar {
  try {
    const raw = safeStorage()?.getItem(STORAGE_KEY);
    return new Hotbar(raw ? (JSON.parse(raw) as unknown) : undefined);
  } catch {
    return new Hotbar();
  }
}

export const hotbar = load();

export function saveHotbar() {
  try {
    safeStorage()?.setItem(STORAGE_KEY, JSON.stringify(hotbar));
  } catch {
    // blocked storage: the slots last for this visit only
  }
}
