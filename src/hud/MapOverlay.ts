import { mapPercent, minimapPixels } from '../map/minimap';
import type { MapData } from '../map/types';
import { PLAYER_COLORS, playerName } from '../systems/looks';

// A semi-transparent map of the whole zone with a pin for you and one for each co-op friend (every player in their
// own colour, like their tag in the game), so players can find each other. Online play only: the scene makes it `available` while connected and the M key (or the
// HUD map button on touch) toggles it. HTML rather than canvas, like the rest of the UI; markup in index.html,
// styles in src/ui.css. It never takes pointer input, so the game keeps running (and stays playable) behind it.

/** A player's position on the map: `slot` is their player number (it picks the colour). */
export interface Pin {
  slot: number;
  x: number;
  y: number;
}

const cssColor = (slot: number) => `#${(PLAYER_COLORS[slot] ?? 0xffb13f).toString(16).padStart(6, '0')}`;

export class MapOverlay {
  open = false;
  private root = document.getElementById('map-overlay')!;
  private button = document.getElementById('map-btn')!;
  private me = this.root.querySelector<HTMLElement>('.pin.me')!;
  private legend = this.root.querySelector<HTMLElement>('.legend')!;
  private friends = new Map<number, HTMLElement>(); // one pin per other player, by player number
  private placed = ''; // last pin positions written, so the DOM is only touched when a pin moves
  private listed = ''; // who the legend currently lists

  constructor(private data: MapData) {
    // Painted once on a detached canvas and shown as an image, so the page keeps a single <canvas> (the game's).
    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    canvas
      .getContext('2d')!
      .putImageData(new ImageData(minimapPixels(data) as ImageData['data'], data.width, data.height), 0, 0);
    this.root.querySelector('img')!.src = canvas.toDataURL();
    this.root.style.setProperty('--aspect', String(data.width / data.height));
  }

  /** Show the map button while the player is in a co-op game; leaving one closes the map. */
  setAvailable(on: boolean) {
    if (this.button.hidden !== on) return; // called every frame: only touch the DOM on a change
    this.button.hidden = !on;
    if (!on) this.show(false);
  }

  toggle() {
    this.show(!this.open);
  }

  /** Move the pins: yours, and one for each other player whose position is known. */
  update(me: Pin, others: Pin[]) {
    const mine = mapPercent(this.data, me.x, me.y);
    const theirs = others.map((p) => ({ slot: p.slot, ...mapPercent(this.data, p.x, p.y) }));
    const key = [mine, ...theirs].map((p) => `${p.left.toFixed(1)},${p.top.toFixed(1)}`).join(';') + `|${me.slot}`;
    const who = [me.slot, ...others.map((p) => p.slot)].join(',');
    if (key === this.placed && who === this.listed) return;
    this.placed = key;

    this.me.style.setProperty('--pin', cssColor(me.slot));
    this.me.style.left = `${mine.left}%`;
    this.me.style.top = `${mine.top}%`;

    // Pins for players who joined appear, and those who left go.
    for (const [slot, pin] of this.friends) {
      if (!theirs.some((p) => p.slot === slot)) {
        pin.remove();
        this.friends.delete(slot);
      }
    }
    for (const p of theirs) {
      let pin = this.friends.get(p.slot);
      if (!pin) {
        pin = document.createElement('span');
        pin.className = 'pin friend';
        pin.dataset.slot = String(p.slot);
        pin.style.setProperty('--pin', cssColor(p.slot));
        this.root.insertBefore(pin, this.legend);
        this.friends.set(p.slot, pin);
      }
      pin.style.left = `${p.left}%`;
      pin.style.top = `${p.top}%`;
    }

    if (who !== this.listed) {
      this.listed = who;
      this.legend.replaceChildren(
        ...[me.slot, ...others.map((p) => p.slot)].flatMap((slot, i) => {
          const dot = document.createElement('i');
          dot.style.setProperty('--pin', cssColor(slot));
          return [dot, document.createTextNode(i === 0 ? 'You' : playerName(slot))];
        }),
      );
    }
  }

  private show(on: boolean) {
    this.open = on;
    this.root.hidden = !on;
    this.placed = ''; // pins are repositioned on the next update
    this.listed = '';
  }
}
