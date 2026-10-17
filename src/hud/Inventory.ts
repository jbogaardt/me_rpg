import { GEAR_SLOTS, type GearSlot, type Hero, type Item } from '../systems/combat';
import {
  BASE_PACK,
  compare,
  iconKind,
  itemTier,
  packSize,
  slotsFor,
  type InvOp,
  type Result,
} from '../systems/inventory';
import { enabled } from '../systems/capabilities';
import { bonusFor, bonusTexts, canSet } from '../systems/gems';
import { fusedOf } from '../systems/items';
import { iconSvg } from './itemIcons';
import { buffTexts, gemText } from './itemText';
import { combosHtml } from './itemText';
import { esc } from './html';
import { hotbar, saveHotbar } from './Hotbar';
import { HOTBAR_SLOTS } from '../systems/hotbar';

// The Inventory tab of the pause menu: what the hero wears (a slot each, including both hands, a tool and a bag),
// and the pack of carried items. Tap or click a slot to pick it, then use the buttons under the grids; a double
// click wears or removes it at once. Rules live in systems/inventory.ts; this file is only the screen.

const SLOT_LABELS: Record<GearSlot, string> = {
  weapon: 'Main hand',
  offhand: 'Off-hand',
  head: 'Head',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Feet',
  cape: 'Cloak',
  tool: 'Tool',
  bag: 'Bag',
  charm: 'Charm',
};

/** What the scene lets the screen do. Set while a scene is running. */
export interface InventoryHandlers {
  /** Do an action for the local player (the scene does it here, or asks the host in a co-op game). */
  apply(op: InvOp): Result;
}

type Selection = { from: 'pack'; index: number } | { from: 'worn'; slot: GearSlot } | null;

const stats = (item: Item) =>
  [
    item.attack ? `+${item.attack} ATK` : '',
    item.defense ? `+${item.defense} DEF` : '',
    ...buffTexts(item),
    item.capacity ? `+${item.capacity} pack slots` : '',
    item.ranged ? 'ranged' : '',
    item.focus ? item.focus.kind : '',
    item.use?.hp ? `+${item.use.hp} HP` : '',
    item.use?.mp ? `+${item.use.mp} MP` : '',
    gemText(item),
    item.value ? `worth ${item.value}g` : '',
  ]
    .filter(Boolean)
    .join(' · ');

export class Inventory {
  private handlers: InventoryHandlers | null = null;
  private hero: Hero | null = null;
  private selected: Selection = null;
  private message = '';

  constructor(
    private root: HTMLElement,
    /** Called after any change, so the Status tab can show the new numbers. */
    private changed: () => void,
  ) {
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('dblclick', (e) => this.onDouble(e));
  }

  attach(handlers: InventoryHandlers | null) {
    this.handlers = handlers;
  }

  show(hero: Hero) {
    this.hero = hero;
    this.render();
  }

  private render() {
    const hero = this.hero;
    if (!hero) return;
    if (!this.handlers) {
      this.root.innerHTML = `<p class="empty">The pack is not available right now.</p>`;
      return;
    }
    const size = packSize(hero);
    const sel = this.selected && this.itemAt(this.selected) ? this.selected : null;
    this.selected = sel;
    const slotButton = (item: Item | undefined, attrs: string, label: string, picked: boolean) =>
      `<button type="button" class="slot ${item ? `tier${itemTier(item)}` : 'empty'}${picked ? ' picked' : ''}" ${attrs}
        aria-label="${item ? esc(item.name) : `${label} (empty)`}" title="${item ? esc(item.name) : label}">
        ${item ? iconSvg(iconKind(item)) : ''}<span class="lbl">${label}</span></button>`;

    const worn = GEAR_SLOTS.map((slot) =>
      slotButton(hero[slot], `data-worn="${slot}"`, SLOT_LABELS[slot], sel?.from === 'worn' && sel.slot === slot),
    ).join('');
    const pack = Array.from({ length: size }, (_, i) =>
      slotButton(hero.pack[i], `data-pack="${i}"`, hero.pack[i] ? '' : '·', sel?.from === 'pack' && sel.index === i),
    ).join('');

    this.root.innerHTML = `
      <div class="inv">
        <div class="inv-col">
          <h3>Equipped</h3>
          <div class="inv-grid worn">${worn}</div>
        </div>
        <div class="inv-col">
          <h3>Pack <small>${hero.pack.length} / ${size}${size > BASE_PACK ? ` <span class="bonus">(+${size - BASE_PACK} from bag)</span>` : ''}</small></h3>
          <div class="inv-grid pack">${pack}</div>
        </div>
      </div>
      <div class="inv-detail">${this.detail(hero, sel)}</div>`;
  }

  private itemAt(sel: NonNullable<Selection>): Item | undefined {
    const hero = this.hero;
    if (!hero) return undefined;
    return sel.from === 'pack' ? hero.pack[sel.index] : hero[sel.slot];
  }

