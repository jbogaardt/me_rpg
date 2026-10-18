import { hotbarPressed, itemKeys } from '../core/controls';
import { itemPopup } from '../core/itemPopup';
import type { Hero, Item } from '../systems/combat';
import { iconKind, type InvOp, type Result } from '../systems/inventory';
import { ITEMS } from '../systems/items';
import { HOTBAR_SHOWN, ITEM_COOLDOWN_S, quickOp, releaseOf, swipeOf, viewSlot } from '../systems/hotbar';
import { hotbar, saveHotbar } from './Hotbar';
import { playGame } from './gameSfx';
import { iconSvg } from './itemIcons';

// The quick-item button (HTML; markup `#item-btn` in index.html, styles in ui.css). Layer: core engine, per-player UI state.
// ONE round button replaces the old column of quick slots: a tap uses the selected consumable, a swipe left or right cycles
// to the previous or next one (and never uses), keys do the same on a keyboard (1-3 direct, Q/E cycle, F use, the wheel
// cycles). What a use means is `quickOp` (systems/hotbar.ts): an ordinary Inventory op done by name against the pack at the
// moment of the tap, through `apply` (the scene's `pack.localOp`), so a co-op guest asks the host like any menu action. The
// selection, the cycling and the pop-up setting are local: nothing here is sent.
//
// Feel: the face squashes the instant a finger lands (CSS `.pressed`), a tap fires on RELEASE (short and still), a swipe
// fires as soon as the finger passes the swipe distance. A refusal (nothing to use, or the engine's "You do not need that
// right now.": healing at full health) shakes the button with a dull thud and says nothing in words.
// Cheap: the DOM is repainted only when something changed (checked every REFRESH_S), the cooldown sweep and the pop-up
// move only while they show, and animations are one-off Web Animations, so a calm frame allocates nothing.

interface Point {
  x: number;
  y: number;
}

const REFRESH_S = 0.1;
const POP_S = 0.8;
const WHEEL_GAP_MS = 150;

const SHAKE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-5px)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-3px)' },
  { transform: 'translateX(0)' },
];
const NUDGE_L: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-9px)' },
  { transform: 'translateX(0)' },
];
const NUDGE_R: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(9px)' },
  { transform: 'translateX(0)' },
];
const POP_FRAMES: Keyframe[] = [
  { opacity: 0, transform: 'translateY(6px) scale(0.7)' },
  { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.15 },
  { opacity: 1, transform: 'translateY(-4px) scale(1)', offset: 0.7 },
  { opacity: 0, transform: 'translateY(-12px) scale(1)' },
];

/** The item a slot names even after the last one was drunk (so the greyed button still shows its picture). */
function itemNamed(name: string): Item | undefined {
  return Object.values(ITEMS).find((i) => i.name === name);
}

export class ItemButton {
  private root = document.getElementById('item-btn')!;
  private face = this.root.querySelector<HTMLElement>('.ib-face')!;
  private icon = this.root.querySelector<HTMLElement>('.ib-icon')!;
  private qty = this.root.querySelector<HTMLElement>('.ib-qty')!;
  private pips = this.root.querySelector<HTMLElement>('.ib-pips')!;
  private pop = document.getElementById('item-pop')!;
  private popIcon = this.pop.querySelector<HTMLElement>('.ip-icon')!;
  private popAnim: Animation | undefined;
  private gesture: { id: number; x: number; y: number; t: number; swiped: boolean } | null = null;
  private cooldown = 0;
  private lastSweep = -1;
  private free = true;
  private shown = '';
  private sinceRefresh = REFRESH_S; // so the first update paints
  private popLeft = 0;
  private lastWheel = 0;
  private readonly offered = new Set<string>();

