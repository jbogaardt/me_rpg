// The DM bot's decision for one player action (Pixi-free, Node-free, tested). Two tiers:
//
// 1. A fast router (planned: the Jev API) answers one `choice` question: which of the live story's next roads does this
//    action call for, or none (`NO_ROAD`)? A road counts only when the router is sure of it (`CONFIDENCE`); anything
//    else goes on to the fallback, which at least answers the player.
// 2. Below that, a creative fallback (planned: Claude Haiku) improvises: a reply in the DM's voice and, at most, one of
//    the same roads. Its JSON is checked here before anything is used (`readImprovised`), so a bad answer can only lose
//    the cue, never reach the game.
//
// Neither may invent a world: a road is only ever a cue the page offered (`StoryView.options`), which the page's own
// `World` checks again and sends to friends through the usual log. Both AI services are interfaces with mock
// implementations in mocks.ts until the real APIs are chosen.

/** How sure the router must be for its road to be taken without asking the fallback. */
export const CONFIDENCE = 0.8;
/** The most letters of a reply (the page trims the DM's words again). */
export const MAX_REPLY = 200;

/** One road the story may take next (the page's `StoryOption`). */
export interface Road {
  cue: string;
  label: string;
  theme: string;
  tags: string[];
}

/** What the page tells the bot with every action (the page's `DmBotState`, as far as the decision needs it). */
export interface TableState {
  area: string;
  friends: number[];
  story: { title: string; placed: string[]; total: number; options: Road[]; complete: boolean } | null;
}

/** A `choice` question for the router: the state as JSON text, the question, and the ids it may answer. */
export interface ChoiceQuestion {
  state: string;
  question: string;
  options: { id: string; label: string }[];
}

/** The router's answer: its pick and how sure it is (the top of its probability distribution). */
export interface ChoiceAnswer {
  choice: string;
  confidence: number;
  distribution: Record<string, number>;
}

export interface ChoiceRouter {
  choose(question: ChoiceQuestion): Promise<ChoiceAnswer>;
}

/** What the fallback is given. It returns raw JSON, read with `readImprovised`. */
export interface ImproviseRequest {
  state: TableState;
  action: string;
  roads: Road[];
}

export interface CreativeFallback {
  improvise(request: ImproviseRequest): Promise<unknown>;
}

/** What the bot does: take a road (or not) and say something to the player who acted. */
export interface Decision {
  source: 'router' | 'fallback' | 'silent';
  cue: string | null;
  reply: string;
  confidence: number | null;
}

/** The answer when the fallback fails: the player still hears that the DM is listening. */
export const HOLD_REPLY = 'The Dungeon Master ponders your words.';

/** The router's way of saying the action calls for no road (so a lone road is never a forced pick). */
export const NO_ROAD = '@none';

/** The router's one question, with the roads and `NO_ROAD` as its options (`null`: there is no road to choose). */
export function choiceQuestion(state: TableState, action: string): ChoiceQuestion | null {
  const roads = state.story?.options ?? [];
  if (!roads.length) return null;
  return {
    state: JSON.stringify({ area: state.area, story: state.story, action }),
    question: "Based on the player's action, which of these roads is the most logical outcome?",
    options: [
      ...roads.map((r) => ({ id: r.cue, label: r.label })),
      { id: NO_ROAD, label: 'None of these: the action does not move the story on' },
    ],
  };
}

/** The fallback's answer, if it is usable: a reply, and a cue only when it is one of the roads offered. */
export function readImprovised(raw: unknown, roads: Road[]): { reply: string; cue: string | null } | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const { reply, cue } = value as { reply?: unknown; cue?: unknown };
  if (typeof reply !== 'string' || !reply.trim()) return null;
  const known = typeof cue === 'string' && roads.some((r) => r.cue === cue) ? cue : null;
  return { reply: reply.trim().slice(0, MAX_REPLY), cue: known };
}

/** Decide what one player's action leads to. Never throws: a failing service falls through to the next tier. */
export async function evaluateAction(
  state: TableState,
  action: string,
  services: { router: ChoiceRouter; fallback: CreativeFallback },
): Promise<Decision> {
  const roads = state.story?.options ?? [];
  const question = choiceQuestion(state, action);
  let confidence: number | null = null;
  if (question) {
    try {
      const answer = await services.router.choose(question);
      confidence = answer.confidence;
      const road = roads.find((r) => r.cue === answer.choice);
      if (road && answer.confidence >= CONFIDENCE) {
        return { source: 'router', cue: road.cue, reply: `So be it: ${road.label.toLowerCase()}.`, confidence };
      }
    } catch (err) {
      console.warn('router failed, improvising', err);
    }
  }
  try {
    const made = readImprovised(await services.fallback.improvise({ state, action, roads }), roads);
    if (made) return { source: 'fallback', ...made, confidence };
  } catch (err) {
    console.warn('fallback failed', err);
  }
  return { source: 'silent', cue: null, reply: HOLD_REPLY, confidence };
}
