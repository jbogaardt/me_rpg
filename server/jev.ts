// The DM bot's fast router on TypeSafe's Jev (router.ts's `ChoiceRouter`): one `choice` question per card, answered
// with a probability per option. Used when `TYPESAFE_API_KEY` is set (host.ts); the model is the SDK's default
// (`jev-latest`) unless `TYPESAFE_DEFAULT_MODEL` names another. The key stays in the bot's environment.
//
// Option ids are the game's (`q:0`, `road:fire|ford`, `@none`), which mean nothing to a model, so each option is asked
// under a plain label (`option_1`...) described by its own words (and, for a director's card, when it is the right
// choice: `HINTS` in router.ts), and the answer is mapped back.

import { choice, noul, score, TypeSafeClient } from '@typesafe-ai/sdk';
import type { Pulse, PulseState, TableReader } from './pulse';
import type { ChoiceAnswer, ChoiceQuestion, ChoiceRouter } from './router';

/** What `systemOne` takes as state: JSON (QuestionState is plain JSON). */
type SentState = Parameters<TypeSafeClient['systemOne']>[0]['state'];

/** The part of the TypeSafe client this uses (a stand-in can replace it in tests). */
export interface SystemOne {
  systemOne(request: {
    state: SentState;
    questions: Record<string, { type: string; criteria?: unknown }>;
  }): Promise<{ answers: unknown }>;
}

/** The label an option is asked under. */
const labelOf = (i: number) => `option_${i + 1}`;

export class JevRouter implements ChoiceRouter {
  constructor(private client: SystemOne = new TypeSafeClient()) {}

  async choose(question: ChoiceQuestion): Promise<ChoiceAnswer> {
    const criteria = Object.fromEntries(
      question.options.map((o, i) => [labelOf(i), o.hint ? `${o.label}: ${o.hint}` : o.label]),
    );
    const response = await this.client.systemOne({
      state: question.state as unknown as SentState,
      questions: { next: choice(question.question, criteria) },
    });
    const answers = response.answers as {
      next: { choice: string; confidence: number; probabilities: Record<string, number> };
    };
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

/** The levels of `pressure`: described as situations (a bare number tells the model nothing). */
const PRESSURE_LEVELS = [
  'Everyone is at nearly full health (about 80% or more): the party is cruising.',
  'The weakest player is between 50% and 80% health: a few scrapes, but in control.',
  'The weakest player is between 25% and 50% health: clearly hurt, but coping.',
  'The weakest player is under 25% health, or the average is under 50%: hard-pressed.',
  'Players have fallen (`party.fallen` above 0), or everyone is close to death: overwhelmed.',
] as const;

/** The table read as one fan-out request: four independent judgments over the same state. */
export class JevReader implements TableReader {
  constructor(private client: SystemOne = new TypeSafeClient()) {}

  async read(state: PulseState): Promise<Omit<Pulse, 'at'>> {
    const response = await this.client.systemOne({
      state: state as unknown as SentState,
      questions: {
        pressure: score('How hard pressed is the party? Judge by the health figures in `party`.', PRESSURE_LEVELS),
        stalled: noul(
          'The players are at a loss or idle. True when no quest is active (`progress.questActive` is false) and it has been over a minute since a quest was offered (`progress.secondsSinceQuestOffered`).',
          {
            true: 'No quest is active and over a minute has passed since one was offered.',
            false: 'A quest is active, or one was offered less than a minute ago.',
          },
        ),
        wantsWord: noul(
          'A short remark from the Dungeon Master now would help the players. True when the DM has been silent for over a minute (`progress.secondsSinceDmSpoke`) and nobody is badly hurt (`party.lowestHealthPercent` above 40).',
          {
            true: 'Over a minute since the DM spoke and no one is badly hurt.',
            false: 'The DM spoke within the last minute, or someone is badly hurt and chatter would annoy them.',
          },
        ),
        needsQuest: noul(
          'The party needs a new quest. True when no quest is active (`progress.questActive` is false) and over 40 seconds have passed since one was offered (`progress.secondsSinceQuestOffered`).',
          {
            true: 'No quest is active and over 40 seconds have passed since one was offered.',
            false: 'A quest is active, or one was offered within the last 40 seconds.',
          },
        ),
      },
    });
    const a = response.answers as {
      pressure: { score: number };
      stalled: { noul: number };
      wantsWord: { noul: number };
      needsQuest: { noul: number };
    };
    return {
      pressure: a.pressure.score / (PRESSURE_LEVELS.length - 1),
      stalled: a.stalled.noul,
      wantsWord: a.wantsWord.noul,
      needsQuest: a.needsQuest.noul,
    };
  }
}
