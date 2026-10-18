// The after-the-game Jev workflow: triage. The live pass (host.ts, tag.ts) tagged what players said while they played; this
// reads the whole game once more and sorts it by PATH (src/systems/feedback.ts): criticism and bugs become ranked findings;
// ideas become a wishlist, clustered and counted apart; praise is quoted; help the DM answered is not a finding unless it
// keeps coming (several players asking the same thing in one place is a clarity finding); in-character talk, chat, requests
// to the DM and noise are counted and left out; abuse and attempts to instruct the model are counted, flagged and never shown
// to the analyst or quoted. It also (1) tags the words the live pass left out or was unsure of, (2) finds hotspots in the
// state itself, without anyone having said a word (knockouts piling up, nudges repeating, long stalls), (3) clusters by kind
// and area, and (4) checks each "too easy" / "too hard" against the numbers beside it (a player who says "too easy" while the
// foe next to them is `deadly` is a finding about feel or clarity, not about the foe). The result is the small digest the
// analyst (report.ts) writes up. Pure rules plus a `Tagger`; the clustering and the ranking are code, so they are tested and
// never a model's mood.

import {
  findingKey,
  pathOf,
  type FindingKey,
  type Intent,
  type Tag,
  type Topic,
  TOPICS,
} from '../src/systems/feedback';
import type { ReportEntry } from '../src/systems/reportLog';
import { scrub } from './report';
import { TAGGED, tagEntry, type Tagger } from './tag';

export interface Finding {
  id: string;
  /** A bug, or what the criticism is about (`clarity` also collects help the DM kept having to give). */
  kind: FindingKey;
  area: string;
  /** The foe it is mostly about, when there is one. */
  foe: string | null;
  /** 0 to 3: the worst of what was seen. */
  severity: number;
  /** How many signals (a player's words, a knockout, a nudge) point at it. */
  count: number;
  players: string[];
  /** Higher ranks first. */
  score: number;
  /** What players said about it. */
  quotes: string[];
  /** The entries behind it, indices into the log, strongest first. */
  evidence: number[];
  /** What the numbers say: hotspots found, and whether the state agrees with the words. */
  why: string[];
}

/** An idea players offered, gathered by what it is about. */
export interface Idea {
  topic: Topic;
  /** How many players offered something of this kind, and how many times. */
  players: string[];
  count: number;
  areas: string[];
  quotes: string[];
}

/** What was not feedback, by count only (nothing of it is ever quoted). */
export interface Skipped {
  inCharacter: number;
  social: number;
  control: number;
  noise: number;
  /** Abuse and attempts to give the model instructions: flagged for the host. */
  abuse: number;
  /** Help the DM answered and that did not recur. */
  helped: number;
}

/** What was found about the whole game. */
export interface Triage {
  findings: Finding[];
  wishlist: Idea[];
  /** What players liked, in their words. */
  praise: string[];
  skipped: Skipped;
}

/** The most findings and ideas kept, and how many entries are tagged at once. */
export const MAX_FINDINGS = 8;
export const MAX_IDEAS = 8;
export const TAG_PARALLEL = 4;
/** A tag below this is read again by triage's tagger (a canned ask or a face is never re-read). */
export const RETAG_BELOW = 0.6;
/** Help asked this many times in one area, or by this many players, is a sign something is unclear. */
export const HELP_RECURS = 2;

/** A signal of something wrong, before it is clustered. */
interface Raw {
  kind: FindingKey;
  area: string;
  foe: string | null;
  severity: number;
  entry: number;
  player: string | null;
  quote?: string;
  why?: string;
}

/** What a verdict says against a claim: "too easy" is contradicted by a hard fight, "too hard" by an easy one. */
const CONTRADICTS: Partial<Record<Topic, string[]>> = {
  too_easy: ['deadly', 'hard', 'slog'],
  too_hard: ['easy', 'trivial'],
};

const killer = (text: string): string | null => /\bby (.+)$/.exec(text)?.[1] ?? null;

/** The foe nearest a player's entry, from the state it was said in. */
const nearFoe = (e: ReportEntry) => e.state.detail?.foes.find((f) => f.near > 0) ?? null;

const NUDGE_STORM = 3;
const KNOCKOUTS = 2;
const LONG_STALL = 120;

