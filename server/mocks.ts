// Stand-ins for the DM bot's two AI services (router.ts) until the real APIs are chosen. Deterministic, so tests and a
// local run behave the same every time.
//
// The router scores each road by the words it shares with the action (its label, theme and tags) and turns the scores
// into a probability distribution; "no road" scores as half a shared word. One clear match is confident, no match
// leans to no road, a tie is unsure: either way the fallback improvises. The fallback answers in the DM's voice and takes the first road when the player asks to move on.

import {
  NO_ROAD,
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

/** How sharply a shared word pulls the distribution toward its road. */
const SHARPNESS = 4;

export class MockRouter implements ChoiceRouter {
  /** The roads behind the question's options, for their themes and tags (the question carries only labels). */
  constructor(private roads: () => Road[] = () => []) {}

  choose(question: ChoiceQuestion): Promise<ChoiceAnswer> {
    const action = (JSON.parse(question.state) as { action?: string }).action ?? '';
    const said = words(action);
    const scores = question.options.map(({ id, label }) => {
      if (id === NO_ROAD) return Math.exp(SHARPNESS / 2);
      const road = this.roads().find((r) => r.cue === id);
      const about = words([label, road?.theme ?? '', ...(road?.tags ?? [])].join(' '));
      let shared = 0;
      for (const w of said) if (about.has(w)) shared++;
      return Math.exp(SHARPNESS * shared);
    });
    const total = scores.reduce((a, b) => a + b, 0);
    const distribution: Record<string, number> = {};
    question.options.forEach(({ id }, i) => (distribution[id] = (scores[i] ?? 0) / total));
    let best = question.options[0]?.id ?? '';
    for (const { id } of question.options) if ((distribution[id] ?? 0) > (distribution[best] ?? 0)) best = id;
    return Promise.resolve({ choice: best, confidence: distribution[best] ?? 0, distribution });
  }
}

const MOVE_ON = /\b(move on|onward|next|leave|travel|journey)\b/i;

export class MockFallback implements CreativeFallback {
  improvise({ action, roads }: ImproviseRequest): Promise<unknown> {
    const road = MOVE_ON.test(action) ? roads[0] : undefined;
    return Promise.resolve(
      JSON.stringify({
        reply: road
          ? `Very well. The road turns ${road.label.toLowerCase()}.`
          : `The Dungeon Master hears you: “${action}”.`,
        ...(road ? { cue: road.cue } : {}),
      }),
    );
  }
}
