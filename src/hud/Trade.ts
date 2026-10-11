import type { Hero, Item } from '../systems/combat';
import { itemCode, packCodes, packEntries } from '../systems/inventory';
import { playerName } from '../systems/looks';
import { MAX_OFFER_ITEMS, viewToWire, type TradeCommand, type TradeView } from '../systems/trade';
import { bonuses } from './itemText';

// Player-to-player trading (HTML overlays; markup in index.html, styles in src/ui.css). Three pieces share this file:
//  - the Trade tab of the pause menu: the other players, and a button to ask one (enabled only when they are close);
//  - a small prompt for a request (Accept / Deny for the player asked, Cancel for the asker);
//  - the trade window itself: your offer, theirs, your pack, and Accept / Cancel.
// The rules are systems/trade.ts, run by the host. This file only draws a `TradeView` and turns clicks into
// `TradeCommand`s; the scene feeds it every frame (`sync`) and carries the commands to wherever the rules run.

/** Another player, as the Trade tab lists them. */
export interface TradeContact {
  slot: number;
  /** Close enough to ask. */
  near: boolean;
  color: number;
}

export interface TradeFrame {
  hero: Hero;
  view: TradeView | null;
  /** Commands sent but not yet acknowledged by the host: the window keeps its own draft of the offer until then. */
  pending: boolean;
  contacts: TradeContact[];
}

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const $ = (id: string) => document.getElementById(id)!;

export class TradeUi {
  /** The trade window is showing (the scene freezes the hero, like at a shop counter). */
  open = false;
  /** Where commands go. Set by the scene. */
  send: (cmd: TradeCommand) => void = () => {};
  /** Called after a request is sent from the menu, so the menu can get out of the way. */
  onAsked: () => void = () => {};

  private window = $('trade');
  private prompt = $('trade-request');
  private toastBox = $('trade-toast');
  private tab = $('menu-trade');
  private goldIn = $('trade-gold') as HTMLInputElement;
  private acceptBtn = $('trade-accept') as HTMLButtonElement;

