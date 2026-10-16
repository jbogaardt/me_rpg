import { sayTime } from '../systems/dmPowers';
import { voice } from './voice';

const DIALOG_MAX_W = 600;
/** The most captions kept waiting behind the one on screen, and how long (s) one stays worth showing. */
const MAX_LATER = 2;
const LATER_STALE_S = 25;

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

interface Caption {
  /** When it leaves (arena clock, s). */
  until: number;
}

/**
 * The dialog box (markup in index.html; tapping it presses the action key, see core/touch.ts) says *conversations* (an
 * NPC, a quest brief, a sign): paged, the player stands still until they are read, the next waits in line, and one may
 * `pauses` the world for everyone. The Dungeon Master's words are not a conversation: `tell` puts them in a **caption**
 * (`#dm-caption`), plain text on a clear background that takes no input, never stops play and leaves by itself. The
 * caption is also spoken (`voice.ts`).
 */
export class Dialog {
  private box = document.getElementById('dialog')!;
  private text = document.getElementById('dialog-text')!;
  private talk: Talk | null = null;
  private queue: Talk[] = [];
  private caption = document.getElementById('dm-caption')!;
  private captionText = document.getElementById('dm-caption-text')!;
  private shown: Caption | null = null;
  private later: { text: string; seconds: number; at: number }[] = [];

  constructor() {
    const speaker = this.caption.querySelector('.voice');
    if (speaker instanceof HTMLButtonElement) {
      const show = () => {
        speaker.hidden = !voice.available;
        speaker.textContent = voice.muted ? '🔇' : '🔊';
      };
      show();
      speaker.addEventListener('click', () => {
        voice.setMuted(!voice.muted);
        show();
      });
    }
  }

  /** A conversation is open: the player stands still, and the action key reads on. */
  get active(): boolean {
    return this.talk !== null;
  }

  /** The conversation open now holds the world still for everyone. */
  get pausing(): boolean {
    return this.talk?.pauses ?? false;
  }

  /** Show `lines` one at a time, after any conversation already open; `onDone` runs once the last one is dismissed (not when closed by force). */
  say(lines: string[], onDone?: () => void, opts: DialogOptions = {}) {
    const talk: Talk = { lines, index: 0, done: onDone ?? null, pauses: opts.pauses ?? false };
    if (this.talk) this.queue.push(talk);
    else this.open(talk);
  }

  /** Say `text` in the caption for `seconds`. One at a time: a line said meanwhile waits its turn (a few at most, newest kept). */
  tell(text: string, seconds: number) {
    if (this.shown) {
      this.later.push({ text, seconds, at: performance.now() / 1000 });
      if (this.later.length > MAX_LATER) this.later.shift();
      return;
    }
    this.showCaption(text, seconds);
  }

  /** Passive text: anything the game tells the player that they did not ask for (a defeat, a quest given, a chapter's note). */
  note(lines: readonly string[]) {
    const text = lines.join(' ');
    this.tell(text, sayTime(text));
  }

  /** Each frame: a caption leaves once its time is up and its words have been spoken; then the next one comes. */
  update() {
    const now = performance.now() / 1000;
    if (this.shown && now >= this.shown.until && (!voice.busy || now >= this.shown.until + 20)) {
      if (voice.busy) voice.stop(); // a voice that never finished
      this.clearCaption();
    }
    if (!this.shown) {
      const next = this.later.shift();
      if (next && now - next.at < LATER_STALE_S) this.showCaption(next.text, next.seconds);
      else if (next) this.later.length = 0; // the rest is older still
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

  /** Close everything (leaving the game). */
  close() {
    this.talk = null;
    this.queue = [];
    this.later = [];
    this.clearCaption();
    voice.stop();
    this.hide();
  }

  private open(talk: Talk) {
    this.talk = talk;
    this.text.textContent = talk.lines[0] ?? '';
    this.box.hidden = false;
  }

  private showCaption(text: string, seconds: number) {
    this.shown = { until: performance.now() / 1000 + seconds };
    this.captionText.textContent = text;
    this.caption.hidden = false;
    voice.speak(text);
  }

  private clearCaption() {
    this.shown = null;
    this.caption.hidden = true;
  }

  private hide() {
    this.box.hidden = true;
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
