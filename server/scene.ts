// The scene verdict: what Jev hands Haiku about a moment, beyond who won. Jev judges the *drama* of a moment as atomic
// choices over named facts (`SceneFacts`, plain numbers and words, no ids): how it should feel (`dramatic_tension`),
// what the place does about it (`environmental_twist`) and how the other side carries itself (`npc_reaction_state`).
// The mechanical outcome is the game's own and rides along untouched (code decides what happened; Jev decides how it
// should read). The verdict is then written straight into Haiku's prompt (`verdictBrief`) together with the curator's
// rules (`DIRECTOR_RULES`), and Haiku's reply is read back with the page's own cue grammar (systems/cues.ts), so the
// words and the stage directions arrive as one string the page plays in order. Pixi-free, Node-free, tested.

import { ACTORS, ANIM_ACTIONS, MAX_CUES, SFX_NAMES } from '../src/systems/cues';
import type { Beat } from './narrate';

export const TENSIONS = ['comic_relief', 'mounting_dread', 'furious_clash', 'hushed_suspense'] as const;
export const TWISTS = ['footing_compromised', 'cover_destroyed', 'lighting_changed', 'none'] as const;
export const REACTIONS = ['flinching', 'taunting', 'desperate', 'calculating'] as const;
/** How the mechanics went: a clean success, a success that costs something (`partial`), or a failure. */
export const OUTCOMES = ['success', 'partial', 'setback'] as const;

export type DramaticTension = (typeof TENSIONS)[number];
export type EnvironmentalTwist = (typeof TWISTS)[number];
export type NpcReactionState = (typeof REACTIONS)[number];
export type Outcome = (typeof OUTCOMES)[number];

/** What happened, mechanically: the game's resolution, passed through as it is. */
export interface Mechanical {
  /** Who acted: a cue actor (`p1`, `foe`, `dm`...), so the prose can direct them. */
  actor: string;
  /** What they tried, in a few plain words ("lunge at the goblin with a sword"). */
  action: string;
  /** Who it was done to, in plain words ("the goblin"), when someone was. */
  target?: string;
  outcome: Outcome;
}

/** The named facts Jev reads. Percentages are 0 to 100; nothing is an id. */
export interface SceneFacts {
  area: string;
  /** The place in a few words, with its light ("a cellar lit by one hanging lantern"). */
  setting: string;
  /** Things in the scene that could be broken, doused or knocked over ("a hanging lantern", "stacked crates"). */
  props: string[];
  /** What the ground is like ("dry flagstone", "wet mud"), when it matters. */
  surface?: string;
  mechanical: Mechanical;
  /** Of the target's health taken by this action. */
  damagePercent: number;
  actorHealthPercent: number;
  targetHealthPercent?: number;
}

/** Jev's output for a moment: the mechanics and the three dramatic fields. */
export interface SceneVerdict {
  mechanical: Mechanical;
  dramatic_tension: DramaticTension;
  environmental_twist: EnvironmentalTwist;
  npc_reaction_state: NpcReactionState;
}

export type DramaticRead = Pick<SceneVerdict, 'dramatic_tension' | 'environmental_twist' | 'npc_reaction_state'>;

/** Whatever judges the drama of a moment (Jev, or the rules below). */
export interface SceneJudge {
  judge(facts: SceneFacts): Promise<DramaticRead>;
}

const has = (list: readonly string[], v: unknown): v is string => typeof v === 'string' && list.includes(v);

/** A judge's answer if every field is in the vocabulary, else null (never a half-checked verdict). */
export function readDrama(raw: unknown): DramaticRead | null {
  if (!raw || typeof raw !== 'object') return null;
  const { dramatic_tension: t, environmental_twist: e, npc_reaction_state: r } = raw as Record<string, unknown>;
  if (!has(TENSIONS, t) || !has(TWISTS, e) || !has(REACTIONS, r)) return null;
  return {
    dramatic_tension: t as DramaticTension,
    environmental_twist: e as EnvironmentalTwist,
    npc_reaction_state: r as NpcReactionState,
  };
}

