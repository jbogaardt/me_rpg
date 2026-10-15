// Epic quests: sagas the Dungeon Master can launch, a chain of the DM's ordinary quests that carries the party across
// several lands (Pixi-free, tested; core engine, co-op). Each is a template of steps ("hunt one land over, then gather two
// lands over, then find a relic three over"), planned onto the zones of whatever world is being played by walking its
// links, so the same saga is told differently in each world and never names a content id. Every saga carries a gauge: how
// hard it is, how long it runs and how far it goes, so the DM can pick one to fit the evening.

import type { TaskKind } from './dmTasks';

/** What a step may be: one of the DM's quests, or going to meet one of the epic's people. */
export type StepKind = TaskKind | 'meet';

/** One step of a saga. */
export interface EpicStep {
  kind: StepKind;
  /** How many lands from where the saga starts this step is set (0: here, 1: the next land over...). */
  hop: number;
  /** What the DM tells the party for this step, in a line or two. `{area}` is the land it is set in, `{from}` the last. */
  tell: string;
  /** Meet: the key of the person (in `EpicTemplate.people`) the party is sent to find. Each person is met once. */
  who?: string;
  /** Meet: what they say once the party reaches them, a line at a time (1 to `MAX_SAYS`). */
  says?: string[];
  /** Meet: something the party takes from them and carries on (shown in the DM's words; the epic's later steps may ask for it). */
  gives?: string;
}

/** A person of a epic: made by the DM and set in the land of the step that sends the party to them. */
export interface TalePerson {
  name: string;
  /** A word that picks the look they wear from the world's people ("monk", "smith"); any look if none fits. */
  look?: string;
  /** What they say to anyone who talks to them (1 to 4 short lines), once they have been made. */
  lines: string[];
}

export interface EpicTemplate {
  id: string;
  title: string;
  /** One line to choose it by. */
  tagline: string;
  /** How hard it is on its own, 1 (a stroll) to 5 (a trial). */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** What the DM says as it begins and as it ends. */
  opening: string;
  ending: string;
  steps: EpicStep[];
  /** The epic's people by key (only a epic with `meet` steps has any). They are made in a live world only. */
  people?: Record<string, TalePerson>;
}

/** The lands of a world, as a saga needs to see them. */
export interface ZoneGraph {
  /** The lands next to one (walkable from it). */
  neighbours(zone: string): string[];
  /** Is it open country (not a shop or a room)? Sagas are only set in open country. */
  open(zone: string): boolean;
}

export interface EpicPlan {
  epic: EpicTemplate;
  /** The land each step is set in. */
  zones: string[];
}

export interface Gauge {
  /** 1 (a stroll) to 5 (a trial). */
  difficulty: number;
  length: 'Short' | 'Medium' | 'Long' | 'Grand';
  steps: number;
  /** Different lands it passes through. */
  lands: number;
  /** About how long it takes to play, in minutes. */
  minutes: number;
}

/** Rough minutes for one quest of each kind, and for walking between two lands. */
const MINUTES: Record<StepKind, number> = { hunt: 4, gather: 5, find: 6, visit: 3, meet: 2 };
const TRAVEL = 1.5;

const hash = (s: string): number => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11);

/** Lands by distance from `start` through open country (index = number of lands crossed), nearest first. */
export function layers(graph: ZoneGraph, start: string): string[][] {
  const out: string[][] = [[start]];
  const seen = new Set([start]);
  for (let d = 0; out[d]!.length; d++) {
    const next: string[] = [];
    for (const z of out[d]!)
      for (const n of graph.neighbours(z)) {
        if (seen.has(n) || !graph.open(n)) continue;
        seen.add(n);
        next.push(n);
      }
    if (!next.length) break;
    out.push(next);
  }
  return out;
}

/**
 * Put a saga onto the world from `start`: each step in a land `hop` lands away (the farthest there is, if the world is
 * smaller than the saga), never the same land twice running when it could be another. Null when the start is not open
 * country (a saga is not told in a shop).
 */
