// Inline director cues (Pixi-free, tested; core engine, co-op): the Dungeon Master's words may carry stage directions
// written into the prose where the action happens, e.g.
//
//   He lunges <cue:anim actor="p1" action="slash" dir="right" />and the blade rings <cue:sfx name="steel_clash" />
//   off the iron lantern <cue:camera shake="0.5" duration="0.3" />as it swings.
//
// Every page that shows the words runs them through the same `CueStream`: the tags are cut out of what is read (they
// never reach a caption) and become `Cue`s placed at a character offset of the visible text. A `CueTimeline` then
// releases each cue when the reading reaches its offset, so the swing lands on the word it was written beside. Cues are
// cosmetic and local (an animation, a sound, a camera shake): nothing here touches game state, so the host and every
// guest simply play what they were told, and a guest needs nothing on the wire beyond the tagged text itself.
//
// The grammar is a closed vocabulary (below): a tag that names anything else is stripped and ignored, never shown and
// never played, so a model that invents an action cannot break the screen. New vocabulary is added here first (and its
// player in `scenes/overworld/Cues.ts` / `hud/sfx.ts`, which the types force).

import { DIRS, type Direction } from '../core/direction';
import { MAX_SAY } from './dmPowers';

/** One-shot poses and stage business an `anim` cue may ask of an actor. `dodge` has no sprite: it floats a word. */
export const ANIM_ACTIONS = ['slash', 'lunge', 'cast', 'shoot', 'hurt', 'stagger', 'dodge'] as const;
export type AnimAction = (typeof ANIM_ACTIONS)[number];

/** The sounds a cue may name (each has a synthesised recipe in `hud/sfx.ts`: nothing is downloaded). */
export const SFX_NAMES = ['steel_clash', 'glass_break', 'thud', 'whoosh', 'thunder', 'creak', 'splash'] as const;
export type SfxName = (typeof SFX_NAMES)[number];

/** Who an `anim` cue may act on: the DM, the whole party, the nearest foe, or a player by number (`p1`..`p3`). */
export const ACTORS = ['dm', 'party', 'foe', 'p1', 'p2', 'p3'] as const;
export type Actor = (typeof ACTORS)[number];

/** How hard a camera shake is, by name (a number from 0 to 1 is taken as it is). */
export const SHAKE_WORDS = { light: 0.3, medium: 0.6, heavy: 1 } as const;
export const SHAKE_SECONDS = { min: 0.1, max: 2, fallback: 0.4 } as const;

/** What a cue does, without where in the words it falls. */
export type CueBody =
  | { kind: 'anim'; actor: Actor; action: AnimAction; dir?: Direction }
  | { kind: 'sfx'; name: SfxName }
  | { kind: 'camera'; shake: number; duration: number };

/** A cue and the number of visible characters that come before it. */
export type Cue = CueBody & { at: number };

/** Words with their cues: `text` is what is read, each cue's `at` an offset into it (0 to `text.length`). */
export interface Cued {
  text: string;
  cues: Cue[];
}

/** The most cues one saying may carry (a flood of sounds would be noise, not direction). */
export const MAX_CUES = 4;
/** The longest tagged text one saying may take on the wire: `MAX_SAY` visible letters plus `MAX_CUES` tags. */
export const MAX_SAY_CUED = MAX_SAY + MAX_CUES * 70;
/** A tag that has not closed after this many letters is not a tag: it is dropped rather than swallow the words after it. */
const MAX_TAG = 160;
const OPEN = '<cue:';

/** Characters of text revealed per second as the words are read: near the pace the browser's voice speaks them. */
export const REVEAL_CPS = 18;

const isActor = (v: string | undefined): v is Actor => (ACTORS as readonly string[]).includes(v ?? '');
const isAction = (v: string | undefined): v is AnimAction => (ANIM_ACTIONS as readonly string[]).includes(v ?? '');
const isSfx = (v: string | undefined): v is SfxName => (SFX_NAMES as readonly string[]).includes(v ?? '');
const isDir = (v: string | undefined): v is Direction => (DIRS as readonly string[]).includes(v ?? '');