/**
 * The rules' own read of a moment, for when there is no Jev key or Jev fails: crude but never wrong enough to matter,
 * and what the tests lean on. Order matters: a near-death says more than a clean hit.
 */
export function ruleDrama(f: SceneFacts): DramaticRead {
  const { outcome } = f.mechanical;
  const target = f.targetHealthPercent ?? 100;
  const dark = /dark|dim|candle|torch|lantern|night/i.test(f.setting);
  const dramatic_tension: DramaticTension =
    f.actorHealthPercent < 30
      ? 'mounting_dread'
      : f.damagePercent >= 25 || target < 35
        ? 'furious_clash'
        : outcome === 'setback' && f.damagePercent === 0
          ? 'comic_relief'
          : dark && f.damagePercent === 0
            ? 'hushed_suspense'
            : f.damagePercent > 0
              ? 'furious_clash'
              : 'hushed_suspense';
  const prop = (re: RegExp) => f.props.some((p) => re.test(p));
  const environmental_twist: EnvironmentalTwist =
    outcome !== 'success' && prop(/lantern|torch|candle|lamp/i)
      ? 'lighting_changed'
      : f.damagePercent >= 25 && prop(/crate|barrel|pillar|table|wall|cart/i)
        ? 'cover_destroyed'
        : outcome !== 'success' && /wet|mud|ice|icy|slick|loose|scree/i.test(f.surface ?? '')
          ? 'footing_compromised'
          : 'none';
  const npc_reaction_state: NpcReactionState =
    target < 25
      ? 'desperate'
      : outcome === 'setback'
        ? 'taunting'
        : f.damagePercent >= 25
          ? 'flinching'
          : 'calculating';
  return { dramatic_tension, environmental_twist, npc_reaction_state };
}

export class RuleJudge implements SceneJudge {
  judge(facts: SceneFacts): Promise<DramaticRead> {
    return Promise.resolve(ruleDrama(facts));
  }
}

/**
 * Resolve a moment into a verdict: the mechanics as given, the drama from `judge`. Never throws and never returns a
 * half-checked verdict: a judge that fails or answers outside the vocabulary leaves the rules to read the moment.
 */
export async function resolveScene(facts: SceneFacts, judge: SceneJudge): Promise<SceneVerdict> {
  let drama: DramaticRead | null = null;
  try {
    drama = readDrama(await judge.judge(facts));
  } catch (err) {
    console.warn('scene judge failed, using the rules:', err instanceof Error ? err.message : err);
  }
  return { mechanical: facts.mechanical, ...(drama ?? ruleDrama(facts)) };
}

/** How a moment's feeling should shape the prose, each in a line Haiku can follow. */
export const TENSION_STYLE: Record<DramaticTension, string> = {
  comic_relief:
    'a beat of dry comedy at someone’s expense: short sentences, a deadpan turn, nobody is really in danger',
  mounting_dread: 'slow and close: longer sentences that tighten, small sounds, what is not yet visible',
  furious_clash: 'fast and physical: short, hard verbs, one blow per sentence, no pause for scenery',
  hushed_suspense: 'quiet and precise: a held breath, one small sound, the thing that might happen next',
};
export const TWIST_FACT: Record<EnvironmentalTwist, string> = {
  footing_compromised: 'the ground gives: slick, loose or breaking underfoot, so balance is now a problem',
  cover_destroyed: 'whatever someone was hiding behind is wrecked: nothing is left between them',
  lighting_changed: 'the light changes: a flame gutters, a lantern swings or breaks, shadows jump',
  none: 'the place stays as it is: do not invent a change to it',
};
export const REACTION_STYLE: Record<NpcReactionState, string> = {
  flinching: 'the other side recoils: a flinch, a step back, a grunt',
  taunting: 'the other side bares its teeth and mocks: confidence, a grin, a word thrown back',
  desperate: 'the other side is cornered: wild, ragged, out of tricks',
  calculating: 'the other side watches and waits: still, measuring, weighing the next move',
};
/** Improv framing for how the mechanics went: the page's players should always get something to play off. */
export const OUTCOME_FRAME: Record<Outcome, string> = {
  success: 'Yes, and: it works, and something good comes with it',
  partial: 'Yes, but: it works, and it costs something or brings a new problem the same moment',
  setback: 'No, and: it fails, and the situation gets worse in a way the players can see',
};

