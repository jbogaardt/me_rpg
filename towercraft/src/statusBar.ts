// The status strip, the pay-day chip and the alert toast, with the minimap (cosmetic; layer: this game's own, nothing in the protocol).
// `Hud` is the one thing `main.ts` talks to: `reset` at the start of a match, `update` every frame (it throttles itself).
// The strip: the clock to `TIME_LIMIT` (amber in the last minute), each side's castle health as a plain bar in its seat colour (your
// side left, the others right), your units out against `UNIT_CAP`. The chip beside the resources: the pay per pay-day with a thin
// progress to the next. The toast: an off-screen attack on your castle or a building (`AlertWatch`), also pinged on the minimap;
// tap it to look there. The DOM is written only when a value changes. It is all read-only; the elements show only while
// `body.playing` (index.html), so a match that ends or is left hides them with no teardown.
import {
  AlertWatch,
  castleShare,
  clockLate,
  clockText,
  payDay,
  sides,
  timeLeft,
  unitsOut,
  UNIT_CAP,
  type Alert,
  type View,
} from './hudModel';
import { Minimap, type MinimapHost } from './minimap';

const $ = (id: string) => document.getElementById(id)!;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
/** How long (ms) a toast stays. */
const TOAST_MS = 5000;
const EVERY_MS = 100;

export class Hud {
  private readonly map: Minimap;
  private readonly watch = new AlertWatch();
  private nextAt = 0;
  private toastUntil = 0;
  private target: Alert['at'] | undefined;
  /** The last value written to each element, so the DOM is only touched on a change. */
  private shown: Record<string, string | number> = {};

  constructor(private readonly host: MinimapHost) {
    this.map = new Minimap(host);
    $('alert').addEventListener('click', () => {
      if (this.target) host.go(this.target[0], this.target[1]);
      this.hideToast();
    });
  }

  private set(key: string, value: string | number, write: () => void) {
    if (this.shown[key] === value) return;
    this.shown[key] = value;
    write();
  }

  /** A new match (or a page that came back into one). */
  reset() {
    const m = this.host.match();
    const you = this.host.you();
    this.shown = {};
    this.watch.reset(m);
    this.hideToast();
    const { mine, foes } = sides(m, you);
    const first = (seats: number[]) => seats.find((o) => !m.players[o]!.out) ?? seats[0] ?? you;
    $('st-me').style.setProperty('--c', hex(this.host.color(first(mine))));
    $('st-foe').style.setProperty('--c', hex(this.host.color(first(foes))));
    this.map.reset();
    this.nextAt = 0;
    this.update(performance.now(), true);
  }

  private hideToast() {
    $('alert').hidden = true;
    this.target = undefined;
    this.toastUntil = 0;
  }

  /** Call every frame while a match is on: the numbers change a few times a second, the minimap about five. */
  update(now = performance.now(), force = false) {
    this.map.update(now);
    if (this.toastUntil && now >= this.toastUntil) this.hideToast();
    if (!force && now < this.nextAt) return;
    this.nextAt = now + EVERY_MS;
    const m = this.host.match();
    const you = this.host.you();
    const { mine, foes } = sides(m, you);

    this.set('clock', timeLeft(m), () => {
      $('st-clock').textContent = clockText(timeLeft(m));
      $('st-clock').classList.toggle('late', clockLate(m));
    });
    const [me, foe] = [castleShare(m, mine), castleShare(m, foes)];
    this.set('me', Math.round(me * 100), () => {
      $('st-me').style.setProperty('--v', String(Math.round(me * 100) / 100));
      $('st-me').title = `Your side's castles: ${Math.round(me * 100)}%`;
    });
    this.set('foe', Math.round(foe * 100), () => {
      $('st-foe').style.setProperty('--v', String(Math.round(foe * 100) / 100));
      $('st-foe').title = `The other side's castles: ${Math.round(foe * 100)}%`;
    });
    const n = unitsOut(m, you);
    this.set('units', n, () => {
      $('st-units').textContent = `${n}/${UNIT_CAP}`;
      $('st-units').classList.toggle('full', n >= UNIT_CAP * 0.9);
    });
    const pay = payDay(m, you);
    this.set('pay', pay.total, () => {
      $('pay-n').textContent = `+${pay.total}`;
      $('pay').title = `Every pay day: ${pay.wood} wood and ${pay.stone} stone`;
    });
    this.set('payBar', Math.round(pay.progress * 40), () =>
      $('pay-bar').style.setProperty('--v', String(Math.round(pay.progress * 40) / 40)),
    );

    const view: View = this.host.view();
    for (const a of this.watch.collect(m, you, view)) this.announce(a, now);
  }

  private announce(a: Alert, now: number) {
    this.map.ping(a.at, a.kind === 'ally' ? 0xe8d23a : 0xff6a5c);
    const el = $('alert');
    el.textContent = a.text;
    el.hidden = false;
    this.target = a.at;
    this.toastUntil = now + TOAST_MS;
    el.classList.remove('in');
    void el.offsetWidth; // restart the fade-in
    el.classList.add('in');
  }
}
