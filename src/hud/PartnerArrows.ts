import { PLAYER_COLORS, DM_COLOR, DM_NAME, DM_SLOT, playerName } from '../systems/looks';
import { zoneName } from '../systems/places';
import { distanceLabel, edgeArrow, type View } from './edgeArrow';

// Edge-of-screen arrows toward partners who are in this zone but out of view, and a chip for partners in another zone
// (the zone's name when this peer knows it: the host does, a guest is only told they are `away`). DOM, never takes input.

/** A partner as the arrows see them: `here` is false in another zone or while the host has not placed them; `zone` is '' when unknown. */
export interface Partner {
  slot: number;
  x: number;
  y: number;
  here: boolean;
  zone: string;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const colorOf = (slot: number) => hex(slot === DM_SLOT ? DM_COLOR : (PLAYER_COLORS[slot] ?? 0xffb13f));
const nameOf = (slot: number) => (slot === DM_SLOT ? DM_NAME : playerName(slot));
const TILE = 32;

export class PartnerArrows {
  private root = document.createElement('div');
  private arrows = new Map<number, HTMLElement>();
  private chips = new Map<number, HTMLElement>();

  constructor() {
    this.root.id = 'partner-arrows';
    this.root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.root);
  }

  /** Each frame: `partners` are the other players; `on` false hides everything. */
  update(on: boolean, view: View, screenW: number, screenH: number, partners: Partner[]) {
    const seenArrow = new Set<number>();
    const seenChip = new Set<number>();
    if (on) {
      for (const p of partners) {
        if (!p.here) {
          if (p.zone === '' && p.x === 0 && p.y === 0) continue; // not placed yet
          seenChip.add(p.slot);
          this.chip(p);
          continue;
        }
        const a = edgeArrow(view, screenW, screenH, p.x, p.y);
        if (!a) continue;
        seenArrow.add(p.slot);
        let el = this.arrows.get(p.slot);
        if (!el) {
          el = document.createElement('div');
          el.className = 'partner-arrow';
          el.append(document.createElement('i'), document.createElement('span'));
          el.style.setProperty('--c', colorOf(p.slot));
          this.root.appendChild(el);
          this.arrows.set(p.slot, el);
        }
        el.style.left = `${a.x}px`;
        el.style.top = `${a.y}px`;
        el.querySelector('i')!.style.transform = `rotate(${a.angle}rad)`;
        el.querySelector('span')!.textContent = `${nameOf(p.slot)} ${distanceLabel(a.dist, TILE)}`;
      }
    }
    this.prune(this.arrows, seenArrow);
    this.prune(this.chips, seenChip);
  }

  private chip(p: Partner) {
    let el = this.chips.get(p.slot);
    if (!el) {
      el = document.createElement('div');
      el.className = 'partner-chip';
      el.style.setProperty('--c', colorOf(p.slot));
      this.root.appendChild(el);
      this.chips.set(p.slot, el);
    }
    el.textContent = `${nameOf(p.slot)} is ${p.zone ? `in ${zoneName(p.zone)}` : 'in another zone'}`;
  }

  private prune(map: Map<number, HTMLElement>, keep: Set<number>) {
    for (const [slot, el] of map) {
      if (keep.has(slot)) continue;
      el.remove();
      map.delete(slot);
    }
  }
}