/** One tag as a cue body, or null when it names anything outside the vocabulary. */
export function parseTag(tag: string): CueBody | null {
  const kind = /^<cue:(\w+)/.exec(tag)?.[1];
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/(\w+)=(?:"([^"]*)"|'([^']*)')/g))
    attrs[(m[1] ?? '').toLowerCase()] = (m[2] ?? m[3] ?? '').trim().toLowerCase();
  if (kind === 'anim') {
    const { actor, action, dir } = attrs;
    if (!isActor(actor) || !isAction(action)) return null;
    return isDir(dir) ? { kind, actor, action, dir } : { kind, actor, action };
  }
  if (kind === 'sfx') return isSfx(attrs.name) ? { kind, name: attrs.name } : null;
  if (kind === 'camera') {
    const word = attrs.shake as keyof typeof SHAKE_WORDS | undefined;
    const shake = word && word in SHAKE_WORDS ? SHAKE_WORDS[word] : Number(attrs.shake);
    if (attrs.shake === undefined || !Number.isFinite(shake) || shake <= 0) return null;
    const seconds = attrs.duration === undefined ? SHAKE_SECONDS.fallback : Number(attrs.duration);
    const duration = Number.isFinite(seconds) ? seconds : SHAKE_SECONDS.fallback;
    return {
      kind,
      shake: Math.min(1, shake),
      duration: Math.min(SHAKE_SECONDS.max, Math.max(SHAKE_SECONDS.min, duration)),
    };
  }
  return null;
}

/**
 * Reads tagged words as they arrive, in pieces of any size (a model's tokens, or the whole line at once), and hands back
 * what each piece adds: the visible text and the cues now known. A tag split across two pieces is held until it closes;
 * a tag outside the vocabulary, one that never closes and every stray space is dropped. Whitespace is collapsed as it is
 * read, so a cue's `at` is already an offset into the final text.
 */
export class CueStream {
  private held = '';
  private shown = 0;
  private spaced = true; // the last visible character is a space (or none yet): the next space adds nothing
  private count = 0;

  /** Add a piece of the words; returns the visible text and cues it completes. */
  push(chunk: string): Cued {
    const input = this.held + chunk;
    this.held = '';
    let text = '';
    const cues: Cue[] = [];
    const put = (s: string) => {
      for (const ch of s) {
        if (/\s/.test(ch)) {
          if (this.spaced) continue;
          text += ' ';
          this.spaced = true;
        } else {
          text += ch;
          this.spaced = false;
        }
        this.shown++;
      }
    };
    let i = 0;
    while (i < input.length) {
      const j = input.indexOf('<', i);
      if (j < 0) {
        put(input.slice(i));
        break;
      }
      put(input.slice(i, j));
      const rest = input.slice(j);
      if (rest.startsWith(OPEN)) {
        const end = rest.indexOf('/>');
        if (end < 0) {
          if (rest.length <= MAX_TAG) this.held = rest; // still arriving
          break;
        }
        const body = parseTag(rest.slice(0, end + 2));
        if (body && this.count < MAX_CUES) {
          this.count++;
          cues.push({ ...body, at: this.shown });
        }
        i = j + end + 2;
      } else if (OPEN.startsWith(rest)) {
        this.held = rest; // "<cu" so far: may yet become a tag
        break;
      } else {
        put('<');
        i = j + 1;
      }
    }
    return { text, cues };
  }

  /** The words are over: whatever tag was still open is dropped. */
  flush(): Cued {
    this.held = '';
    return { text: '', cues: [] };
  }
}