/** The verdict as it goes into Haiku's prompt: the raw fields, then what each means for the telling. */
export function verdictBrief(v: SceneVerdict): string {
  const { mechanical: m } = v;
  return (
    `Scene verdict (JSON): ${JSON.stringify(v)}\n` +
    `Improv frame (${m.outcome}): ${OUTCOME_FRAME[m.outcome]}.\n` +
    `Tension ${v.dramatic_tension}: ${TENSION_STYLE[v.dramatic_tension]}.\n` +
    `Twist ${v.environmental_twist}: ${TWIST_FACT[v.environmental_twist]}.\n` +
    `Reaction ${v.npc_reaction_state}: ${REACTION_STYLE[v.npc_reaction_state]}.`
  );
}

/**
 * The curator's standing rules for a moment played out in words and stage directions. Given to Haiku with the verdict.
 * The tag grammar is the page's (systems/cues.ts); the lists are read from it, so they cannot drift from what plays.
 */
export const DIRECTOR_RULES =
  'You are running the table like a tabletop curator: you narrate the moment and direct it. ' +
  'Write the prose with stage directions written inline, exactly where the physical action happens in the sentence: ' +
  `<cue:anim actor="…" action="…" dir="…" /> (actor one of ${ACTORS.join(', ')}; action one of ${ANIM_ACTIONS.join(', ')}; dir up, down, left or right, optional), ` +
  `<cue:sfx name="…" /> (name one of ${SFX_NAMES.join(', ')}), <cue:camera shake="…" duration="…" /> (shake 0 to 1 or light, medium, heavy; duration in seconds). ` +
  `Put each tag immediately before the word that lands the action, never bunched at the end, at most ${MAX_CUES} in all, and only for things that happen in your sentences. ` +
  'Use only the actors and names above, and only actors the message gives you. The tags are not read aloud and are not words, so every sentence must make sense with them removed. ' +
  'Ground every line in concrete sensory anchors: what the light is doing, a texture underhand, one sound. ' +
  'Never use generic high-fantasy filler (no chills down spines, ancient evils, darkness looming, whispers of old magic, tapestries, echoes of the past). ' +
  'Follow the improv frame: when it is "Yes, but" grant what was tried and add the cost in the same breath; when it is "No, and" let it fail and make the situation worse using the twist; never a flat refusal. ' +
  'Let the tension and the other side’s reaction choose your rhythm and your verbs. Name no place, person or direction you were not given.';

/**
 * Filler a curator must not use. The prompt asks; this checks (`hasFiller`), because a small model forgets, and a line
 * that fails is replaced by the stock line rather than shown.
 */
export const FILLER = [
  /shiver(s|ed)? (runs?|ran|down)/i,
  /chill (runs?|ran|down)/i,
  /ancient (evil|power|magic|darkness)/i,
  /darkness (looms?|loomed|descends?)/i,
  /whispers? of (the )?(old|ancient|forgotten)/i,
  /tapestry/i,
  /echoes? of (the )?(past|ages|old)/i,
  /little did (you|they|he|she)/i,
  /in the blink of an eye/i,
  /palpable/i,
  /the very air/i,
];
export const hasFiller = (text: string): boolean => FILLER.some((re) => re.test(text));

/** Cue actors a scene may use: the one who acted, the party, the foe, the DM. */
export function actorsOf(m: Mechanical): string[] {
  return [...new Set([m.actor, 'party', 'foe'])];
}

/** The facts a beat gives, when it gives any a judge could read: a friend fallen low is one still fighting a losing fight. */
export function factsFor(beat: Beat, hp: number | undefined): SceneFacts | null {
  if (beat.kind !== 'hurt') return null;
  return {
    area: beat.area,
    setting: `somewhere in ${beat.area}`,
    props: [],
    mechanical: { actor: `p${beat.slot}`, action: 'fight on while badly hurt', target: 'the foe', outcome: 'setback' },
    damagePercent: 0,
    actorHealthPercent: Math.round((hp ?? 0.2) * 100),
  };
}
