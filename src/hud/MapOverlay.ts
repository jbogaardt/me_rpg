import type { Explored } from '../map/explored';
import { mapPercent, minimapPixels } from '../map/minimap';
import type { MapData } from '../map/types';
import { PLAYER_COLORS, playerName } from '../systems/looks';

// A semi-transparent map of the zone you are in that fills in as you explore it (only the cells seen are drawn, see
// map/explored.ts), with a pin for you and, in co-op, one for each friend (every player in their own colour, like their
// tag in the game), so players can find each other. The scene makes it `available` in any open-air zone and the M key
// (or the HUD map button on touch) toggles it. HTML rather than canvas, like the rest of the UI; markup in index.html,
// styles in src/ui.css. It never takes pointer input, so the game keeps running (and stays playable) behind it.

/** A player's position on the map: `slot` is their player number (it picks the colour). */
export interface Pin {
  slot: number;
  x: number;
  y: number;
}

/** Longest wait between repaints of an open map that is still filling in. */
const REPAINT_MS = 400;

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

  private data: MapData | undefined; // the zone currently shown
  private painted = -1; // the `explored.version` on the image (-1: none)
  private paintedAt = 0;

  /** Use this zone's terrain and what has been explored of it. Called every frame; it repaints only a map that is open. */
  setZone(data: MapData, explored: Explored) {
    if (data !== this.data) {
      this.data = data;
      this.placed = '';
      this.painted = -1;
      this.root.style.setProperty('--aspect', String(data.width / data.height));
    }
    const now = performance.now();
    // As you walk the picture grows, but not every frame: encoding the image is the costly part.
    if (this.open && (this.painted < 0 || (explored.version !== this.painted && now - this.paintedAt > REPAINT_MS))) {
      this.paint(data, explored, now);
    }
  }

  // Painted on a detached canvas and shown as an image, so the page keeps a single <canvas> (the game's).
  private paint(data: MapData, explored: Explored, now: number) {
    this.painted = explored.version;
    this.paintedAt = now;
    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    const pixels = minimapPixels(data, explored.cells) as ImageData['data'];
    canvas.getContext('2d')!.putImageData(new ImageData(pixels, data.width, data.height), 0, 0);
    this.root.querySelector('img')!.src = canvas.toDataURL();
  }

  /** Show the map button while the player is in an open-air zone; a room closes the map. */
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
    const data = this.data;
    if (!data) return;
    const mine = mapPercent(data, me.x, me.y);
    const theirs = others.map((p) => ({ slot: p.slot, ...mapPercent(data, p.x, p.y) }));
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
    this.painted = -1; // repainted by the next setZone, with whatever was explored since
    this.placed = ''; // pins are repositioned on the next update
    this.listed = '';
  }
}