/** Tagged words, all at once, as visible text and cues. The text has no trailing space; no cue lies past its end. */
export function parseCued(raw: string): Cued {
  const stream = new CueStream();
  const first = stream.push(raw);
  stream.flush();
  const text = first.text.replace(/ $/, '');
  return { text, cues: first.cues.map((c) => ({ ...c, at: Math.min(c.at, text.length) })) };
}

/** The words as they are read, with every tag cut out. */
export const stripCues = (raw: string): string => parseCued(raw).text;

/** A cue as its tag. */
export function tagOf(cue: CueBody): string {
  const n = (x: number) => String(Math.round(x * 100) / 100);
  if (cue.kind === 'sfx') return `<cue:sfx name="${cue.name}" />`;
  if (cue.kind === 'camera') return `<cue:camera shake="${n(cue.shake)}" duration="${n(cue.duration)}" />`;
  return `<cue:anim actor="${cue.actor}" action="${cue.action}"${cue.dir ? ` dir="${cue.dir}"` : ''} />`;
}

/** Words and cues written back as tagged text (what `parseCued` reads again, unchanged). */
export function serializeCued({ text, cues }: Cued): string {
  let out = '';
  let at = 0;
  for (const cue of [...cues].sort((a, b) => a.at - b.at)) {
    out += text.slice(at, cue.at) + tagOf(cue);
    at = Math.max(at, cue.at);
  }
  return out + text.slice(at);
}

/**
 * The DM's words as they will be sent: one line, tags checked and written out in one form, the visible words no longer
 * than `MAX_SAY` ('' when there is nothing to say). Plain words come out exactly as `cleanSay` makes them.
 */
export function cleanCued(raw: string): string {
  const said = parseCued(raw);
  const text = said.text.slice(0, MAX_SAY).trim();
  return serializeCued({ text, cues: said.cues.filter((c) => c.at <= text.length) });
}

/**
 * Change the visible words (cut stage directions, trim to a sentence...) without losing where the cues fall: each cue is
 * parked in the text as a private-use mark that `fn` leaves alone (it must not split or reorder the text), then read
 * back at its new offset.
 */
export function mapCued(said: Cued, fn: (text: string) => string): Cued {
  const BASE = 0xe000;
  let marked = '';
  let at = 0;
  said.cues.forEach((cue, i) => {
    marked += said.text.slice(at, cue.at) + String.fromCharCode(BASE + i);
    at = cue.at;
  });
  marked += said.text.slice(at);
  let text = '';
  const cues: Cue[] = [];
  for (const ch of fn(marked)) {
    const cue = said.cues[ch.charCodeAt(0) - BASE];
    if (cue && ch.length === 1) cues.push({ ...cue, at: text.length });
    else text += ch;
  }
  return { text, cues };
}

/**
 * Releases a saying's cues as it is read: `advance(dt)` moves the reading on `dt` seconds and returns how much of the
 * text shows now and the cues the reading has just reached, in order. A cue at offset 0 comes with the first step, one at
 * the end with the last word. A saying with no cues is not paced (`duration` 0): it shows whole.
 */
export class CueTimeline {
  private clock = 0;
  private next = 0;
  private cues: Cue[];

  constructor(
    readonly text: string,
    cues: readonly Cue[],
    private cps = REVEAL_CPS,
  ) {
    this.cues = [...cues].sort((a, b) => a.at - b.at);
  }

  /** Seconds the reading takes. */
  get duration(): number {
    return this.cues.length ? this.text.length / this.cps : 0;
  }

  get done(): boolean {
    return this.clock >= this.duration && this.next >= this.cues.length;
  }

  advance(dt: number): { shown: number; due: Cue[] } {
    this.clock += Math.max(0, dt);
    const shown = this.cues.length ? Math.min(this.text.length, Math.floor(this.clock * this.cps)) : this.text.length;
    const due: Cue[] = [];
    while (this.next < this.cues.length && (this.cues[this.next]?.at ?? Infinity) <= shown) {
      const cue = this.cues[this.next++];
      if (cue) due.push(cue);
    }
    return { shown, due };
  }
}
