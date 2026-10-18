import type { Explored } from '../map/explored';
import { mapPercent, minimapPixels } from '../map/minimap';
import { CELL, type MapData } from '../map/types';
import type { Guide } from '../systems/guide';
import { zoneName } from '../systems/places';
import { DM_COLOR, DM_NAME, DM_SLOT, PLAYER_COLORS, playerName } from '../systems/looks';

// A map of the zone (parchment in a stone frame, like the menu) you are in that fills in as you explore it (only the cells seen are drawn, see
// map/explored.ts), with a pin for you and, in co-op, one for each friend (every player in their own colour, like their
// tag in the game), so players can find each other. The map is core engine and always there: the M key (or the HUD map
// button, never hidden) toggles it for everyone (solo, host, guest, DM) in every zone. A room has no overview, so there it
// shows the room's name and a note instead (`setRoom`). Its aids (search circle, star) come from systems/aids.ts. HTML rather than canvas, like the rest of the UI; markup in index.html,
// styles in src/ui.css. It never takes pointer input, so the game keeps running (and stays playable) behind it.

/** A player's position on the map: `slot` is their player number (it picks the colour). */
export interface Pin {
  slot: number;
  x: number;
  y: number;
}

/** Longest wait between repaints of an open map that is still filling in. */
const REPAINT_MS = 400;

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const cssColor = (slot: number) => hex(PLAYER_COLORS[slot] ?? 0xffb13f);
/** Another player's pin: player 0 is the host, who online is always the Dungeon Master. */
const otherColor = (slot: number) => (slot === DM_SLOT ? hex(DM_COLOR) : cssColor(slot));
const otherName = (slot: number) => (slot === DM_SLOT ? DM_NAME : playerName(slot));

export class MapOverlay {
  open = false;
  private root = document.getElementById('map-overlay')!;
  private roomKey = ''; // the room shown instead of a map ('' outdoors)
  private stage = this.root.querySelector<HTMLElement>('.stage')!; // the picture's box: pins, places and the guide are placed in it by percent
  private me = this.root.querySelector<HTMLElement>('.pin.me')!;
  private legend = this.root.querySelector<HTMLElement>('.legend')!;
  private friends = new Map<number, HTMLElement>(); // one pin per other player, by player number
  private placed = ''; // last pin positions written, so the DOM is only touched when a pin moves
  private listed = ''; // who the legend currently lists

  private guideEl = document.createElement('div'); // the quest's search area (a circle with a ?) or place (a star)
  private guided = '';
  private title = this.root.querySelector<HTMLElement>('.zone-title')!;
  private labels = new Map<string, HTMLElement>(); // the place names on the map, by name
  private labelled = ''; // which places are listed, and for which zone

  private data: MapData | undefined; // the zone currently shown
  private painted = -1; // the `explored.version` on the image (-1: none)
  private paintedAt = 0;

  /** Use this zone's terrain and what has been explored of it. Called every frame; it repaints only a map that is open. */
  setZone(data: MapData, explored: Explored, zone = '') {
    this.nameThings(data, explored, zone);
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

  /**
   * Mark where the quest leads on the map: a dashed circle with a "?" over the area to search for something to be found, or
   * a star on a person or door. Nothing when there is no goal in this zone.
   */
  setGuide(guide: Guide | null) {
    const data = this.data;
    const key = guide && data ? `${Math.round(guide.x)},${Math.round(guide.y)},${guide.radius ?? 0},${data.width}` : '';
    if (key === this.guided) return;
    this.guided = key;
    if (!guide || !data) return this.guideEl.remove();
    const { left, top } = mapPercent(data, guide.x, guide.y);
    const el = this.guideEl;
    el.className = guide.radius === undefined ? 'guide place-star' : 'guide search';
    el.textContent = guide.radius === undefined ? '★' : '?';
    el.style.left = `${left}%`;
    el.style.top = `${top}%`;
    // The radius in cells is a share of the map's width, so the circle scales with the map.
    el.style.width = guide.radius === undefined ? '' : `${((guide.radius * 2) / CELL / data.width) * 100}%`;
    if (!el.parentElement) this.stage.append(el);
  }

  /** The zone's name as the heading, and each named place once the player has explored the ground it stands on. */
  private nameThings(data: MapData, explored: Explored, zone: string) {
    const known = data.places.filter((p) => explored.cells[p.row * data.width + p.col]);
    const key = `${zone}|${known.map((p) => p.name).join(',')}`;
    if (key === this.labelled) return;
    this.labelled = key;
    this.title.textContent = zoneName(zone);
    for (const label of this.labels.values()) label.remove();
    this.labels.clear();
    for (const p of known) {
      const { left, top } = mapPercent(data, (p.col + 0.5) * CELL, (p.row + 0.5) * CELL);
      const el = document.createElement('span');
      el.className = 'place';
      el.textContent = p.name;
      el.style.left = `${left}%`;
      el.style.top = `${top}%`;
      this.stage.append(el);
      this.labels.set(p.name, el);
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

  /**
   * The map is always there: the button is never hidden and M always opens it. A room (`room` is its name) has no
   * overview to draw, so the open map says so under the room's name instead. Called every frame; touches the DOM on a change only.
   */
  setRoom(room: string | null) {
    const key = room ?? '';
    if (key === this.roomKey) return;
    this.roomKey = key;
    this.root.classList.toggle('room', room !== null);
    this.labelled = ''; // the heading is rewritten for the zone shown next
    if (room !== null) this.title.textContent = zoneName(room);
  }

  /** Close the map if it is open (the scene leaving). */
  close() {
    this.show(false);
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
        pin.style.setProperty('--pin', otherColor(p.slot));
        this.stage.append(pin);
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
          dot.style.setProperty('--pin', i === 0 ? cssColor(slot) : otherColor(slot));
          return [dot, document.createTextNode(i === 0 ? 'You' : otherName(slot))];
        }),
      );
    }
  }

  private show(on: boolean) {
    this.open = on;
    this.root.hidden = !on;
    document.body.classList.toggle('map-open', on); // the quest chip steps aside for the picture
    this.painted = -1; // repainted by the next setZone, with whatever was explored since
    this.placed = ''; // pins are repositioned on the next update
    this.listed = '';
    if (!on) {
      // Nothing moves the pins while the map is shut: drop the friends' so a game that has ended leaves none behind.
      for (const pin of this.friends.values()) pin.remove();
      this.friends.clear();
    }
  }
}