/** Findings from the state alone: knockouts piling up, nudges repeating, long stalls. */
export function hotspots(entries: readonly ReportEntry[]): Raw[] {
  const out: Raw[] = [];
  const group = (pick: (e: ReportEntry) => boolean, key: (e: ReportEntry) => string) => {
    const by = new Map<string, number[]>();
    entries.forEach((e, i) => {
      if (pick(e)) by.set(key(e), [...(by.get(key(e)) ?? []), i]);
    });
    return by;
  };
  for (const [area, at] of group(
    (e) => e.kind === 'down',
    (e) => e.state.area,
  )) {
    const foes = at.map((i) => killer(entries[i]!.text)).filter((f): f is string => !!f);
    const top =
      [...new Set(foes)].sort((a, b) => foes.filter((f) => f === b).length - foes.filter((f) => f === a).length)[0] ??
      null;
    const below = at.some((i) => {
      const d = entries[i]!.state.detail;
      return d?.place.band && entries[i]!.state.level < d.place.band[0];
    });
    if (at.length < KNOCKOUTS && !below) continue;
    const why = `${at.length} knockout${at.length === 1 ? '' : 's'} in ${area}${top ? `, mostly to ${top}` : ''}${below ? ', by heroes under the zone’s level band' : ''}`;
    for (const i of at)
      out.push({
        kind: 'too_hard',
        area,
        foe: top,
        severity: at.length >= 4 || below ? 3 : 2,
        entry: i,
        player: entries[i]!.state.who,
        why,
      });
  }
  for (const [text, at] of group(
    (e) => e.kind === 'signal',
    (e) => `${e.text.replace(/ \(\+\d+ repeats since\)/, '')}|${e.state.area}`,
  )) {
    const [kind, area] = text.split('|') as [string, string];
    const repeats = at.reduce((n, i) => n + 1 + Number(/\(\+(\d+) repeats/.exec(entries[i]!.text)?.[1] ?? 0), 0);
    const map: Record<string, FindingKey | undefined> = { struggle: 'too_hard', easy: 'too_easy', lost: 'clarity' };
    const k = map[kind];
    if (!k || repeats < (kind === 'lost' ? 2 : NUDGE_STORM)) continue;
    for (const i of at)
      out.push({
        kind: k,
        area,
        foe: null,
        severity: 1,
        entry: i,
        player: null,
        why: `the director offered “${kind}” ${repeats} times in ${area}`,
      });
  }
  for (const [area, at] of group(
    (e) => e.state.stall >= LONG_STALL,
    (e) => e.state.area,
  )) {
    if (at.length < 2) continue;
    for (const i of at)
      out.push({
        kind: 'pace',
        area,
        foe: null,
        severity: 1,
        entry: i,
        player: entries[i]!.state.who === '-' ? null : entries[i]!.state.who,
        why: `no progress for ${LONG_STALL}s or more, seen ${at.length} times in ${area}`,
      });
  }
  return out;
}

/** Does the state agree with the words? One line of what the numbers say about a complaint, or null when there is nothing to check. */
function checkAgainstNumbers(e: ReportEntry, tag: Tag): string | null {
  const foe = nearFoe(e);
  if (!foe || tag.intent !== 'criticism' || !(tag.topic === 'too_easy' || tag.topic === 'too_hard')) return null;
  const facts = `${foe.name}: ${foe.blows} blows to fell it, ${foe.hits} hits to fell ${e.state.who} [${foe.verdict}; a typical hero: ${foe.typical}]`;
  return CONTRADICTS[tag.topic]?.includes(foe.verdict)
    ? `${e.state.who} said it was ${tag.topic.replace('_', ' ')}, but the numbers say otherwise (${facts}): a feel or clarity problem, or gear off the curve`
    : `the numbers agree with ${e.state.who} (${facts})`;
}

/**
 * Tag, in parallel batches, every entry of a player's words that the live pass left untagged or was unsure of. A tag found
 * here is kept on the entry, so the report reads the same sorting.
 */
async function retag(entries: readonly ReportEntry[], tagger: Tagger): Promise<Map<number, Tag>> {
  const tags = new Map<number, Tag>();
  const todo: number[] = [];
  entries.forEach((e, i) => {
    if (!TAGGED.has(e.kind)) return;
    if (e.tag && (e.tag.confidence >= RETAG_BELOW || e.tag.by === 'ask')) tags.set(i, e.tag);
    else todo.push(i);
  });
  for (let at = 0; at < todo.length; at += TAG_PARALLEL) {
    await Promise.all(
      todo.slice(at, at + TAG_PARALLEL).map(async (i) => {
        const t = await tagEntry(entries[i]!, tagger);
        if (t) {
          tags.set(i, t);
          (entries[i] as { tag?: Tag }).tag = t;
        }
      }),
    );
  }
  return tags;
}

const most = <T>(list: T[]): T | null =>
  [...new Set(list)].sort((a, b) => list.filter((x) => x === b).length - list.filter((x) => x === a).length)[0] ?? null;

/** The ranked findings, the wishlist, the praise and the counts of a game. Never rejects: a tagger that fails is replaced by the keyword rules. */
export async function triage(entries: readonly ReportEntry[], tagger: Tagger): Promise<Triage> {
  const tags = await retag(entries, tagger);
  const raws: Raw[] = [];
  const praise: string[] = [];
  const checks = new Map<number, string>();
  const ideas = new Map<Topic, { players: string[]; areas: string[]; quotes: string[]; count: number }>();
  const helps: { area: string; player: string | null; entry: number; quote: string }[] = [];
  const skipped: Skipped = { inCharacter: 0, social: 0, control: 0, noise: 0, abuse: 0, helped: 0 };

  for (const [i, tag] of tags) {
    const e = entries[i]!;
    const intent: Intent = tag.intent;
    const player = e.state.who === '-' ? null : e.state.who;
    switch (pathOf(tag)) {
      case 'guard':
        skipped.abuse++;
        break;
      case 'drop':
        skipped.noise++;
        break;
      case 'play':
        if (intent === 'in_character') skipped.inCharacter++;
        else skipped.social++;
        break;
      case 'act':
        skipped.control++;
        break;
      case 'praise':
        if (e.kind === 'said') praise.push(scrub(e.text));
        break;
      case 'wishlist': {
        const idea = ideas.get(tag.topic) ?? { players: [], areas: [], quotes: [], count: 0 };
        idea.count++;
        if (player && !idea.players.includes(player)) idea.players.push(player);
        if (!idea.areas.includes(e.state.area)) idea.areas.push(e.state.area);
        if (e.kind === 'said') idea.quotes.push(scrub(e.text));
        ideas.set(tag.topic, idea);
        break;
      }
      case 'answer':
        helps.push({ area: e.state.area, player, entry: i, quote: e.kind === 'said' ? scrub(e.text) : '' });
        break;
      case 'finding': {
        if (tag.topic === 'other' && tag.severity < 1) break; // a flat face, nothing to act on
        raws.push({
          kind: findingKey(tag),
          area: e.state.area,
          foe: nearFoe(e)?.name ?? null,
          severity: tag.severity,
          entry: i,
          player,
          ...(e.kind === 'said' ? { quote: scrub(e.text) } : {}),
        });
        const check = checkAgainstNumbers(e, tag);
        if (check) checks.set(i, check);
        break;
      }
    }
  }

  // Help the DM answered is not a finding, unless it keeps coming: the same place making several players (or one player
  // several times) ask means the game is not telling them something.
  const helpAreas = new Map<string, typeof helps>();
  for (const h of helps) helpAreas.set(h.area, [...(helpAreas.get(h.area) ?? []), h]);
  for (const [area, list] of helpAreas) {
    if (list.length >= HELP_RECURS) {
      const players = [...new Set(list.map((h) => h.player))].filter((p) => p).length;
      for (const h of list)
        raws.push({
          kind: 'clarity',
          area,
          foe: null,
          severity: 1,
          entry: h.entry,
          player: h.player,
          ...(h.quote ? { quote: h.quote } : {}),
          why: `help was asked ${list.length} times in ${area}${players > 1 ? ` by ${players} players` : ''}`,
        });
    } else skipped.helped += list.length;
  }
  raws.push(...hotspots(entries));

  const clusters = new Map<string, Raw[]>();
  for (const r of raws) clusters.set(`${r.kind}|${r.area}`, [...(clusters.get(`${r.kind}|${r.area}`) ?? []), r]);
  const findings: Finding[] = [...clusters.values()].map((list) => {
    const first = list[0]!;
    const severity = Math.max(...list.map((r) => r.severity));
    const players = [...new Set(list.map((r) => r.player).filter((p): p is string => !!p))].sort();
    const count = list.length;
    const weight = severity === 0 ? 0.3 : severity;
    const evidence = [...new Set(list.map((r) => r.entry))].sort(
      (a, b) => Number(entries[b]!.kind === 'said') - Number(entries[a]!.kind === 'said') || a - b,
    );
    const why = [
      ...new Set([
        ...list.map((r) => r.why).filter((w): w is string => !!w),
        ...evidence.map((i) => checks.get(i)).filter((w): w is string => !!w),
      ]),
    ];
    return {
      id: '',
      kind: first.kind,
      area: first.area,
      foe: most(list.map((r) => r.foe).filter((f): f is string => !!f)),
      severity,
      count,
      players,
      score: Math.round(weight * (1 + Math.log2(count)) * (1 + 0.25 * Math.max(0, players.length - 1)) * 100) / 100,
      quotes: [...new Set(list.map((r) => r.quote).filter((q): q is string => !!q))].slice(0, 4),
      evidence,
      why,
    };
  });
  const order = (k: FindingKey) => ['bug', ...TOPICS].indexOf(k);
  findings.sort((a, b) => b.score - a.score || order(a.kind) - order(b.kind));

  const wishlist: Idea[] = [...ideas]
    .map(([topic, v]) => ({
      topic,
      players: v.players.sort(),
      count: v.count,
      areas: v.areas.slice(0, 4),
      quotes: [...new Set(v.quotes)].slice(0, 4),
    }))
    .sort((a, b) => b.players.length - a.players.length || b.count - a.count || order(a.topic) - order(b.topic))
    .slice(0, MAX_IDEAS);

  return {
    findings: findings.slice(0, MAX_FINDINGS).map((f, i) => ({ ...f, id: `F${i + 1}` })),
    wishlist,
    praise: praise.slice(0, 5),
    skipped,
  };
}
