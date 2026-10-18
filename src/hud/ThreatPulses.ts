import type { Mob } from '../entities/Mob';
import type { View } from './edgeArrow';
import {
  keepClear,
  MAX_PULSES,
  newPulse,
  newThreat,
  pickPulses,
  pulseAlpha,
  pulseScale,
  type Pulse,
  type Threat,
} from './threatPulse';

// A chevron on the screen edge toward each off-screen shooter that is winding up (at most MAX_PULSES, the soonest to
// strike), in the kind's telegraph colour: it closes and brightens toward the strike, goes solid for the last moment and
// fades when the windup ends. Cosmetic, local, drawn from the mobs' own windup state on every page (solo, host, guest;
// nothing is sent). A few pooled DOM elements with inline styles, pointer-events none, no text. Maths: threatPulse.ts.

const FADE = 0.18; // seconds a pulse takes to fade once its windup is over (the bolt has left)

interface Slot {
  el: HTMLElement;
  id: number; // the mob it follows, -1 when free
  live: boolean; // still has a windup behind it (else it is fading)
  fade: number; // 1 -> 0 while fading
  x: number;
  y: number;
  angle: number;
  progress: number;
  color: number;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export class ThreatPulses {
  private root = document.createElement('div');
  private slots: Slot[] = [];
  private threats: Threat[] = [];
  private picked: Pulse[] = Array.from({ length: MAX_PULSES }, newPulse);
  private last = performance.now();
  private shown = false;

  constructor() {
    this.root.id = 'threat-pulses';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden;display:none';
    for (let i = 0; i < MAX_PULSES; i++) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;left:0;top:0;width:26px;height:26px;box-sizing:border-box;border-style:solid;' +
        'border-width:6px 6px 0 0;border-radius:2px;opacity:0;will-change:transform,opacity';
      this.root.appendChild(el);
      this.slots.push({ el, id: -1, live: false, fade: 0, x: 0, y: 0, angle: 0, progress: 0, color: -1 });
    }
    document.body.appendChild(this.root);
  }

  /** Each frame: `mobs` is the zone's; `on` false (a door transition, the Dungeon Master's view) hides everything. */
  update(on: boolean, view: View, screen: { width: number; height: number }, mobs: readonly Mob[]) {
    const { width: screenW, height: screenH } = screen;
    const touch = document.body.classList.contains('touch-ui');
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    let count = 0;
    if (on) {
      for (let i = 0; i < mobs.length; i++) {
        const t = (this.threats[count] ??= newThreat());
        if (mobs[i]!.shooterTell(t)) {
          t.id = i;
          count++;
        }
      }
    }
    const n = count > 0 ? pickPulses(this.picked, this.threats, count, view, screenW, screenH) : 0;
    for (const s of this.slots) s.live = false;
    // A pulse keeps the slot of the same mob; a new one takes a free (or the most faded) slot.
    for (let i = 0; i < n; i++) {
      const p = this.picked[i]!;
      const slot = this.slotFor(p.id);
      keepClear(p, screenW, screenH, touch);
      slot.live = true;
      slot.fade = 1;
      slot.x = p.x;
      slot.y = p.y;
      slot.angle = p.angle;
      slot.progress = p.progress;
      slot.color = p.color;
    }
    let any = false;
    const seconds = now / 1000;
    for (const s of this.slots) {
      if (!s.live && s.fade > 0) s.fade = Math.max(0, s.fade - dt / FADE);
      if (!s.live && s.fade === 0) s.id = -1;
      this.draw(s, seconds);
      if (s.fade > 0) any = true;
    }
    if (any !== this.shown) {
      this.shown = any;
      this.root.style.display = any ? 'block' : 'none';
    }
  }

  /** The slot already following mob `id`, else a free one, else the one fading longest (never one live this frame). */
  private slotFor(id: number): Slot {
    let pick: Slot | null = null;
    let rank = Infinity;
    for (const s of this.slots) {
      if (s.id === id) return s;
      const r = s.live ? Infinity : s.fade > 0 ? 1 - s.fade + 1 : 0; // free (0) < fading (1..2)
      if (r < rank) {
        rank = r;
        pick = s;
      }
    }
    const slot = pick ?? this.slots[0]!;
    slot.id = id;
    return slot;
  }

  private draw(s: Slot, seconds: number) {
    const st = s.el.style;
    if (s.fade <= 0) {
      st.opacity = '0';
      return;
    }
    if (s.color >= 0 && s.el.dataset.c !== String(s.color)) {
      s.el.dataset.c = String(s.color);
      st.borderColor = hex(s.color);
      st.filter = `drop-shadow(0 0 2px #000) drop-shadow(0 0 5px ${hex(s.color)})`;
    }
    const a = s.live ? pulseAlpha(s.progress, seconds) : pulseAlpha(s.progress, seconds) * s.fade;
    st.opacity = a.toFixed(2);
    const deg = ((s.angle * 180) / Math.PI).toFixed(1);
    // Centre on (x, y), turn toward the shooter, then the corner of the square (45 deg) is the chevron's tip.
    st.transform = `translate(${Math.round(s.x - 13)}px,${Math.round(s.y - 13)}px) rotate(${deg}deg) rotate(45deg) scale(${pulseScale(s.progress).toFixed(2)})`;
  }
}
