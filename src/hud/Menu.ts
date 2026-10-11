import {
  attackPower,
  defensePower,
  GEAR_SLOTS,
  gearAttack,
  gearDefense,
  spellPower,
  xpToNext,
  type GearSlot,
  type Hero,
  type Item,
} from '../systems/combat';
import { packEntries, useFromPack, wearFromPack } from '../systems/inventory';
import { sellPrice } from '../systems/shops';
import { input } from '../core/input';
import { bonuses } from './itemText';
import type { Session } from '../net/session';
import type { TouchControls } from '../core/touch';
import { Keybinds } from './Keybinds';
import { Multiplayer } from './Multiplayer';

// Pause menu (HTML overlay; markup in index.html). The game is frozen while it is open.
// Tabs switch with a tap/click or Left/Right; the close button and menu keys are handled by the scene.
// The Online tab (multiplayer connection) is Multiplayer.ts. Online play does not pause the world behind the menu.

const TABS = ['status', 'gear', 'controls', 'online'];

const SLOT_LABELS: Record<GearSlot, string> = {
  weapon: 'Weapon',
  offhand: 'Off-hand',
  head: 'Head',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Feet',
  cape: 'Cloak',
};

/** One line for a gear slot: the item and what it adds ("Short Bow +2 ATK, ranged"), or "Empty". */
function describe(item: Item | undefined): string {
  if (!item) return '<small>Empty</small>';
  return `${item.name} <small>${bonuses(item)}</small>`;
}

export class Menu {
  open = false;
  private root = document.getElementById('menu')!;
  private tab = 0;

  private keybinds: Keybinds;
  private hero: Hero | null = null;
  /** Called after the pack changed what the hero wears, so the scene can redraw the hero. */
  onGearChange: () => void = () => {};

  constructor(session: Session, touch: TouchControls) {
    new Multiplayer(session, () => this.close()); // owns the Online tab
    this.keybinds = new Keybinds(touch); // owns the key editor on the Controls tab
    for (const [i, name] of TABS.entries()) {
      this.tabButton(name).addEventListener('click', () => this.select(i));
    }
    document.getElementById('menu-gear')!.addEventListener('click', (e) => this.packClick(e));
  }

  /** Wear or drink an item from the pack (the buttons beside it carry the entry's number). */
  private packClick(e: Event) {
    const button = (e.target as HTMLElement).closest<HTMLElement>('button[data-pack]');
    if (!button || !this.hero) return;
    button.blur(); // so the action key (Space) cannot press it again
    const entry = packEntries(this.hero)[Number(button.dataset.pack)];
    if (!entry) return;
    if (button.dataset.act === 'wear' && wearFromPack(this.hero, entry.item)) this.onGearChange();
    else if (button.dataset.act === 'use') useFromPack(this.hero, entry.item);
    this.render(this.hero);
  }

  /** Open or close the menu. When opening, `tab` (e.g. 'online') picks the page to show. */
  toggle(hero: Hero, tab?: string) {
    this.hero = hero;
    this.open = !this.open;
    this.root.hidden = !this.open;
    if (!this.open) this.keybinds.cancel();
    const index = tab ? TABS.indexOf(tab) : -1;
    if (index >= 0) this.tab = index;
    if (this.open) this.render(hero);
  }

  /** Close the menu (a no-op if it is already closed). */
  close() {
    this.open = false;
    this.root.hidden = true;
    this.keybinds.cancel();
  }

  /** Called each frame while open. */
  update() {
    if (input.wasPressed('ArrowLeft', 'KeyA')) this.select((this.tab + TABS.length - 1) % TABS.length);
    if (input.wasPressed('ArrowRight', 'KeyD')) this.select((this.tab + 1) % TABS.length);
  }

  private tabButton(name: string) {
    return this.root.querySelector<HTMLElement>(`[data-tab="${name}"]`)!;
  }

  private select(i: number) {
    this.tab = i;
    for (const [j, name] of TABS.entries()) {
      this.tabButton(name).classList.toggle('active', i === j);
      document.getElementById(`menu-${name}`)!.hidden = i !== j;
    }
  }

  /** The pack as a list: each kind once, with a button to wear it (gear) or drink it (supplies). */
  private packHtml(hero: Hero): string {
    const entries = packEntries(hero);
    if (!entries.length) return '<p class="empty">Empty. Buy or find something and it will be kept here.</p>';
    const rows = entries.map(({ item, count }, i) => {
      const act = item.slot
        ? `<button type="button" class="item-btn" data-pack="${i}" data-act="wear">Wear</button>`
        : item.use
          ? `<button type="button" class="item-btn" data-pack="${i}" data-act="use">Drink</button>`
          : '';
      const worth = item.value ? `<span class="price">sells ${sellPrice(item)}g</span>` : '';
      return `<li><div class="info"><b>${item.name}${count > 1 ? ` ×${count}` : ''}</b> <small>${bonuses(item)}</small></div>${worth}${act}</li>`;
    });
    return `<ul class="item-list">${rows.join('')}</ul>`;
  }

  private render(hero: Hero) {
    const s = hero.stats;
    const row = (label: string, value: string | number) => `<dt>${label}</dt><dd>${value}</dd>`;
    const next = xpToNext(s.level);
    const xpFrac = Math.max(0, Math.min(1, s.xp / next));
    document.getElementById('menu-status')!.innerHTML = `
      <h2>${hero.name} <small>Level ${s.level}</small></h2>
      <dl>
        ${row('HP', `${Math.ceil(s.hp)} / ${s.maxHp}`)}
        ${row('MP', `${Math.floor(s.mp)} / ${s.maxMp}`)}
        ${row('Gold', `${hero.gold} <small>g</small>`)}
        ${row('XP', `${s.xp} / ${next} <small>to level ${s.level + 1}</small><div class="bar xp"><div class="fill" style="--frac: ${xpFrac}"></div></div>`)}
        ${row('Attack', `${attackPower(hero)} <small>(${s.attack} + ${gearAttack(hero)} gear)</small>`)}
        ${row('Defense', `${defensePower(hero)} <small>(${s.defense} + ${gearDefense(hero)} gear)</small>`)}
        ${row('Magic', `${spellPower(hero)} <small>(${s.magic} + ${hero.spell.power} spell)</small>`)}
      </dl>`;
    document.getElementById('menu-gear')!.innerHTML = `
      <dl>
        ${GEAR_SLOTS.map((slot) => row(SLOT_LABELS[slot], describe(hero[slot]))).join('')}
        ${row('Spell', `${hero.spell.name} <small>${hero.spell.cost} MP</small>`)}
      </dl>
      <h3>Pack</h3>
      ${this.packHtml(hero)}`;
    this.keybinds.refresh();
    this.select(this.tab);
  }
}