  constructor(
    private heroOf: () => Hero,
    /** The scene's local Inventory action (does it, or asks the host as a guest). */
    private apply: (op: InvOp) => Result,
  ) {
    const root = this.root;
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (this.gesture) return; // a second finger on the button is ignored
      root.setPointerCapture(e.pointerId);
      this.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, swiped: false };
      root.classList.add('pressed'); // instant response, before anything is decided
    });
    root.addEventListener('pointermove', (e) => {
      const g = this.gesture;
      if (!g || e.pointerId !== g.id || g.swiped) return;
      const swipe = swipeOf(e.clientX - g.x, e.clientY - g.y);
      if (!swipe) return;
      g.swiped = true;
      this.cycle(swipe === 'next' ? 1 : -1);
    });
    root.addEventListener('pointerup', (e) => {
      const g = this.gesture;
      if (!g || e.pointerId !== g.id) return;
      this.gesture = null;
      root.classList.remove('pressed');
      if (!g.swiped && releaseOf(e.clientX - g.x, e.clientY - g.y, e.timeStamp - g.t) === 'tap')
        this.use(hotbar.selected);
    });
    for (const type of ['pointercancel', 'lostpointercapture'] as const)
      root.addEventListener(type, (e) => {
        if (this.gesture && e.pointerId === this.gesture.id) {
          this.gesture = null;
          root.classList.remove('pressed');
        }
      });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // The mouse wheel cycles while the pointer is over the game (a menu or dialog open means `free` is false).
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.free || !(e.target instanceof HTMLCanvasElement) || e.deltaY === 0) return;
        if (e.timeStamp - this.lastWheel < WHEEL_GAP_MS) return;
        this.lastWheel = e.timeStamp;
        this.cycle(e.deltaY > 0 ? 1 : -1);
      },
      { passive: true },
    );
    // The Controls tab's switch for the pop-up over the hero.
    const sw = document.querySelector<HTMLButtonElement>('#item-setting [data-item="popup"]');
    if (sw) {
      const paint = () => sw.setAttribute('aria-checked', String(itemPopup.on));
      sw.addEventListener('click', () => {
        itemPopup.set(!itemPopup.on);
        paint();
      });
      paint();
    }
  }

  /** Keys, once a frame (`free`: no menu, shop, trade, dialog or transition, and not the Dungeon Master). */
  poll(free: boolean) {
    this.free = free;
    if (!free) return;
    const slot = hotbarPressed();
    if (slot >= 0 && slot < HOTBAR_SHOWN) {
      hotbar.select(this.heroOf(), slot); // the number key uses the slot directly, and the button follows it
      this.use(slot);
    }
    const k = itemKeys();
    if (k.prev) this.cycle(-1);
    else if (k.next) this.cycle(1);
    if (k.use) this.use(hotbar.selected);
  }

  /** Repaint and tick. `visible` is false for the Dungeon Master, who carries nothing. `body`, `view`, `zoom` place the pop-up over the hero. */
  update(visible: boolean, dt: number, body: Point, view: Point, zoom: number) {
    this.root.hidden = !visible;
    if (!visible) {
      this.pop.hidden = true;
      this.popLeft = 0;
      return;
    }
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      const step = Math.round((this.cooldown / ITEM_COOLDOWN_S) * 60); // a 6 degree step: no restyle for a smaller change
      if (step !== this.lastSweep) {
        this.lastSweep = step;
        this.root.style.setProperty('--cd', `${step * 6}deg`);
        this.root.classList.toggle('cooling', step > 0);
      }
    }
    if (this.popLeft > 0) {
      this.popLeft -= dt;
      if (this.popLeft <= 0) {
        this.popLeft = 0;
        this.pop.hidden = true;
      } else {
        // over the hero's head: `body` is the feet in world px, `view` the world point at the screen's corner
        const x = Math.round((body.x - view.x) * zoom);
        const y = Math.round((body.y - view.y) * zoom - (56 * zoom + 36));
        this.pop.style.transform = `translate(${x}px, ${y}px)`;
      }
    }
    this.sinceRefresh += dt;
    if (this.sinceRefresh >= REFRESH_S) {
      this.sinceRefresh = 0;
      this.paint();
    }
  }

  /** Cycle to the previous or next usable item. */
  private cycle(dir: 1 | -1) {
    if (!this.free) return;
    const hero = this.heroOf();
    const moved = hotbar.step(hero, dir);
    this.face.animate(dir > 0 ? NUDGE_R : NUDGE_L, 140);
    if (moved) {
      playGame('glint');
      this.paint();
      this.popup(hotbar.get(hotbar.selected));
    }
  }

  private use(slot: number) {
    if (!this.free || this.cooldown > 0) return;
    const hero = this.heroOf();
    const name = hotbar.get(slot);
    const op = quickOp(hero, name);
    const item = viewSlot(hero, name).item;
    const result = op ? this.apply(op) : null;
    // No words: healing at full health ("You do not need that right now.") and an empty button both just shake and thud.
    if (!result?.ok) {
      this.deny();
      return;
    }
    this.cooldown = ITEM_COOLDOWN_S;
    this.lastSweep = -1;
    this.popup(name, item);
    this.sinceRefresh = REFRESH_S; // repaint now (the count dropped)
  }

  private deny() {
    this.face.animate(SHAKE, 220);
    playGame('deny');
  }

  private popup(name: string, item?: Item) {
    const it = item ?? itemNamed(name);
    if (!itemPopup.on || !it) return;
    this.popIcon.innerHTML = iconSvg(iconKind(it), it.art);
    this.pop.hidden = false;
    this.popLeft = POP_S;
    this.popAnim?.cancel();
    this.popAnim = this.popIcon.animate(POP_FRAMES, POP_S * 1000);
  }

  /** Offer a consumable new to the pack a free quick slot, once each, so the button is not dead for a new player. */
  private autoAssign(hero: Hero) {
    for (const item of hero.pack) {
      if (!item.use || this.offered.has(item.name)) continue;
      this.offered.add(item.name);
      if (hotbar.slotOf(item) >= 0) continue;
      const free = Array.from({ length: HOTBAR_SHOWN }, (_, i) => i).find((i) => !hotbar.get(i));
      if (free === undefined) continue;
      hotbar.assign(free, item);
      saveHotbar();
      if (!quickOp(hero, hotbar.get(hotbar.selected))) hotbar.selected = free;
    }
  }

  private paint() {
    const hero = this.heroOf();
    this.autoAssign(hero);
    const name = hotbar.get(hotbar.selected);
    const view = viewSlot(hero, name);
    const carried = quickOp(hero, name) !== null;
    const ring = hotbar.ring(hero);
    const dots = Array.from({ length: HOTBAR_SHOWN }, (_, i) => i).filter(
      (i) => ring.includes(i) || i === hotbar.selected,
    );
    const key = `${name}|${carried ? view.count : 0}|${dots.join('')}|${hotbar.selected}`;
    if (key === this.shown) return;
    this.shown = key;
    const item = view.item ?? itemNamed(name);
    this.icon.innerHTML = item ? iconSvg(iconKind(item), item.art) : '';
    this.root.classList.toggle('empty', !carried);
    this.root.title = name || 'Quick item';
    this.qty.hidden = !(carried && view.count >= 2);
    this.qty.textContent = String(view.count);
    this.pips.replaceChildren(
      ...(dots.length < 2
        ? []
        : dots.map((i) => {
            const pip = document.createElement('i');
            pip.className = i === hotbar.selected ? 'on' : '';
            return pip;
          })),
    );
  }
}
