import { mapPercent, minimapPixels } from '../map/minimap';
import type { MapData } from '../map/types';

// A semi-transparent map of the whole zone with a pin for you and one for your co-op friend, so players can
// find each other. Online play only: the scene makes it `available` while connected and the M key (or the
// HUD map button on touch) toggles it. HTML rather than canvas, like the rest of the UI; markup in index.html,
// styles in src/ui.css. It never takes pointer input, so the game keeps running (and stays playable) behind it.

interface Point {
  x: number;
  y: number;
}

export class MapOverlay {
  open = false;
  private root = document.getElementById('map-overlay')!;
  private button = document.getElementById('map-btn')!;
  private me = this.root.querySelector<HTMLElement>('.pin.me')!;
  private friend = this.root.querySelector<HTMLElement>('.pin.friend')!;
  private placed = ''; // last pin positions written, so the DOM is only touched when a pin moves

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

  /** Move the pins; `friend` is null while the other player's position isn't known yet. */
  update(me: Point, friend: Point | null) {
    const a = mapPercent(this.data, me.x, me.y);
    const b = friend ? mapPercent(this.data, friend.x, friend.y) : null;
    const key = `${a.left.toFixed(1)},${a.top.toFixed(1)},${b ? `${b.left.toFixed(1)},${b.top.toFixed(1)}` : '-'}`;
    if (key === this.placed) return;
    this.placed = key;
    this.me.style.left = `${a.left}%`;
    this.me.style.top = `${a.top}%`;
    this.friend.hidden = !b;
    if (b) {
      this.friend.style.left = `${b.left}%`;
      this.friend.style.top = `${b.top}%`;
    }
  }

  private show(on: boolean) {
    this.open = on;
    this.root.hidden = !on;
    this.placed = ''; // pins are repositioned on the next update
  }
}
