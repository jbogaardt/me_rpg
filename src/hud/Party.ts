// The Party tab of the Dungeon Master's menu (`#menu-party`): the players in the game, where each is, how they fare and
// what their quest is, with a Go button that takes the DM to them. Only the DM (an online host) sees it. Built with DOM
// nodes and textContent, never innerHTML: names and quest titles are content, which may one day come from elsewhere.

/** One player as the DM's Party tab shows them. */
export interface PartyRow {
  slot: number;
  name: string;
  /** The player's ring colour (0xrrggbb). */
  color: number;
  level: number;
  hp: number;
  maxHp: number;
  /** The area they are in, by its name. */
  where: string;
  /** Their current quest's title, or '' with none. */
  quest: string;
  /** In the same zone as the DM. */
  here: boolean;
}

/** What the scene gives the tab while it runs: the rows to show, and how to take the DM to a player. */
export interface PartyHandlers {
  rows(): PartyRow[];
  go(slot: number): void;
}

export class Party {
  private handlers: PartyHandlers | null = null;
  private shown = '';

  constructor(private root: HTMLElement) {
    root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
      if (button) this.handlers?.go(Number(button.dataset.go));
    });
  }

  attach(handlers: PartyHandlers | null) {
    this.handlers = handlers;
    this.shown = '';
  }

  /** Draw the tab, only when what it shows changed (it is called every frame while open). */
  render() {
    const rows = this.handlers?.rows() ?? [];
    const key = JSON.stringify(rows);
    if (key === this.shown) return;
    this.shown = key;
    const title = document.createElement('h2');
    title.textContent = 'The Party';
    const small = document.createElement('small');
    small.textContent = 'you are the Dungeon Master';
    title.append(' ', small);
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Nobody has joined yet.';
      this.root.replaceChildren(title, empty);
      return;
    }
    const list = document.createElement('ul');
    list.className = 'mp-roster party';
    for (const r of rows) {
      const item = document.createElement('li');
      item.dataset.slot = String(r.slot);
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.setProperty('--swatch', `#${r.color.toString(16).padStart(6, '0')}`);
      const info = document.createElement('span');
      info.className = 'info';
      const name = document.createElement('b');
      name.textContent = `${r.name} `;
      const level = document.createElement('small');
      level.textContent = `Level ${r.level} · HP ${Math.ceil(r.hp)}/${r.maxHp}`;
      const where = document.createElement('small');
      where.className = 'where';
      where.textContent = `${r.where}${r.here ? ' (here)' : ''}${r.quest ? ` · ${r.quest}` : ''}`;
      info.append(name, level, document.createElement('br'), where);
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'mp-btn panel thin wood';
      go.dataset.go = String(r.slot);
      go.textContent = 'Go';
      item.append(swatch, info, go);
      list.append(item);
    }
    this.root.replaceChildren(title, list);
  }
}
