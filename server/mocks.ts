// Stand-ins for the DM bot's two AI services (router.ts) until the real APIs are chosen. Deterministic, so tests and a
// local run behave the same every time.
//
// The router answers a friend's words by the words they share with each option (with a road's theme and tags), as a
// probability distribution in which `NONE` scores as half a shared word: one clear match is confident, no match leans to
// none, a tie is unsure. A director's card it answers with its first option (the director only asks what fits). The
// fallback echoes the friend and takes the first road when they ask to move on, or a quest when they ask for one.

import {
  NONE,
  ROAD,
  type ChoiceAnswer,
  type ChoiceQuestion,
  type ChoiceRouter,
  type CreativeFallback,
  type ImproviseRequest,
  type Road,
} from './router';

const STOP = new Set(['the', 'and', 'into', 'over', 'with', 'want', 'let', 'our', 'you', 'for', 'this', 'that']);
const words = (text: string): Set<string> =>
  new Set((text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w)));

/** How sharply a shared word pulls the distribution toward its option. */
const SHARPNESS = 4;
/** How sure the router is of a director's card's first option. */
const SURE = 0.9;

export class MockRouter implements ChoiceRouter {
  /** The roads behind road options, for their themes and tags (the question carries only labels). */
  constructor(private roads: () => Road[] = () => []) {}

  choose(question: ChoiceQuestion): Promise<ChoiceAnswer> {
    const said = (JSON.parse(question.state) as { words?: string | null }).words;
    const ids = question.options.map((o) => o.id);
    if (!said) {
      const first = ids.find((id) => id !== NONE) ?? NONE;
      const rest = (1 - SURE) / Math.max(1, ids.length - 1);
      const distribution = Object.fromEntries(ids.map((id) => [id, id === first ? SURE : rest]));
      return Promise.resolve({ choice: first, confidence: SURE, distribution });
    }
    const heard = words(said);
    const scores = question.options.map(({ id, label }) => {
      if (id === NONE) return Math.exp(SHARPNESS / 2);
      const road = id.startsWith(ROAD) ? this.roads().find((r) => ROAD + r.cue === id) : undefined;
      const about = words([label, road?.theme ?? '', ...(road?.tags ?? [])].join(' '));
      let shared = 0;
      for (const w of heard) if (about.has(w)) shared++;
      return Math.exp(SHARPNESS * shared);
    });
    const total = scores.reduce((a, b) => a + b, 0);
    const distribution = Object.fromEntries(ids.map((id, i) => [id, (scores[i] ?? 0) / total]));
    let best = ids[0] ?? NONE;
    for (const id of ids) if ((distribution[id] ?? 0) > (distribution[best] ?? 0)) best = id;
    return Promise.resolve({ choice: best, confidence: distribution[best] ?? 0, distribution });
  }
}

const MOVE_ON = /\b(move on|onward|next land|leave|travel|journey)\b/i;
const QUEST = /\b(quest|task|job|something to do)\b/i;

export class MockFallback implements CreativeFallback {
  improvise({ words: said, options }: ImproviseRequest): Promise<unknown> {
    if (!said) return Promise.resolve(JSON.stringify({ pick: options[0]?.id ?? NONE }));
    const road = MOVE_ON.test(said) ? options.find((o) => o.id.startsWith(ROAD)) : undefined;
    const quest = QUEST.test(said) ? options.find((o) => o.id === '@quest') : undefined;
    const pick = road ?? quest;
    return Promise.resolve(
      JSON.stringify({
        ...(pick ? { pick: pick.id } : {}),
        reply: road
          ? `Very well. The road turns ${road.label.toLowerCase()}.`
          : quest
            ? 'A task, then. Listen well.'
            : `The Dungeon Master hears you: “${said}”.`,
      }),
    );
  }
}
