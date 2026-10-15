// A card the Dungeon Master is offered at the right moment (`#dm-card`): a title, a line of what is going on and two or
// three buttons. It fades on its own when it has a timer (the game carries on), or waits to be answered (the story).
// It is only the view: scenes/overworld/DmPrompts.ts decides what to offer and does what is picked. Built with
// textContent only.

export interface CardOption {
  id: string;
  label: string;
  /** Lit: what is set now. */
  on?: boolean;
}

export interface CardSpec {
  /** What kind of card (the caller's own name for it). */
  kind: string;
  title: string;
  note?: string;
  options: CardOption[];
  /** Seconds before it goes away unanswered; null: it waits. */
  seconds: number | null;
}

export class DmCard {
  private root = document.getElementById('dm-card')!;
  private title = this.root.querySelector<HTMLElement>('.title')!;
  private note = this.root.querySelector<HTMLElement>('.note')!;
  private opts = this.root.querySelector<HTMLElement>('.opts')!;
  private timer = this.root.querySelector<HTMLElement>('.timer')!;
  private spec: CardSpec | null = null;
  private left = 0;
  private drawn = '';
  /** The DM tapped an option. */
  onPick: (kind: string, id: string) => void = () => {};
  /** The card went away without an answer (✕ or its time ran out). */
  onDismiss: (kind: string) => void = () => {};

  constructor() {
    this.opts.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]');
      if (b?.dataset.opt !== undefined && this.spec) this.onPick(this.spec.kind, b.dataset.opt);
    });
    this.root.querySelector('.close')!.addEventListener('click', () => this.dismiss());
    // A click or tap on the game itself means "not now": a card never has to be hunted for a button to close.
    window.addEventListener('pointerdown', (e) => {
      if (this.spec && e.target instanceof HTMLCanvasElement) this.dismiss();
    });
  }

  /** The buttons now on the card. */
  get options(): CardOption[] {
    return this.spec?.options ?? [];
  }

  get kind(): string | null {
    return this.spec?.kind ?? null;
  }

  /** The card as it reads now (null when none is up). */
  get view(): { kind: string; title: string; note: string; options: CardOption[] } | null {
    if (!this.spec) return null;
    const { kind, options } = this.spec;
    return { kind, title: this.title.textContent ?? '', note: this.note.textContent ?? '', options };
  }

  get open(): boolean {
    return this.spec !== null;
  }

  show(spec: CardSpec) {
    this.spec = spec;
    this.left = spec.seconds ?? 0;
    this.title.textContent = spec.title;
    this.note.textContent = spec.note ?? '';
    this.note.hidden = !spec.note;
    this.timer.hidden = spec.seconds === null;
    this.draw(spec.options);
    this.root.hidden = false;
  }

  /** Replace the card's line of explanation (who asked, say). */
  setNote(text: string) {
    this.note.textContent = text;
    this.note.hidden = !text;
  }

  /** Change the buttons (a tally moved) without restarting the card's time. */
  refresh(options: CardOption[]) {
    if (!this.spec) return;
    this.spec = { ...this.spec, options };
    this.draw(options); // only if something changed: a button redrawn under a finger would swallow the tap
  }

  hide() {
    this.spec = null;
    this.drawn = '';
    this.root.hidden = true;
  }

  /** Send the card away unanswered (✕, Esc, its time running out, a click on the game): the director gives the DM a breather. */
  dismiss() {
    const kind = this.spec?.kind;
    this.hide();
    if (kind) this.onDismiss(kind);
  }

  /** Each frame: count down a card that has a timer. */
  update(dt: number) {
    const spec = this.spec;
    if (!spec || spec.seconds === null) return;
    this.left -= dt;
    this.timer.style.setProperty('--frac', String(Math.max(0, this.left / spec.seconds)));
    if (this.left <= 0) this.dismiss();
  }

  private draw(options: CardOption[]) {
    const sig = JSON.stringify(options);
    if (sig === this.drawn) return;
    this.drawn = sig;
    this.opts.replaceChildren(
      ...options.map((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `mp-btn panel thin wood${o.on ? ' on' : ''}`;
        b.dataset.opt = o.id;
        b.textContent = o.label;
        return b;
      }),
    );
  }
}
