// The Cast tab (`#menu-cast`) of a live world's Dungeon Master: bring a foe or a person to where they stand, or make
// a new person (a name, the look of someone from the packs, a few lines) and bring them. Everything it does goes
// through the world's log (scenes/overworld/Story.ts), so every page sees the same. Built with DOM nodes; the form is
// built once and kept, so a redraw never wipes what the DM is typing.

import type { Castable } from '../content/world';
import { MAX_NPC_LINE, MAX_NPC_LINES, MAX_NPC_NAME } from '../content/world';

export interface CastHandlers {
  /** Who may be brought in where the DM stands, or null (not a live world's land, or not the DM). */
  castable(): (Castable & { region: string; place: string; looks: { id: string; name: string }[] }) | null;
  cast(entity: string): void;
  make(name: string, look: string, lines: string[]): void;
  /** Why the last try did not work ('' when it did). */
  note(): string;
}

export class CastTab {
  private handlers: CastHandlers | null = null;
  private shown = '';
  private lists = document.createElement('div');
  private form = document.createElement('form');
  private name = document.createElement('input');
  private look = document.createElement('select');
  private lines = document.createElement('textarea');
  private message = document.createElement('p');

  constructor(private root: HTMLElement) {
    this.lists.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cast]');
      if (b?.dataset.cast) this.handlers?.cast(b.dataset.cast);
      this.shown = '';
    });
    this.name.maxLength = MAX_NPC_NAME;
    this.name.placeholder = 'Name';
    this.lines.rows = MAX_NPC_LINES;
    this.lines.placeholder = `What they say: up to ${MAX_NPC_LINES} lines`;
    this.lines.maxLength = MAX_NPC_LINES * (MAX_NPC_LINE + 1);
    const go = document.createElement('button');
    go.type = 'submit';
    go.className = 'mp-btn panel thin wood';
    go.textContent = 'Make them and bring them here';
    const title = document.createElement('h3');
    title.textContent = 'A new person';
    this.form.className = 'cast-form';
    this.form.append(title, this.name, this.look, this.lines, go);
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const lines = this.lines.value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      this.handlers?.make(this.name.value, this.look.value, lines);
      if (!this.handlers?.note()) {
        this.name.value = '';
        this.lines.value = '';
      }
      this.shown = '';
    });
    this.message.className = 'story-note';
  }

  attach(handlers: CastHandlers | null) {
    this.handlers = handlers;
    this.shown = '';
  }

  get available(): boolean {
    return !!this.handlers?.castable();
  }

  render() {
    const c = this.handlers?.castable() ?? null;
    const note = this.handlers?.note() ?? '';
    const key = JSON.stringify([c, note]);
    if (key === this.shown) return;
    this.shown = key;
    if (!c) {
      this.root.replaceChildren();
      return;
    }
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    const group = (title: string, list: { id: string; name: string; role?: string }[]) => {
      const box = el('div');
      box.append(el('h3', title));
      const row = el('div', '', 'dial-row');
      for (const x of list) {
        const b = el('button', x.role ? `${x.name} (${x.role})` : x.name, 'dial-btn');
        b.type = 'button';
        b.dataset.cast = x.id;
        row.append(b);
      }
      box.append(row);
      return box;
    };
    this.lists.replaceChildren(group('Foes', c.foes), group('People', c.people));
    const chosen = this.look.value;
    this.look.replaceChildren(
      ...c.looks.map((l) => {
        const o = el('option', `Looks like: ${l.name}`);
        o.value = l.id;
        return o;
      }),
    );
    if (c.looks.some((l) => l.id === chosen)) this.look.value = chosen;
    this.message.textContent = note;
    const title = el('h2', 'Bring them in');
    title.append(' ', el('small', `to where you stand in ${c.place}`));
    this.root.replaceChildren(title, this.lists, this.form, this.message);
  }
}