export function planEpic(epic: EpicTemplate, start: string, graph: ZoneGraph, seed = 0): EpicPlan | null {
  if (!graph.open(start)) return null;
  const rings = layers(graph, start);
  const zones: string[] = [];
  epic.steps.forEach((step, i) => {
    const ring = rings[Math.min(step.hop, rings.length - 1)]!;
    const options = ring.length > 1 ? ring.filter((z) => z !== zones[i - 1]) : ring;
    zones.push(options[hash(`${seed}${epic.id}${i}`) % options.length]!);
  });
  return { epic, zones };
}

/** How hard, how long and how far a planned saga is. */
export function gauge(plan: EpicPlan): Gauge {
  const { epic, zones } = plan;
  const lands = new Set(zones).size;
  let minutes = 0;
  epic.steps.forEach((s, i) => {
    minutes += MINUTES[s.kind];
    if (i > 0 && zones[i] !== zones[i - 1]) minutes += TRAVEL;
  });
  minutes = Math.round(minutes);
  const difficulty = Math.max(
    1,
    Math.min(5, epic.difficulty + (lands >= 4 ? 1 : 0) - (lands <= 1 && epic.difficulty > 1 ? 1 : 0)),
  );
  const length = minutes < 14 ? 'Short' : minutes < 26 ? 'Medium' : minutes < 40 ? 'Long' : 'Grand';
  return { difficulty, length, steps: epic.steps.length, lands, minutes };
}

/** "★★★☆☆". */
export const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n);

/** The gauge as the DM reads it on a button: "★★★☆☆ · Long · 5 steps · 4 lands · ~30 min". */
export function gaugeText(g: Gauge): string {
  return `${stars(g.difficulty)} · ${g.length} · ${g.steps} steps · ${g.lands} ${g.lands === 1 ? 'land' : 'lands'} · ~${g.minutes} min`;
}

/** What a finished saga pays each player on top of its steps, by its size and difficulty. */
export function epicReward(plan: EpicPlan): { xp: number; gold: number } {
  const g = gauge(plan);
  return { xp: 40 * g.steps * g.difficulty, gold: 15 * g.steps * g.difficulty };
}

/** A step's line for the party, with the lands named in. */
export function tellStep(step: EpicStep, area: string, from: string): string {
  return step.tell.replace('{area}', area).replace('{from}', from || area);
}

/**
 * The sagas a start can tell, planned, easiest and shortest first. `epics` are the content's (content/epics.json); `people` says whether this world can make people (a live world), without which a saga with people is left out.
 */
export function epicsFrom(
  start: string,
  graph: ZoneGraph,
  seed = 0,
  epics: EpicTemplate[] = [],
  people = false,
): { plan: EpicPlan; gauge: Gauge }[] {
  return epics
    .filter((e) => people || !needsPeople(e))
    .flatMap((e) => {
      const plan = planEpic(e, start, graph, seed);
      return plan ? [{ plan, gauge: gauge(plan) }] : [];
    })
    .sort((a, b) => a.gauge.difficulty - b.gauge.difficulty || a.gauge.minutes - b.gauge.minutes);
}

/** Does the saga send the party to people? Those can only be told where the DM can make people. */
export const needsPeople = (e: EpicTemplate): boolean => e.steps.some((s) => s.kind === 'meet');

// --- epics as data ---

export const MAX_STEPS = 8;
export const MAX_SAYS = 3;
export const MAX_SAY = 150;
export const MAX_ITEM = 40;
const KINDS: StepKind[] = ['hunt', 'gather', 'find', 'visit', 'meet'];
const ID = /^[a-z][a-z0-9_]{1,31}$/;
const KEY = /^[a-z][a-z0-9_]{0,15}$/;

const words = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null;
const list = (v: unknown, min: number, max: number, each: number): string[] | null =>
  Array.isArray(v) && v.length >= min && v.length <= max && v.every((l) => words(l, each) !== null)
    ? v.map((l: string) => l.trim())
    : null;

/**
 * A epic as data (a JSON file of the content, or one an AI wrote), checked as strictly as the page checks a world: the
 * parsed epic, or the first thing wrong with it. Nothing in a epic names a content id: lands are hops from where it
 * starts, people have a name and a look hint, and a step is one of the DM's quest kinds or a meeting.
 */
