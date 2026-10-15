import {
  attackPower,
  defensePower,
  gearAttack,
  gearDefense,
  gearMagic,
  gearMpRegen,
  gearRegen,
  speedFactor,
  spellPower,
  xpToNext,
  type Hero,
} from '../systems/combat';
import { enabled } from '../systems/capabilities';
import { tabStep } from '../core/controls';
import { SKILLS } from '../systems/skills';
import { arrows } from '../systems/spells';
import type { Session } from '../net/session';
import type { TouchControls } from '../core/touch';
import { Inventory } from './Inventory';
import { Magic } from './Magic';
import { questPage } from './QuestLog';
import { AimSetting } from './AimSetting';
import { Keybinds } from './Keybinds';
import { Multiplayer } from './Multiplayer';
import { Party } from './Party';
import { esc } from './html';

// Pause menu (HTML overlay; markup in index.html). The game is frozen while it is open.
// Tabs switch with a tap/click or Left/Right; the close button and menu keys are handled by the scene.
// The Online tab (multiplayer connection) is Multiplayer.ts. Online play does not pause the world behind the menu.

// 'trade' (hud/Trade.ts) shows only to a player in a co-op game; 'party' (hud/Party.ts) only to its Dungeon Master, who has
// no hero tabs (Status, Inventory, Magic, Quests, Trade) while they run the world.
// The Dungeon Master has no other tabs: what they steer comes as cards at the right moment and a bar that is always on
// screen (hud/DmCard.ts, hud/DmBar.ts), never a panel of settings.
const TABS = ['status', 'inventory', 'magic', 'quests', 'party', 'controls', 'online', 'trade', 'credits'];

export class Menu {
  open = false;
  private root = document.getElementById('menu')!;
  private tab = 0;
  private hero: Hero | null = null;
  /** The Inventory tab; the scene attaches its handlers while it runs. */
  readonly inventory = new Inventory(document.getElementById('menu-inventory')!, () => this.renderStatus());

  /** The Magic tab (the abilities learned from the trainer); the scene attaches its handlers while it runs. */
  readonly magic = new Magic(document.getElementById('menu-magic')!);

  /** The Dungeon Master's Party tab; the scene attaches its handlers while it runs. */
  readonly party = new Party(document.getElementById('menu-party')!);

  private keybinds: Keybinds;
  private aim: AimSetting;

  constructor(session: Session, touch: TouchControls) {
    new Multiplayer(session, () => this.close()); // owns the Online tab
    this.keybinds = new Keybinds(touch); // owns the key editor on the Controls tab
    this.aim = new AimSetting(touch); // owns the aiming choice on the Controls tab
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
    if (index >= 0 && !this.tabButton(TABS[index]!).hidden) this.tab = index;
    if (this.open) this.render(hero);
  }

  /** The inventory key: open the menu on the Inventory tab, or close it if that is already showing. */
  toggleInventory(hero: Hero) {
    if (this.tabButton('inventory').hidden) return; // the Dungeon Master carries nothing
    if (this.open && TABS[this.tab] === 'inventory') this.close();
    else if (this.open) this.select(TABS.indexOf('inventory'));
    else this.toggle(hero, 'inventory');
  }

  /** Draw the open menu again for `hero` (a co-op guest's gold and pack change when the host's answer arrives). */
  refresh(hero: Hero) {
    this.hero = hero;
    if (!this.open) return;
    this.renderStatus();
    this.renderQuests();
    if (TABS[this.tab] === 'inventory') this.inventory.show(hero);
    if (TABS[this.tab] === 'magic') this.magic.show(hero);
  }

  /** Close the menu (a no-op if it is already closed). */
  close() {
    this.open = false;
    this.root.hidden = true;
    this.keybinds.cancel();
  }

  /** Called each frame while open. */
  update() {
    const by = tabStep();
    if (by) this.step(by);
    this.renderQuests(); // online the world runs behind the menu, so a kill can move the log
    if (TABS[this.tab] === 'party') this.party.render();
  }

  /** The tab `by` places along from the current one, skipping tabs that are hidden. */
  private step(by: number) {
    let i = this.tab;
    do i = (i + by + TABS.length) % TABS.length;
    while (this.tabButton(TABS[i]!).hidden);
    this.select(i);
  }