  private frame: TradeFrame | null = null;
  private draft: { items: Item[]; gold: number } = { items: [], gold: 0 };
  private wasOpen = false;
  private sig = '';
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.tab.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-with]');
      if (!button || button.disabled) return;
      this.send({ c: 'ask', with: Number(button.dataset.with) });
      this.onAsked();
    });
    this.prompt.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('button[data-reply]');
      if (!button) return;
      const reply = button.dataset.reply;
      this.send(reply === 'yes' ? { c: 'yes' } : reply === 'no' ? { c: 'no' } : { c: 'cancel' });
    });
    $('trade-pack').addEventListener('click', (e) => this.edit(e, 'add'));
    $('trade-mine-list').addEventListener('click', (e) => this.edit(e, 'remove'));
    this.goldIn.addEventListener('input', () => {
      const hero = this.frame?.hero;
      const typed = Math.floor(Number(this.goldIn.value));
      this.draft.gold = Math.max(0, Math.min(hero?.gold ?? 0, Number.isFinite(typed) ? typed : 0));
      this.offerChanged();
    });
    this.goldIn.addEventListener('change', () => (this.goldIn.value = String(this.draft.gold)));
    this.acceptBtn.addEventListener('click', () => {
      this.acceptBtn.blur(); // so the action key (Space) cannot press it again
      this.send({ c: 'ready', on: !this.frame?.view?.mine.ready });
    });
    $('trade-cancel').addEventListener('click', () => this.send({ c: 'cancel' }));
  }

  /** Flash what happened ("Trade complete", "Player 2 said no"). */
  toast(text: string, ok: boolean) {
    this.toastBox.textContent = text;
    this.toastBox.classList.toggle('error', !ok);
    this.toastBox.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastBox.hidden = true), 3500);
  }

  /** Called every frame while online; redraws only when something changed. */
  sync(frame: TradeFrame) {
    const { hero, view, pending } = frame;
    const open = view?.phase === 'open';
    if (open && (!this.wasOpen || !pending)) {
      // A new trade, or the host's word is current: start from what it says is on the table.
      this.draft = { items: [...view.mine.items], gold: view.mine.gold };
    }
    this.wasOpen = open;
    const sig = JSON.stringify([
      view && viewToWire(view),
      pending,
      hero.gold,
      packCodes(hero),
      frame.contacts,
      this.draft.items.map(itemCode),
      this.draft.gold,
    ]);
    if (sig === this.sig && this.open === open) return;
    this.sig = sig;
    this.frame = frame;
    this.open = open;
    this.window.hidden = !open;
    this.renderPrompt(view);
    this.renderTab(frame);
    if (open) this.renderWindow(frame, view);
  }

  /** Forget everything (leaving a co-op game). */
  reset() {
    this.frame = null;
    this.sig = '';
    this.open = false;
    this.wasOpen = false;
    this.window.hidden = true;
    this.prompt.hidden = true;
    this.toastBox.hidden = true;
  }

  // --- Drawing ---

  private renderPrompt(view: TradeView | null) {
    const show = view !== null && view.phase !== 'open';
    this.prompt.hidden = !show;
    if (!show) return;
    const who = `<b>${playerName(view.with)}</b>`;
    this.prompt.innerHTML =
      view.phase === 'incoming'
        ? `<p>${who} wants to trade.</p><div class="row"><button type="button" class="item-btn" data-reply="yes">Accept</button><button type="button" class="item-btn" data-reply="no">Deny</button></div>`
        : `<p>Waiting for ${who}…</p><div class="row"><button type="button" class="item-btn" data-reply="cancel">Cancel</button></div>`;
  }

  private renderTab({ view, contacts }: TradeFrame) {
    const rows = contacts
      .map((c) => {
        const free = !view && c.near;
        const state = view ? '' : c.near ? '' : '<span class="far">too far away</span>';
        return `<li><span class="swatch" style="--swatch: ${hex(c.color)}"></span><span class="name">${playerName(c.slot)}</span>${state}<button type="button" class="item-btn" data-with="${c.slot}"${free ? '' : ' disabled'}>Trade</button></li>`;
      })
      .join('');
    this.tab.innerHTML = `<h2>Trade <small>items and gold</small></h2>
      <p class="hint">Stand close to another player (about three steps) and ask. They can accept or deny. The trade ends if you walk apart.</p>
      <ul class="item-list trade-who">${rows || '<li class="empty">Nobody else is here.</li>'}</ul>
      ${view ? '<p class="hint">You already have a trade going.</p>' : ''}`;
  }

  private renderWindow({ hero }: TradeFrame, view: TradeView) {
    const them = playerName(view.with);
    $('trade-title').textContent = `Trading with ${them}`;
    const row = (item: Item, count: number, button: string) =>
      `<li><div class="info"><b>${item.name}${count > 1 ? ` ×${count}` : ''}</b> <small>${bonuses(item)}</small></div>${button}</li>`;
    const group = (items: readonly Item[]) => {
      const out: { item: Item; count: number }[] = [];
      for (const item of items) {
        const hit = out.find((e) => e.item === item);
        if (hit) hit.count++;
        else out.push({ item, count: 1 });
      }
      return out;
    };

    $('trade-mine-list').innerHTML =
      group(this.draft.items)
        .map(({ item, count }) =>
          row(item, count, `<button type="button" class="item-btn" data-item="${itemCode(item)}">Remove</button>`),
        )
        .join('') || '<li class="empty">Nothing yet.</li>';
    $('trade-theirs-list').innerHTML =
      group(view.theirs.items)
        .map(({ item, count }) => row(item, count, ''))
        .join('') || '<li class="empty">Nothing yet.</li>';

    // What is left in the pack to offer (the pack minus what is already on the table).
    const offered = group(this.draft.items);
    const free = packEntries(hero)
      .map(({ item, count }) => ({ item, count: count - (offered.find((o) => o.item === item)?.count ?? 0) }))
      .filter((e) => e.count > 0);
    const full = this.draft.items.length >= MAX_OFFER_ITEMS;
    $('trade-pack').innerHTML =
      free
        .map(({ item, count }) =>
          row(
            item,
            count,
            `<button type="button" class="item-btn" data-item="${itemCode(item)}"${full ? ' disabled' : ''}>Offer</button>`,
          ),
        )
        .join('') || '<li class="empty">Nothing left to offer.</li>';

    $('trade-their-gold').textContent = `${view.theirs.gold} gold`;
    $('trade-their-name').textContent = `${them} offers`;
    $('trade-their-state').textContent = view.theirs.ready ? '✓ accepted' : 'thinking…';
    $('trade-their-state').classList.toggle('yes', view.theirs.ready);
    $('trade-my-gold').textContent = `of ${hero.gold}`;
    if (document.activeElement !== this.goldIn) this.goldIn.value = String(this.draft.gold);
    this.goldIn.max = String(hero.gold);
    this.acceptBtn.textContent = view.mine.ready ? 'Waiting… (tap to undo)' : 'Accept';
    this.acceptBtn.classList.toggle('on', view.mine.ready);
  }

  // --- Clicks ---

  private edit(e: Event, how: 'add' | 'remove') {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-item]');
    if (!button || button.disabled) return;
    button.blur();
    const item = this.frame?.hero.pack.find((p) => itemCode(p) === Number(button.dataset.item));
    if (how === 'add' && item) {
      if (this.draft.items.length >= MAX_OFFER_ITEMS) return;
      this.draft.items.push(item);
    } else if (how === 'remove') {
      const i = this.draft.items.findIndex((p) => itemCode(p) === Number(button.dataset.item));
      if (i >= 0) this.draft.items.splice(i, 1);
    }
    this.offerChanged();
  }

  /** The offer was edited here: tell the rules, and redraw from the draft at once (the host's word replaces it later). */
  private offerChanged() {
    const { frame } = this;
    this.send({ c: 'offer', items: this.draft.items.map(itemCode), gold: this.draft.gold });
    this.sig = ''; // force a redraw on the next sync
    if (frame?.view?.phase === 'open') this.renderWindow(frame, frame.view);
  }
}
