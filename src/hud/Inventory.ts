import { GEAR_SLOTS, type GearSlot, type Hero, type Item } from '../systems/combat';
import {
  BASE_PACK,
  compare,
  dropFromPack,
  dropWorn,
  equipFromPack,
  iconKind,
  itemTier,
  packSize,
  slotsFor,
  unequip,
  type Result,
} from '../systems/inventory';
import { iconSvg } from './itemIcons';

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
};

/** What the scene lets the screen do. Set while a scene is running (guests and loading have none). */
export interface InventoryHandlers {
  /** Why the pack cannot be changed now (a co-op guest), or null. */
  locked(): string | null;
  /** Why items cannot be dropped now, or null. */
  noDrop(): string | null;
  /** The worn gear changed: redraw the hero. */
  gearChanged(): void;
  /** Put an item on the ground by the hero. */
  drop(item: Item): void;
}

type Selection = { from: 'pack'; index: number } | { from: 'worn'; slot: GearSlot } | null;

const stats = (item: Item) =>
  [
    item.attack ? `+${item.attack} ATK` : '',
    item.defense ? `+${item.defense} DEF` : '',
    item.capacity ? `+${item.capacity} pack slots` : '',
    item.ranged ? 'ranged' : '',
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
    const locked = this.handlers?.locked();
    if (!this.handlers || locked) {
      this.root.innerHTML = `<p class="empty">${locked ?? 'The pack is not available right now.'}</p>`;
      return;
    }
    const size = packSize(hero);
    const sel = this.selected && this.itemAt(this.selected) ? this.selected : null;
    this.selected = sel;
    const slotButton = (item: Item | undefined, attrs: string, label: string, picked: boolean) =>
      `<button type="button" class="slot ${item ? `tier${itemTier(item)}` : 'empty'}${picked ? ' picked' : ''}" ${attrs}
        aria-label="${item ? item.name : `${label} (empty)`}" title="${item ? item.name : label}">
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
      if (hero[slot] && bits.length) versus = `<small class="versus">vs ${hero[slot].name}: ${bits.join(', ')}</small>`;
    }
    const buttons: string[] = [];
    const btn = (action: string, text: string) =>
      `<button type="button" class="mp-btn panel thin wood" data-action="${action}">${text}</button>`;
    if (sel.from === 'pack') {
      const slots = slotsFor(item);
      if (slots[0]) buttons.push(btn('equip', slots[0] === 'weapon' ? 'Equip main hand' : 'Equip'));
      if (slots.includes('offhand') && item.slot === 'weapon') buttons.push(btn('equip-off', 'Equip off-hand'));
    } else if (sel.slot !== 'weapon') {
      buttons.push(btn('unequip', 'Take off'));
    }
    buttons.push(btn('drop', 'Drop'));
    const where = sel.from === 'worn' ? SLOT_LABELS[sel.slot] : 'In pack';
    return `
      <div class="inv-item">
        <span class="icon tier${itemTier(item)}">${iconSvg(iconKind(item))}</span>
        <div><strong>${item.name}</strong> <small>${where}</small><br /><small>${stats(item) || 'No bonus'}</small> ${versus}</div>
      </div>
      <div class="inv-actions">${buttons.join('')}</div>${msg}`;
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
    const hero = this.hero;
    const sel = this.selected;
    const h = this.handlers;
    if (!hero || !sel || !h) return;
    let result: Result = { ok: true };
    if (action === 'equip' || action === 'equip-off') {
      if (sel.from === 'pack') {
        result = equipFromPack(hero, sel.index, action === 'equip-off' ? 'offhand' : undefined);
        if (result.ok) this.selected = null;
      }
    } else if (action === 'unequip') {
      if (sel.from === 'worn') {
        result = unequip(hero, sel.slot);
        if (result.ok) this.selected = null;
      }
    } else if (action === 'drop') {
      const why = h.noDrop();
      if (why) result = { ok: false, reason: why };
      else if (sel.from === 'pack') {
        const item = dropFromPack(hero, sel.index);
        if (item) h.drop(item);
        this.selected = null;
      } else {
        const r = dropWorn(hero, sel.slot);
        result = r;
        if (r.ok && r.item) h.drop(r.item);
        if (r.ok) this.selected = null;
      }
    }
    this.message = result.ok ? '' : result.reason;
    if (result.ok) h.gearChanged();
    this.render();
    this.changed();
  }
}
