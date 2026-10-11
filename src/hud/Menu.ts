import { attackPower, defensePower, gearAttack, gearDefense, spellPower, xpToNext, type Hero } from '../systems/combat';
import { input } from '../core/input';
import type { Session } from '../net/session';
import type { TouchControls } from '../core/touch';
import { Inventory } from './Inventory';
import { Keybinds } from './Keybinds';
import { Multiplayer } from './Multiplayer';

// Pause menu (HTML overlay; markup in index.html). The game is frozen while it is open.
// Tabs switch with a tap/click or Left/Right; the close button and menu keys are handled by the scene.
// The Online tab (multiplayer connection) is Multiplayer.ts. Online play does not pause the world behind the menu.

const TABS = ['status', 'inventory', 'controls', 'online'];

export class Menu {
  open = false;
  private root = document.getElementById('menu')!;
  private tab = 0;
  private hero: Hero | null = null;
  /** The Inventory tab; the scene attaches its handlers while it runs. */
  readonly inventory = new Inventory(document.getElementById('menu-inventory')!, () => this.renderStatus());

  private keybinds: Keybinds;

  constructor(session: Session, touch: TouchControls) {
    new Multiplayer(session, () => this.close()); // owns the Online tab
    this.keybinds = new Keybinds(touch); // owns the key editor on the Controls tab
    for (const [i, name] of TABS.entries()) {
      this.tabButton(name).addEventListener('click', () => this.select(i));
    }
  }

  /** Open or close the menu. When opening, `tab` (e.g. 'online') picks the page to show. */
  toggle(hero: Hero, tab?: string) {
    this.open = !this.open;
    this.root.hidden = !this.open;
    if (!this.open) this.keybinds.cancel();
    const index = tab ? TABS.indexOf(tab) : -1;
    if (index >= 0) this.tab = index;
    if (this.open) this.render(hero);
  }

  /** The inventory key: open the menu on the Inventory tab, or close it if that is already showing. */
  toggleInventory(hero: Hero) {
    if (this.open && TABS[this.tab] === 'inventory') this.close();
    else if (this.open) this.select(TABS.indexOf('inventory'));
    else this.toggle(hero, 'inventory');
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
    if (TABS[i] === 'inventory' && this.hero) this.inventory.show(this.hero);
    for (const [j, name] of TABS.entries()) {
      this.tabButton(name).classList.toggle('active', i === j);
      document.getElementById(`menu-${name}`)!.hidden = i !== j;
    }
  }

  private renderStatus() {
    const hero = this.hero;
    if (!hero) return;
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
  }

  private render(hero: Hero) {
    this.hero = hero;
    this.renderStatus();
    this.inventory.show(hero);
    this.keybinds.refresh();
    this.select(this.tab);
  }
}
