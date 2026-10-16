const DIALOG_MAX_W = 600;
/** How long (s) a waiting aside stays worth saying once a conversation is over. */
const ASIDE_STALE_S = 30;
/** The most asides kept waiting behind a conversation (the oldest is dropped past this). */
const MAX_WAITING = 3;

/** What kind of thing is being said (see `Dialog`). */
export interface DialogOptions {
  /** The world stands still for every player until this is read (a quest conversation; see `systems/readingPause.ts`). */
  pauses?: boolean;
}

interface Talk {
  lines: string[];
  index: number;
  done: (() => void) | null;
  pauses: boolean;
}

interface Aside {
  who: string;
  text: string;
  /** How long it stays on screen (s). */
  seconds: number;
  /** When it was said, then when it leaves (arena clock, s). */
  at: number;
  until: number;
}

/**
 * The one dialog box (markup in index.html; tapping it presses the action key, see core/touch.ts). Two kinds of thing
 * are said in it, and they never overlap:
 *
 * - a **conversation** (an NPC, a quest brief, a sign): paged, the player stands still until it is read, and the next
 *   one waits in line behind it. It may `pauses` the world for everyone.
 * - an **aside** (the Dungeon Master's spoken words): one short line the player keeps playing through; it leaves by
 *   itself, or on ✕. A conversation takes the box from it, and it comes back afterwards; asides said meanwhile wait in
 *   order (the oldest of more than three is dropped, and any gone stale), and one at a time is on screen.
 */
export class Dialog {
  private box = document.getElementById('dialog')!;
  private text = document.getElementById('dialog-text')!;
  private who = document.getElementById('dialog-who')!;
  private talk: Talk | null = null;
  private queue: Talk[] = [];
  private aside: Aside | null = null; // on screen, when `talk` is null
  private waiting: Aside[] = [];

  constructor() {
    this.box.querySelector('.close')!.addEventListener('click', () => this.dismissAside());
    // A click on the game sends the DM's words away too: nobody hunts for a close button.
    window.addEventListener('pointerdown', (e) => {
      if (e.target instanceof HTMLCanvasElement) this.dismissAside();
    });
  }

  /** A conversation is open: the player stands still, and the action key reads on. */
  get active(): boolean {
    return this.talk !== null;
  }

  /** The conversation open now holds the world still for everyone. */
  get pausing(): boolean {
    return this.talk?.pauses ?? false;
  }

  /** An aside is on screen. */
  get speaking(): boolean {
    return this.aside !== null;
  }

  /** Show `lines` one at a time, after any conversation already open; `onDone` runs once the last one is dismissed (not when closed by force). */
  say(lines: string[], onDone?: () => void, opts: DialogOptions = {}) {
    const talk: Talk = { lines, index: 0, done: onDone ?? null, pauses: opts.pauses ?? false };
    if (this.talk) this.queue.push(talk);
    else this.open(talk);
  }

  /** Say `text` as `who` for `seconds` without stopping play; it waits for a conversation to end and is dropped if stale. */
  tell(who: string, text: string, seconds: number, now: number) {
    const aside: Aside = { who, text, seconds, at: now, until: now + seconds };
    if (this.talk)
      this.wait(aside); // a line said over another replaces it, as the DM moved on
    else this.showAside(aside, now);
  }

  /** Each frame (`now`: the arena clock, s): an aside leaves when its time is up; a waiting one is said once the way is clear. */
  update(now: number) {
    if (this.aside && now >= this.aside.until) this.clearAside();
    if (!this.talk && !this.aside) {
      const fresh = this.waiting.filter((a) => now - a.at < ASIDE_STALE_S);
      const next = fresh.shift();
      this.waiting = fresh;
      if (next) this.showAside(next, now); // said in full, as it was missed
    }
  }

  /** Show the next line, or close after the last one and open whoever is waiting. */
  advance() {
    const talk = this.talk;
    if (!talk) return;
    talk.index++;
    if (talk.index < talk.lines.length) {
      this.text.textContent = talk.lines[talk.index] ?? '';
      return;
    }
    this.talk = null;
    const next = this.queue.shift();
    if (next) this.open(next);
    else this.hide();
    talk.done?.();
  }

  /** Send the aside away (its ✕, Esc, a click on the game). */
  dismissAside() {
    this.clearAside();
  }

  /** Close everything (leaving the game). */
  close() {
    this.talk = null;
    this.queue = [];
    this.aside = null;
    this.waiting = [];
    this.hide();
  }

  private wait(aside: Aside) {
    this.waiting.push(aside);
    if (this.waiting.length > MAX_WAITING) this.waiting.shift();
  }

  private open(talk: Talk) {
    this.talk = talk;
    if (this.aside) {
      // A conversation takes the box: the aside it displaced comes back after it, ahead of any said since.
      this.waiting.unshift(this.aside);
      this.waiting.length = Math.min(this.waiting.length, MAX_WAITING);
      this.aside = null;
    }
    this.who.textContent = '';
    this.text.textContent = talk.lines[0] ?? '';
    this.box.classList.remove('aside');
    this.box.hidden = false;
  }

  private showAside(aside: Aside, now: number) {
    this.aside = { ...aside, until: now + aside.seconds };
    this.who.textContent = `${aside.who} speaks`;
    this.text.textContent = aside.text;
    this.box.classList.add('aside');
    this.box.hidden = false;
  }

  private clearAside() {
    if (!this.aside) return;
    this.aside = null;
    this.hide();
  }

  private hide() {
    this.box.hidden = true;
    this.box.classList.remove('aside');
  }

  /**
   * Size the box to the screen and keep it clear of the on-screen touch controls (`[pad, buttons]` rects,
   * empty when hidden). It grows upward with its text.
   */
  layout(screen: { width: number; height: number }, touchRects: readonly DOMRect[]) {
    const margin = 10;
    let left = margin;
    let right = screen.width - margin;
    let bottom = screen.height - 20;
    const [pad, buttons] = touchRects;
    if (pad && buttons) {
      // Fit between the D-pad and the buttons if there's room (landscape), otherwise sit above them.
      if (buttons.left - pad.right - 2 * margin >= 320) {
        left = pad.right + margin;
        right = buttons.left - margin;
      } else {
        bottom = Math.min(pad.top, buttons.top) - margin;
      }
    }
    const w = Math.min(DIALOG_MAX_W, right - left);
    Object.assign(this.box.style, {
      left: `${Math.round(left + (right - left - w) / 2)}px`,
      width: `${w}px`,
      bottom: `${Math.round(screen.height - bottom)}px`,
    });
  }
}
