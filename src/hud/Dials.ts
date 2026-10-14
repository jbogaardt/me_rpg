// The Dials tab (`#menu-dials`) of whoever runs the world (the online DM, or a solo player in a live world): the weather
// where they stand, the time of day for everyone, and the capabilities they switch for everyone (scenes/overworld/
// DmDesk.ts). Built with DOM nodes; every button carries what it does in data attributes.

import { CAPABILITIES } from '../systems/capabilities';
import type { Dial } from '../systems/capabilities';
import type { Precip } from '../systems/weather';
import type { DialsView } from '../scenes/overworld/DmDesk';
import { zoneName } from '../systems/places';

export interface DialsHandlers {
  available(): boolean;
  view(): DialsView;
  weather(precip: Precip | null, wind: number): void;
  hour(hour: number | null): void;
  dial(id: Dial, on: boolean | null): void;
}

const HOURS: [string, number | null][] = [
  ['Dawn', 6],
  ['Noon', 12],
  ['Dusk', 19],
  ['Night', 23],
  ['Real time', null],
];
const WINDS: [string, number][] = [
  ['Still', 0],
  ['Breeze', 0.5],
  ['Gale', 1],
];

export class Dials {
  private handlers: DialsHandlers | null = null;
  private shown = '';

  constructor(private root: HTMLElement) {
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      const h = this.handlers;
      if (!b || !h) return;
      const d = b.dataset;
      if (d.precip !== undefined) h.weather(d.precip ? (d.precip as Precip) : null, h.view().windLevel);
      else if (d.wind !== undefined) h.weather(h.view().precip, Number(d.wind));
      else if (d.hour !== undefined) h.hour(d.hour === '' ? null : Number(d.hour));
      else if (d.dial) h.dial(d.dial as Dial, d.on === '' ? null : d.on === 'true');
      this.shown = ''; // draw again at once
    });
  }

  attach(handlers: DialsHandlers | null) {
    this.handlers = handlers;
    this.shown = '';
  }

  get available(): boolean {
    return this.handlers?.available() ?? false;
  }

  render() {
    const h = this.handlers;
    if (!h) return;
    const v = h.view();
    const key = JSON.stringify(v);
    if (key === this.shown) return;
    this.shown = key;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    const button = (text: string, data: Record<string, string>, active = false) => {
      const b = el('button', text, `dial-btn${active ? ' active' : ''}`);
      b.type = 'button';
      Object.assign(b.dataset, data);
      return b;
    };
    const row = (...children: HTMLElement[]) => {
      const r = el('div', '', 'dial-row');
      r.append(...children);
      return r;
    };
    const parts: HTMLElement[] = [el('h2', 'The World')];
    parts.push(el('h3', `Weather in ${zoneName(v.zone)}`));
    if (!v.precips.length && !v.zone) parts.push(el('p', 'No sky here.'));
    else {
      parts.push(
        row(
          button('Clear', { precip: '' }, v.precip === null),
          ...v.precips.map((p) => button(p.charAt(0).toUpperCase() + p.slice(1), { precip: p }, v.precip === p)),
        ),
      );
      parts.push(row(...WINDS.map(([name, w]) => button(name, { wind: String(w) }, Math.abs(v.windLevel - w) < 0.01))));
    }
    parts.push(el('h3', 'Time of day (everyone)'));
    parts.push(row(...HOURS.map(([name, hour]) => button(name, { hour: hour === null ? '' : String(hour) }))));
    parts.push(el('h3', 'For everyone'));
    const list = el('ul', '', 'dial-list');
    for (const d of v.dials) {
      const item = el('li');
      item.append(el('span', CAPABILITIES[d.id].name, 'dial-name'));
      item.append(
        button('On', { dial: d.id, on: 'true' }, d.set && d.on),
        button('Off', { dial: d.id, on: 'false' }, d.set && !d.on),
      );
      item.append(button('As written', { dial: d.id, on: '' }, !d.set));
      list.append(item);
    }
    parts.push(list);
    this.root.replaceChildren(...parts);
  }
}