  /**
   * Called every frame: the Trade tab is only there while online (and trading is a capability of the campaign), the
   * Online tab only with co-op, the Magic tab only with skills (systems/capabilities.ts). The Dungeon Master (`dm`, an
   * online host) has the Party tab instead of the hero's tabs. Leaves a tab that goes away under the player.
   */
  setOnline(online: boolean, dm = false) {
    const shown: Record<string, boolean> = {
      status: !dm,
      inventory: !dm,
      quests: !dm,
      magic: !dm && enabled('skills'),
      party: dm,
      trade: online && !dm && enabled('trading'),
      online: enabled('coop'),
    };
    let changed = false;
    for (const [tab, on] of Object.entries(shown)) {
      const button = this.tabButton(tab);
      if (button.hidden === !on) continue;
      button.hidden = !on;
      changed = true;
    }
    if (changed && this.tabButton(TABS[this.tab]!).hidden) this.select(this.firstShown());
  }

  /** The first tab that is not hidden (Status for a player, Party for the Dungeon Master). */
  private firstShown(): number {
    return Math.max(
      0,
      TABS.findIndex((name) => !this.tabButton(name).hidden),
    );
  }

  private tabButton(name: string) {
    return this.root.querySelector<HTMLElement>(`[data-tab="${name}"]`)!;
  }

  private select(i: number) {
    if (this.tabButton(TABS[i]!).hidden) i = this.firstShown();
    this.tab = i;
    if (TABS[i] === 'party') this.party.render();
    if (TABS[i] === 'inventory' && this.hero) this.inventory.show(this.hero);
    if (TABS[i] === 'magic' && this.hero) this.magic.show(this.hero);
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
    const skills = hero.skills
      .map((id) => `${arrows(SKILLS[id].keys)} ${SKILLS[id].name} <small>${SKILLS[id].cost} MP</small>`)
      .join('<br />');
    const xpFrac = Math.max(0, Math.min(1, s.xp / next));
    document.getElementById('menu-status')!.innerHTML = `
      <h2>${esc(hero.name)} <small>Level ${s.level}</small></h2>
      <dl>
        ${row('HP', `${Math.ceil(s.hp)} / ${s.maxHp}`)}
        ${row('MP', `${Math.floor(s.mp)} / ${s.maxMp}`)}
        ${row('Gold', `${hero.gold} <small>g</small>`)}
        ${row('XP', `${s.xp} / ${next} <small>to level ${s.level + 1}</small><div class="bar xp"><div class="fill" style="--frac: ${xpFrac}"></div></div>`)}
        ${row('Attack', `${attackPower(hero)} <small>(${s.attack} + ${gearAttack(hero)} gear)</small>`)}
        ${row('Defense', `${defensePower(hero)} <small>(${s.defense} + ${gearDefense(hero)} gear)</small>`)}
        ${skills ? row('Skills', skills) : ''}
        ${row('Magic', `${spellPower(hero)} <small>(${s.magic} + ${hero.weapon.focus?.power ?? 0} ${hero.weapon.focus?.kind ?? 'weapon'}${gearMagic(hero) ? ` + ${gearMagic(hero)} gear` : ''})</small>`)}
        ${speedFactor(hero) > 1 ? row('Speed', `+${Math.round((speedFactor(hero) - 1) * 100)}% <small>gear</small>`) : ''}
        ${gearRegen(hero) ? row('Mending', `${gearRegen(hero)} <small>HP/s gear</small>`) : ''}
        ${gearMpRegen(hero) ? row('Focus', `${gearMpRegen(hero)} <small>MP/s gear</small>`) : ''}
      </dl>`;
  }

  /** A picture URL for what a kill quest hunts (set by main.ts from the wardrobe); null until it is. */
  portrait: (mobKind: string) => string | null = () => null;
  private questShown = '';
  /** Draw the Quests tab, only when it would change (it is checked every frame while the menu is open). */
  private renderQuests() {
    const hero = this.hero;
    if (!hero) return;
    const html = questPage(hero, (kind) => this.portrait(kind));
    if (html === this.questShown) return;
    this.questShown = html;
    document.getElementById('menu-quests')!.innerHTML = html;
  }

  private render(hero: Hero) {
    this.hero = hero;
    this.renderStatus();
    this.renderQuests();
    this.inventory.show(hero);
    this.keybinds.refresh();
    this.aim.refresh();
    this.select(this.tab);
  }
}