  private detail(hero: Hero, sel: Selection): string {
    const msg = this.message ? `<p class="inv-msg">${this.message}</p>` : '';
    const item = sel && this.itemAt(sel);
    if (!sel || !item) {
      return `<p class="empty">Pick an item to wear, take off or drop.</p>${msg}`;
    }
    let versus = '';
    if (sel.from === 'pack' && item.slot) {
      const slot = slotsFor(item)[0]!;
      const d = compare(item, hero[slot]);
      const bits = [
        d.attack ? `${d.attack > 0 ? '+' : ''}${d.attack} ATK` : '',
        d.defense ? `${d.defense > 0 ? '+' : ''}${d.defense} DEF` : '',
      ].filter(Boolean);
      if (hero[slot] && bits.length)
        versus = `<small class="versus">vs ${esc(hero[slot].name)}: ${bits.join(', ')}</small>`;
    }
    const buttons: string[] = [];
    const btn = (action: string, text: string) =>
      `<button type="button" class="mp-btn panel thin wood" data-action="${action}">${text}</button>`;
    if (sel.from === 'pack') {
      if (item.use) buttons.push(btn('use', 'Drink'));
      const slots = slotsFor(item);
      if (slots[0]) buttons.push(btn('equip', slots[0] === 'weapon' ? 'Equip main hand' : 'Equip'));
      if (slots.includes('offhand') && item.slot === 'weapon') buttons.push(btn('equip-off', 'Equip off-hand'));
      if (item.gem && enabled('forge')) buttons.push(...this.setButtons(hero, item, sel.index, btn));
    } else if (sel.slot !== 'weapon') {
      buttons.push(btn('unequip', 'Take off'));
    }
    for (let i = 0; i < HOTBAR_SLOTS; i++)
      buttons.push(btn(`hb:${i}`, hotbar.slotOf(item) === i ? `Quick slot ${i + 1} (clear)` : `Quick slot ${i + 1}`));
    buttons.push(btn('drop', 'Drop'));
    const where = sel.from === 'worn' ? SLOT_LABELS[sel.slot] : 'In pack';
    return `
      <div class="inv-item">
        <span class="icon tier${itemTier(item)}">${iconSvg(iconKind(item))}</span>
        <div><strong>${esc(item.name)}</strong> <small>${where}</small><br /><small>${stats(item) || 'No bonus'}</small> ${versus}${combosHtml(item)}</div>
      </div>
      <div class="inv-actions">${buttons.join('')}</div>${msg}`;
  }

  /** A button for each piece, worn or carried, the gem can be set in (what it adds is shown): the Set action of the forge. */
  private setButtons(hero: Hero, gem: Item, index: number, btn: (action: string, text: string) => string): string[] {
    const out: string[] = [];
    const add = (action: string, base: Item | undefined, where: string) => {
      if (!base || !canSet(gem, base) || !fusedOf(base, gem)) return;
      const adds = bonusTexts(bonusFor(gem, base)).join(', ');
      out.push(btn(action, `Set in ${esc(base.name)} (${where}${adds ? `: ${adds}` : ''})`));
    };
    for (const slot of GEAR_SLOTS) add(`set:slot:${slot}`, hero[slot], SLOT_LABELS[slot]);
    hero.pack.forEach((base, i) => i !== index && add(`set:pack:${i}`, base, 'pack'));
    return out;
  }

  private select(sel: Selection) {
    this.selected = sel;
    this.message = '';
    this.render();
  }

  private slotOf(target: EventTarget | null): Selection {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>('[data-pack],[data-worn]');
    if (!el) return null;
    if (el.dataset.pack !== undefined) return { from: 'pack', index: Number(el.dataset.pack) };
    return { from: 'worn', slot: el.dataset.worn as GearSlot };
  }

  private onClick(e: MouseEvent) {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action) return this.run(action);
    if (e.detail > 1) return; // the second click of a double click is handled below
    const sel = this.slotOf(e.target);
    if (!sel) return;
    const same = this.selected && JSON.stringify(this.selected) === JSON.stringify(sel);
    this.select(same || !this.itemAt(sel) ? null : sel);
  }

  /** Double click: wear it (from the pack) or take it off (from the body). */
  private onDouble(e: MouseEvent) {
    const sel = this.slotOf(e.target);
    if (!sel || !this.itemAt(sel)) return;
    this.selected = sel;
    this.run(sel.from === 'pack' ? 'equip' : 'unequip');
  }

  private run(action: string) {
    const sel = this.selected;
    const h = this.handlers;
    if (!this.hero || !sel || !h) return;
    let op: InvOp | null = null;
    const [verb, where, which] = action.split(':');
    if (verb === 'hb') {
      // A quick slot is per-player UI state (a name on the bar), so it never reaches the pack or the host.
      const item = this.itemAt(sel);
      const slot = Number(where);
      if (item) {
        if (hotbar.slotOf(item) === slot) hotbar.clear(slot);
        else hotbar.assign(slot, item);
        saveHotbar();
      }
      this.render();
      return;
    }
    if (verb === 'set' && sel.from === 'pack')
      op =
        where === 'pack'
          ? { t: 'fuse', gem: sel.index, into: { pack: Number(which) } }
          : { t: 'fuse', gem: sel.index, into: { slot: which as GearSlot } };
    else if (sel.from === 'pack') {
      if (action === 'equip') op = { t: 'equip', index: sel.index };
      else if (action === 'equip-off') op = { t: 'equip', index: sel.index, slot: 'offhand' };
      else if (action === 'use') op = { t: 'use', index: sel.index };
      else if (action === 'drop') op = { t: 'dropPack', index: sel.index };
    } else if (action === 'unequip') op = { t: 'unequip', slot: sel.slot };
    else if (action === 'drop') op = { t: 'dropWorn', slot: sel.slot };
    if (!op) return;
    const result = h.apply(op);
    if (result.ok) this.selected = null;
    this.message = result.ok ? '' : result.reason;
    this.render();
    this.changed();
  }
}
