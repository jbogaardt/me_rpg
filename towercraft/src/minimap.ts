// The minimap: a small 2D canvas of the whole field (cosmetic, not Pixi; layer: this game's own, nothing in the protocol).
// It draws the roads, the buildings and units of the player's side, the foes the side can see (the same `isSeen` / `isCastleSeen` the
// field is drawn with, so it never shows a hidden enemy), the part of the field on screen, and pings where an alert came from.
// Tap or drag on it moves the camera; its events stop here, so they never reach the field (no pan, no box). Redrawn about 5 times a
// second (faster while a ping plays), and only while the match shows and the map is not folded away.
import { allied, isCastleSeen, isSeen, sightsFor, unitPos, visionOf, type Match, type Owner } from './sim/sim';
import { miniToCell, type View } from './hudModel';

export interface MinimapHost {
  match: () => Match;
  you: () => Owner;
  /** The colour (0xRRGGBB) of a seat's castle, towers and units. */
  color: (o: Owner) => number;
  /** The part of the field on screen (cells). */
  view: () => View;
  /** Put the middle of the screen on a point of the field (cells). */
  go: (cx: number, cy: number) => void;
}

/** The picture's long edge in canvas pixels (CSS scales it to the corner it sits in). */
const LONG = 240;
const PING_SECONDS = 1.8;
const KEY = 'towercraft:minimap';

const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`;

export class Minimap {
  private readonly root = document.getElementById('minimap')!;
  private readonly canvas = document.getElementById('mm-canvas') as HTMLCanvasElement;
  private readonly toggle = document.getElementById('mm-toggle') as HTMLButtonElement;
  private readonly ctx = this.canvas.getContext('2d')!;
  private pings: { x: number; y: number; at: number; color: number }[] = [];
  private drawnAt = 0;
  private drag = false;
  private folded = false;

  constructor(private readonly host: MinimapHost) {
    try {
      this.folded = localStorage.getItem(KEY) === 'folded';
    } catch {
      /* no storage: open */
    }
    this.fold(this.folded);
    this.toggle.addEventListener('click', () => this.fold(!this.folded));
    const stop = (e: Event) => e.stopPropagation();
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'click', 'dblclick'])
      this.root.addEventListener(type, stop);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    const aim = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const [cx, cy] = miniToCell(this.host.match(), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      this.host.go(cx, cy);
      this.draw(performance.now());
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.drag = true;
      this.canvas.setPointerCapture(e.pointerId);
      aim(e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.drag) aim(e);
    });
    const end = () => (this.drag = false);
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  private fold(on: boolean) {
    this.folded = on;
    this.root.classList.toggle('folded', on);
    this.toggle.textContent = on ? 'Map' : '–';
    this.toggle.setAttribute('aria-label', on ? 'Show the map' : 'Hide the map');
    try {
      localStorage.setItem(KEY, on ? 'folded' : 'open');
    } catch {
      /* no storage: not remembered */
    }
  }

  /** A new match: size the picture to its map and forget the pings. */
  reset() {
    const { cols, rows } = this.host.match().board;
    const k = LONG / Math.max(cols, rows);
    this.canvas.width = Math.round(cols * k);
    this.canvas.height = Math.round(rows * k);
    this.canvas.style.aspectRatio = `${cols} / ${rows}`;
    this.pings = [];
    this.drag = false;
    this.drawnAt = 0;
    this.draw(performance.now());
  }

  /** A ring that fades where something happened (cells). */
  ping(at: readonly [number, number], color = 0xff6a5c) {
    this.pings.push({ x: at[0], y: at[1], at: performance.now(), color });
  }

  /** Redraw if it is time (about 5 times a second, faster while a ping plays). */
  update(now: number) {
    if (this.folded) return;
    this.pings = this.pings.filter((p) => now - p.at < PING_SECONDS * 1000);
    if (now - this.drawnAt >= (this.pings.length ? 60 : 200)) this.draw(now);
  }

  private draw(now: number) {
    if (this.folded) return;
    this.drawnAt = now;
    const m = this.host.match();
    const you = this.host.you();
    const { ctx } = this;
    const { cols } = m.board;
    const k = this.canvas.width / cols;
    const [W, H] = [this.canvas.width, this.canvas.height];
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(14, 19, 15, 0.62)';
    ctx.fillRect(0, 0, W, H);

    const vision = visionOf(m);
    // What the side sees, a little lighter than what it does not.
    ctx.fillStyle = 'rgba(200, 225, 170, 0.14)';
    for (const s of sightsFor(m, you, vision)) {
      ctx.beginPath();
      ctx.arc(s.x * k, s.y * k, s.r * k, 0, Math.PI * 2);
      ctx.fill();
    }
    // The roads, one stroke for each way along them.
    ctx.strokeStyle = 'rgba(226, 204, 152, 0.55)';
    ctx.lineWidth = Math.max(2, k * 1.4);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const lane of m.board.lanes) {
      if (lane.from > lane.to) continue; // the other way along the same road
      ctx.beginPath();
      lane.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
      ctx.stroke();
    }
    // Castles: yours and your side's always, a foe's where it is seen (else only a faint ring at its camp).
    const half = Math.max(5, k * 2.4);
    m.players.forEach((p, o) => {
      const [x, y] = m.board.castles[o]!;
      const mine = allied(m, o, you);
      if (p.out) {
        ctx.strokeStyle = 'rgba(160, 160, 160, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x * k - half * 0.7, y * k - half * 0.7, half * 1.4, half * 1.4);
      } else if (mine || isCastleSeen(m, you, o, vision)) {
        ctx.fillStyle = css(this.host.color(o));
        ctx.fillRect(x * k - half, y * k - half, half * 2, half * 2);
        ctx.strokeStyle = o === you ? '#fff' : 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = o === you ? 2 : 1.2;
        ctx.strokeRect(x * k - half, y * k - half, half * 2, half * 2);
      } else {
        ctx.strokeStyle = 'rgba(224, 119, 123, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x * k, y * k, half, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    // Buildings and units, each in its seat's colour; a foe's only where the field shows it.
    const b = Math.max(3, k * 1.3);
    for (const t of m.towers) {
      if (t.hp <= 0 || !isSeen(m, you, t, vision)) continue;
      ctx.fillStyle = css(this.host.color(t.owner));
      ctx.fillRect((t.col + 0.5) * k - b, (t.row + 0.5) * k - b, b * 2, b * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect((t.col + 0.5) * k - b, (t.row + 0.5) * k - b, b * 2, b * 2);
    }
    const d = Math.max(1.8, k * 0.8);
    for (const u of m.units) {
      if (u.hp <= 0 || u.spent || u.entered || !isSeen(m, you, u, vision)) continue;
      const [x, y] = unitPos(u, m.board);
      ctx.fillStyle = css(this.host.color(u.owner));
      ctx.beginPath();
      ctx.arc(x * k, y * k, d, 0, Math.PI * 2);
      ctx.fill();
    }
    // Pings: a ring that grows and fades, twice.
    for (const p of this.pings) {
      const age = (now - p.at) / 1000 / PING_SECONDS;
      for (const lag of [0, 0.3]) {
        const a = age - lag;
        if (a < 0 || a > 1) continue;
        ctx.strokeStyle = css(p.color, (1 - a) * 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x * k, p.y * k, half + a * k * 9, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // The part of the field on screen.
    const v = this.host.view();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect((v.cx - v.halfW) * k, (v.cy - v.halfH) * k, v.halfW * 2 * k, v.halfH * 2 * k);
  }
}
