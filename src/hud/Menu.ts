import { attackPower, defensePower, spellPower, xpToNext, type Hero } from '../systems/combat';
import { input } from '../core/input';
import type { Session } from '../net/session';
import { Multiplayer } from './Multiplayer';

// Pause menu (HTML overlay; markup in index.html). The game is frozen while it is open.
// Tabs switch with a tap/click or Left/Right; the close button and menu keys are handled by the scene.
// The Online tab (multiplayer connection) is Multiplayer.ts. Online play does not pause the world behind the menu.

const TABS = ['status', 'gear', 'controls', 'online'];

export class Menu {
  open = false;
  private root = document.getElementById('menu')!;
  private tab = 0;

  constructor(session: Session) {
    new Multiplayer(session); // owns the Online tab
    for (const [i, name] of TABS.entries()) {
      this.tabButton(name).addEventListener('click', () => this.select(i));
    }
  }

  /** Open or close the menu. When opening, `tab` (e.g. 'online') picks the page to show. */
  toggle(hero: Hero, tab?: string) {
    this.open = !this.open;
    this.root.hidden = !this.open;
    const index = tab ? TABS.indexOf(tab) : -1;
    if (index >= 0) this.tab = index;
    if (this.open) this.render(hero);
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
        ${row('XP', `${s.xp} / ${next} <small>to level ${s.level + 1}</small><div class="bar xp"><div class="fill" style="--frac: ${xpFrac}"></div></div>`)}
        ${row('Attack', `${attackPower(hero)} <small>(${s.attack} + ${hero.weapon.attack ?? 0} weapon)</small>`)}
        ${row('Defense', `${defensePower(hero)} <small>(${s.defense} + ${hero.armor.defense ?? 0} armor)</small>`)}
        ${row('Magic', `${spellPower(hero)} <small>(${s.magic} + ${hero.spell.power} spell)</small>`)}
      </dl>`;
    document.getElementById('menu-gear')!.innerHTML = `
      <dl>
        ${row('Weapon', `${hero.weapon.name} <small>+${hero.weapon.attack ?? 0} ATK</small>`)}
        ${row('Armor', `${hero.armor.name} <small>+${hero.armor.defense ?? 0} DEF</small>`)}
        ${row('Spell', `${hero.spell.name} <small>${hero.spell.cost} MP</small>`)}
      </dl>
      <h3>Pack</h3>
      <p class="empty">Empty.</p>`;
    this.select(this.tab);
  }
}
