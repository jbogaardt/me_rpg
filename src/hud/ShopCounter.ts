import { input } from '../core/input';
import type { Hero, Item } from '../systems/combat';
import { compare, slotsFor, useFromPack, equipFromPack } from '../systems/inventory';
import { ITEMS, type ItemId } from '../systems/items';
import { buy, buyPrice, sell, sellPrice, type Shop as ShopDef } from '../systems/shops';
import { bonuses } from './itemText';

// A shopkeeper's counter (HTML overlay; markup in index.html, styles in src/ui.css). Two tabs: what the shop sells,
// and what the hero can sell it from the pack (a shop only buys its own trade). The rules are systems/shops.ts and the
// pack's (systems/inventory.ts); this only draws them. Like the menu, it is a modal: the scene freezes the hero while it
// is open (and, solo, the world).

const TABS = ['buy', 'sell'] as const;
type Tab = (typeof TABS)[number];

export class ShopCounter {
  open = false;
  private root = document.getElementById('shop')!;
  private list = document.getElementById('shop-list')!;
  private note = document.getElementById('shop-note')!;
  private shop: ShopDef | null = null;
  private hero: Hero | null = null;
  private tab: Tab = 'buy';
  /** Called when a trade or the pack changed what the hero wears, so the scene can redraw the hero. */
  onGearChange: () => void = () => {};

  constructor() {
    for (const name of TABS) this.tabButton(name).addEventListener('click', () => this.select(name));
    this.list.addEventListener('click', (e) => this.click(e));
  }

  /** Open `shop`'s counter for `hero`. */
  show(shop: ShopDef, hero: Hero) {
    this.shop = shop;
    this.hero = hero;
    this.open = true;
    this.root.hidden = false;
    document.getElementById('shop-title')!.textContent = shop.name;
    this.say('');
    this.select('buy');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.shop = this.hero = null;
  }

  /** Called each frame while open: Left/Right switch tabs, like the menu. */
  update() {
    if (input.wasPressed('ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD')) this.select(this.tab === 'buy' ? 'sell' : 'buy');
  }

  private tabButton(name: Tab) {
    return this.root.querySelector<HTMLElement>(`[data-tab="${name}"]`)!;
  }

  private select(tab: Tab) {
    this.tab = tab;
    for (const name of TABS) this.tabButton(name).classList.toggle('active', name === tab);
    this.render();
  }

  private say(text: string, error = false) {
    this.note.textContent = text;
    this.note.classList.toggle('error', error);
  }

  private click(e: Event) {
    const button = (e.target as HTMLElement).closest<HTMLElement>('button[data-act]');
    const { shop, hero } = this;
    if (!button || !shop || !hero) return;
    button.blur(); // so the action key (Space) cannot press it again
    const { act, id, pack } = button.dataset;
    const index = Number(pack);
    if (act === 'buy' && id) {
      const trade = buy(hero, shop, id as ItemId);
      this.say(trade.text, !trade.ok);
      if (trade.ok && trade.worn) this.onGearChange();
    } else if (act === 'sell') {
      const trade = sell(hero, shop, index);
      this.say(trade.text, !trade.ok);
    } else if (act === 'wear') {
      const result = equipFromPack(hero, index);
      this.say(result.ok ? 'Done' : result.reason, !result.ok);
      if (result.ok) this.onGearChange();
    } else if (act === 'use') {
      const used = useFromPack(hero, index);
      this.say(used.ok ? used.text : used.reason, !used.ok);
    }
    this.render();
  }

  private render() {
    const { shop, hero } = this;
    if (!shop || !hero) return;
    document.getElementById('shop-gold')!.textContent = `${hero.gold} gold`;
    this.list.innerHTML = this.tab === 'buy' ? this.buyRows(shop, hero) : this.sellRows(shop, hero);
  }

  /** How `item` compares with what the hero wears in its slot: "worn", or ▲ / ▼ by how much better or worse it is. */
  private versus(hero: Hero, item: Item): string {
    const slot = slotsFor(item)[0];
    if (!slot) return '';
    const worn = slot === 'weapon' ? hero.weapon : hero[slot];
    if (worn === item) return ' <em class="same">worn</em>';
    const d = compare(item, worn);
    const delta = d.attack + d.defense;
    return delta > 0 ? ` <em class="up">▲ ${delta}</em>` : delta < 0 ? ` <em class="down">▼ ${-delta}</em>` : '';
  }

  private buyRows(shop: ShopDef, hero: Hero): string {
    return shop.stock
      .map((id) => {
        const item: Item = ITEMS[id];
        const price = buyPrice(item);
        const afford = hero.gold >= price;
        return `<li${afford ? '' : ' class="poor"'}><div class="info"><b>${item.name}</b> <small>${bonuses(item)}</small>${this.versus(hero, item)}</div><span class="price">${price}g</span><button type="button" class="item-btn" data-act="buy" data-id="${id}"${afford ? '' : ' disabled'}>Buy</button></li>`;
      })
      .join('');
  }

  private sellRows(shop: ShopDef, hero: Hero): string {
    if (!hero.pack.length) return '<li class="empty">Your pack is empty.</li>';
    return hero.pack
      .map((item, i) => {
        const trade = shop.buys(item);
        const sellBtn = trade
          ? `<span class="price">${sellPrice(item)}g</span><button type="button" class="item-btn" data-act="sell" data-pack="${i}">Sell</button>`
          : '<span class="price">not my trade</span>';
        const other = item.use
          ? `<button type="button" class="item-btn" data-act="use" data-pack="${i}">Drink</button>`
          : item.slot
            ? `<button type="button" class="item-btn" data-act="wear" data-pack="${i}">Wear</button>`
            : '';
        return `<li${trade ? '' : ' class="poor"'}><div class="info"><b>${item.name}</b> <small>${bonuses(item)}</small></div>${sellBtn}${other}</li>`;
      })
      .join('');
  }
}
