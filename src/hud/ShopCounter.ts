import { input } from '../core/input';
import type { Hero, Item } from '../systems/combat';
import { isWorn, packEntries, upgrade, useFromPack, wearFromPack } from '../systems/inventory';
import { ITEMS, type ItemId } from '../systems/items';
import { buy, buyPrice, sell, sellPrice, type Shop as ShopDef } from '../systems/shops';
import { bonuses } from './itemText';

// A shopkeeper's counter (HTML overlay; markup in index.html, styles in src/ui.css). Two tabs: what the shop sells,
// and what the hero can sell it from the pack (a shop only buys its own trade). The rules are systems/shops.ts;
// this only draws them. Like the menu, it is a modal: the scene freezes the hero while it is open (and, solo, the world).

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
    const entry = pack === undefined ? undefined : packEntries(hero)[Number(pack)];
    if (act === 'buy' && id) {
      const trade = buy(hero, shop, id as ItemId);
      this.say(trade.text, !trade.ok);
      if (trade.ok && trade.worn) this.onGearChange();
    } else if (entry && act === 'sell') {
      const trade = sell(hero, shop, entry.item);
      this.say(trade.text, !trade.ok);
    } else if (entry && act === 'wear') {
      if (wearFromPack(hero, entry.item)) {
        this.say(`Wearing ${entry.item.name}`);
        this.onGearChange();
      }
    } else if (entry && act === 'use') {
      const used = useFromPack(hero, entry.item);
      this.say(used ? used.text : 'You do not need that right now', !used);
    }
    this.render();
  }

  private render() {
    const { shop, hero } = this;
    if (!shop || !hero) return;
    document.getElementById('shop-gold')!.textContent = `${hero.gold} gold`;
    this.list.innerHTML = this.tab === 'buy' ? this.buyRows(shop, hero) : this.sellRows(shop, hero);
  }

  private buyRows(shop: ShopDef, hero: Hero): string {
    return shop.stock
      .map((id) => {
        const item: Item = ITEMS[id];
        const price = buyPrice(item);
        const delta = upgrade(hero, item);
        const versus = !item.slot
          ? ''
          : isWorn(hero, item)
            ? ' <em class="same">worn</em>'
            : delta > 0
              ? ` <em class="up">▲ ${delta}</em>`
              : delta < 0
                ? ` <em class="down">▼ ${-delta}</em>`
                : '';
        const afford = hero.gold >= price;
        return `<li${afford ? '' : ' class="poor"'}><div class="info"><b>${item.name}</b> <small>${bonuses(item)}</small>${versus}</div><span class="price">${price}g</span><button type="button" class="item-btn" data-act="buy" data-id="${id}"${afford ? '' : ' disabled'}>Buy</button></li>`;
      })
      .join('');
  }

  private sellRows(shop: ShopDef, hero: Hero): string {
    const entries = packEntries(hero);
    if (!entries.length) return '<li class="empty">Your pack is empty.</li>';
    return entries
      .map(({ item, count }, i) => {
        const trade = shop.buys(item);
        const sellBtn = trade
          ? `<span class="price">${sellPrice(item)}g</span><button type="button" class="item-btn" data-act="sell" data-pack="${i}">Sell</button>`
          : '<span class="price">not my trade</span>';
        const other = item.slot
          ? `<button type="button" class="item-btn" data-act="wear" data-pack="${i}">Wear</button>`
          : item.use
            ? `<button type="button" class="item-btn" data-act="use" data-pack="${i}">Drink</button>`
            : '';
        return `<li${trade ? '' : ' class="poor"'}><div class="info"><b>${item.name}${count > 1 ? ` ×${count}` : ''}</b> <small>${bonuses(item)}</small></div>${sellBtn}${other}</li>`;
      })
      .join('');
  }
}
