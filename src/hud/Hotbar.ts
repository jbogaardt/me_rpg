import type { Hero } from '../systems/combat';
import { iconKind } from '../systems/inventory';
import { Hotbar, HOTBAR_SLOTS, viewSlot } from '../systems/hotbar';
import { iconSvg } from './itemIcons';

// The quick-slot bar (HTML, right edge of the screen). Layer: core engine, per-player UI state. The four buttons are static
// in index.html with `data-key` Digit1-4, so a tap and the number key are the same press (core/touch.ts, controls.ts
// `hotbarPressed`); this file only paints them. A slot holds an item name; using one is an Inventory action done by the
// scene through the same path as the menu (so a co-op guest asks the host). Assignment is per player and saved in this
// browser only (`me_rpg.hotbar`); it is made from the Inventory tab.

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

export class HotbarView {
  private root = document.getElementById('hotbar')!;
  private cells = [...this.root.querySelectorAll<HTMLElement>('.hb')];
  private shown = '';

  /** Repaint when something changed. `visible` is false for the Dungeon Master, who carries nothing. */
  update(hero: Hero, visible: boolean) {
    this.root.hidden = !visible;
    if (!visible) return;
    const views = Array.from({ length: HOTBAR_SLOTS }, (_, i) => viewSlot(hero, hotbar.get(i)));
    const key = views.map((v, i) => `${hotbar.get(i)}|${v.worn ? 1 : 0}|${v.count}`).join(';');
    if (key === this.shown) return;
    this.shown = key;
    this.cells.forEach((cell, i) => {
      const v = views[i]!;
      const name = hotbar.get(i);
      cell.classList.toggle('worn', v.worn);
      cell.classList.toggle('gone', !!name && !v.item);
      cell.title = name || `Quick slot ${i + 1}`;
      cell.innerHTML = `<span class="num">${i + 1}</span>${v.item ? `<span class="item">${iconSvg(iconKind(v.item), v.item.art)}</span>` : ''}${v.count > 1 ? `<span class="qty">${v.count}</span>` : ''}`;
    });
  }
}
