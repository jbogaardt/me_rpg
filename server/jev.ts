// The DM bot's fast router on TypeSafe's Jev (router.ts's `ChoiceRouter`): one `choice` question per card, answered
// with a probability per option. Used when `TYPESAFE_API_KEY` is set (host.ts); the model is the SDK's default
// (`jev-latest`) unless `TYPESAFE_DEFAULT_MODEL` names another. The key stays in the bot's environment.
//
// Option ids are the game's (`q:0`, `road:fire|ford`, `@none`), which mean nothing to a model, so each option is asked
// under a plain label (`option_1`...) described by its own words (and, for a director's card, when it is the right
// choice: `HINTS` in router.ts), and the answer is mapped back.

import { choice, TypeSafeClient } from '@typesafe-ai/sdk';
import type { ChoiceAnswer, ChoiceQuestion, ChoiceRouter } from './router';

/** What `systemOne` takes as state: JSON (QuestionState is plain JSON). */
type SentState = Parameters<TypeSafeClient['systemOne']>[0]['state'];

/** The part of the TypeSafe client this uses (a stand-in can replace it in tests). */
export interface SystemOne {
  systemOne(request: {
    state: SentState;
    questions: { next: ReturnType<typeof choice> };
  }): Promise<{ answers: { next: { choice: string; confidence: number; probabilities: Record<string, number> } } }>;
}

/** The label an option is asked under. */
const labelOf = (i: number) => `option_${i + 1}`;

export class JevRouter implements ChoiceRouter {
  constructor(private client: SystemOne = new TypeSafeClient()) {}

  async choose(question: ChoiceQuestion): Promise<ChoiceAnswer> {
    const criteria = Object.fromEntries(
      question.options.map((o, i) => [labelOf(i), o.hint ? `${o.label}: ${o.hint}` : o.label]),
    );
    const { answers } = await this.client.systemOne({
      state: question.state as unknown as SentState,
      questions: { next: choice(question.question, criteria) },
    });
    const idOf = (label: string) => question.options[Number(label.replace('option_', '')) - 1]?.id;
    const distribution: Record<string, number> = {};
    for (const [label, p] of Object.entries(answers.next.probabilities)) {
      const id = idOf(label);
      if (id) distribution[id] = p;
    }
    const picked = idOf(answers.next.choice);
    if (!picked) throw new Error(`Jev answered "${answers.next.choice}", which is not an option`);
    return { choice: picked, confidence: answers.next.confidence, distribution };
  }
}
