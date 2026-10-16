// The session's arc: one tale the whole evening tells, so the sagas are chapters of it and not errands side by side. The
// arc is written once when the game begins (a threat, what is at stake, and a line per chapter, the last one the
// reckoning) and kept here, in the bot, not in a model's memory: the creative session is renewed every few dozen turns
// and a small model forgets, so every prompt that writes a saga or words the DM is handed the arc and the chapter afresh.
// That is how a small model (Haiku) holds a long story: it is reminded of it each time, briefly. When the last chapter
// has been told, a new arc begins that grows out of the old one's ending.

/** The evening's tale. */
export interface SessionArc {
  title: string;
  /** What threatens the lands, in a sentence. */
  threat: string;
  /** What the party is after, in a sentence (why it falls to them). */
  stake: string;
  /** One line per chapter (3 to 5): what that chapter is about. The last is the reckoning with the threat. */
  chapters: string[];
}

export const MIN_CHAPTERS = 3;
export const MAX_CHAPTERS = 5;

const words = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null;

/** An arc as a model wrote it, checked, or null. */
export function readArc(raw: unknown): SessionArc | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const title = words(r.title, 48);
  const threat = words(r.threat, 200);
  const stake = words(r.stake, 200);
  const chapters = Array.isArray(r.chapters) ? r.chapters.map((c) => words(c, 160)) : [];
  if (!title || !threat || !stake) return null;
  if (chapters.length < MIN_CHAPTERS || chapters.length > MAX_CHAPTERS || chapters.some((c) => c === null)) return null;
  return { title, threat, stake, chapters: chapters as string[] };
}

/** Where the evening stands in its arc. */
export interface ArcPlace {
  arc: SessionArc;
  /** The chapter the next saga tells (0-based). */
  chapter: number;
}

/** The arc and the chapter in a few lines, for a prompt (a saga's writer, the narrator). */
export function arcBrief({ arc, chapter }: ArcPlace): string {
  const n = Math.min(chapter, arc.chapters.length - 1);
  const last = n === arc.chapters.length - 1;
  return (
    `The evening's tale is “${arc.title}”: ${arc.threat} ${arc.stake} ` +
    `This is chapter ${n + 1} of ${arc.chapters.length}: ${arc.chapters[n]} ` +
    (last
      ? 'It is the last chapter: the party faces the threat itself and ends it.'
      : 'The threat is felt in this chapter but not yet faced; leave a thread for the next.')
  );
}

/** The arc's place once a saga has been told: the next chapter, or done when the last has been. */
export function advance(place: ArcPlace): ArcPlace | 'done' {
  return place.chapter + 1 >= place.arc.chapters.length ? 'done' : { ...place, chapter: place.chapter + 1 };
}

export interface ArcWriter {
  /** A new arc for a world whose party is in `area`; `after` is how the last arc ended, for the new one to grow from. */
  write(want: { area: string; after?: string }): Promise<SessionArc | null>;
}

/** Arcs to tell without a creative model, in turn. Each speaks of the land in general, never of a place by name. */
export const STOCK_ARCS: SessionArc[] = [
  {
    title: 'The Hollow Winter',
    threat: 'Something is draining the warmth from the lands, and every week the frost reaches a little further south.',
    stake: 'The villages will not survive another hard winter, and nobody else is willing to go looking for the cause.',
    chapters: [
      'Small signs: folk are cold, worried and short of food, and they need help before they need heroes.',
      'The cold has a source: a trail of strange frost leads away from the villages.',
      'Those who serve the cold show themselves, and an old ally is found among the wary townsfolk.',
      'The heart of the cold is found and broken, and the thaw begins.',
    ],
  },
  {
    title: 'The Broken Oath',
    threat: 'An oath that kept the lands at peace for a hundred years has been broken, and old enemies are stirring.',
    stake: 'Whoever broke it is still out there, and only a party from outside the old feuds can find out who.',
    chapters: [
      'Rumours in town: tempers are short, roads are less safe, and nobody trusts their neighbour.',
      'A witness to the oath-breaking is found, frightened and hiding.',
      'The oath-breaker is followed across the lands, and their reason turns out to be almost a good one.',
      'The oath is mended or remade, and the lands step back from the edge.',
    ],
  },
  {
    title: 'The Wandering Star',
    threat: 'A star fell beyond the hills, and since that night the beasts have been restless and the dreams strange.',
    stake: 'Others are already seeking what fell, and not all of them mean well.',
    chapters: [
      'Townsfolk tell of the night the star fell, and of what they have seen since.',
      'Pieces of the star are scattered, and each draws trouble to it.',
      'The rival seekers are met, and the party learns what the star can do.',
      'The heart of the star is reached first, and the party decides what becomes of it.',
    ],
  },
];

export class MockArcWriter implements ArcWriter {
  private n = 0;
  write(): Promise<SessionArc | null> {
    return Promise.resolve(STOCK_ARCS[this.n++ % STOCK_ARCS.length] ?? null);
  }
}