export function parseEpic(raw: unknown): EpicTemplate | string {
  if (typeof raw !== 'object' || raw === null) return 'a epic is an object';
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : null;
  if (!id) return 'id: lowercase letters, digits and _, 2 to 32 long';
  const title = words(r.title, 40);
  const tagline = words(r.tagline, 100);
  const opening = words(r.opening, 230);
  const ending = words(r.ending, 230);
  if (!title || !tagline || !opening || !ending)
    return `${id}: a title, tagline, opening and ending (short) are needed`;
  const difficulty = r.difficulty;
  if (!Number.isInteger(difficulty) || (difficulty as number) < 1 || (difficulty as number) > 5)
    return `${id}.difficulty: a whole number 1 to 5`;
  const people: Record<string, TalePerson> = {};
  if (r.people !== undefined) {
    if (typeof r.people !== 'object' || r.people === null || Array.isArray(r.people)) return `${id}.people: an object`;
    for (const [key, p] of Object.entries(r.people)) {
      const q = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
      const name = words(q.name, 32);
      const lines = list(q.lines, 1, 4, 140);
      const look = q.look === undefined ? undefined : words(q.look, 20);
      if (!KEY.test(key) || !name || !lines || look === null)
        return `${id}.people.${key}: a name (32), lines (1 to 4 of 140), maybe a look word`;
      people[key] = { name, lines, ...(look ? { look } : {}) };
    }
  }
  if (!Array.isArray(r.steps) || r.steps.length < 2 || r.steps.length > MAX_STEPS)
    return `${id}.steps: 2 to ${MAX_STEPS} steps`;
  const met = new Set<string>();
  const steps: EpicStep[] = [];
  for (const [i, raw] of r.steps.entries()) {
    const at = `${id}.steps[${i}]`;
    const q = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const kind = KINDS.find((k) => k === q.kind);
    const tell = words(q.tell, 230);
    const hop = q.hop;
    if (!kind || !tell || !Number.isInteger(hop) || (hop as number) < 0 || (hop as number) > 5)
      return `${at}: a kind (${KINDS.join(', ')}), a hop 0 to 5 and a tell (short)`;
    if (kind !== 'meet') {
      if (q.who !== undefined || q.says !== undefined || q.gives !== undefined)
        return `${at}: only a meet step has who, says or gives`;
      steps.push({ kind, hop: hop as number, tell });
      continue;
    }
    const who = typeof q.who === 'string' ? q.who : '';
    const says = list(q.says, 1, MAX_SAYS, MAX_SAY);
    const gives = q.gives === undefined ? undefined : words(q.gives, MAX_ITEM);
    if (!people[who]) return `${at}.who: "${who}" is not one of the epic's people`;
    if (met.has(who)) return `${at}.who: "${who}" is met twice (each person is met once)`;
    if (!says || gives === null) return `${at}: says (1 to ${MAX_SAYS} lines of ${MAX_SAY}) and maybe what they give`;
    met.add(who);
    steps.push({ kind, hop: hop as number, tell, who, says, ...(gives ? { gives } : {}) });
  }
  const unmet = Object.keys(people).filter((k) => !met.has(k));
  if (unmet.length) return `${id}.people: ${unmet.join(', ')} never met`;
  return {
    id,
    title,
    tagline,
    difficulty: difficulty as 1 | 2 | 3 | 4 | 5,
    opening,
    ending,
    steps,
    ...(Object.keys(people).length ? { people } : {}),
  };
}

/** Parse a file of epics (an array): all of them, or the first problem. */
export function parseEpics(raw: unknown): EpicTemplate[] | string {
  if (!Array.isArray(raw)) return 'a file of epics is an array';
  const out: EpicTemplate[] = [];
  for (const t of raw) {
    const epic = parseEpic(t);
    if (typeof epic === 'string') return epic;
    if (out.some((o) => o.id === epic.id)) return `${epic.id}: id used twice`;
    out.push(epic);
  }
  return out;
}
