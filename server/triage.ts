// The after-the-game Jev workflow: triage. The live pass (host.ts, tag.ts) tagged what players said while they played; this
// reads the whole game once more and ranks what matters. It (1) tags the words the live pass left out or was unsure of,
// (2) finds hotspots in the state itself, without anyone having said a word (knockouts piling up in one area, nudges
// repeating, long stalls), (3) clusters words and hotspots that are about the same thing (kind and area), and (4) checks
// each complaint against the numbers beside it (a player who says "too easy" while the foe next to them is `deadly` is a
// finding about feel or clarity, not about the foe). The result is a short, ranked list of findings with their evidence:
// the small digest the analyst (report.ts) writes up. Pure rules plus a `Tagger`; the clustering and the ranking are code,
// so they are tested and never a model's mood.

import { COMPLAINTS, FEEDBACK_KINDS, type FeedbackKind, type Tag } from '../src/systems/feedback';
import type { ReportEntry } from '../src/systems/reportLog';
import { scrub } from './report';
import { TAGGED, tagEntry, type Tagger } from './tag';

export interface Finding {
  id: string;
  kind: FeedbackKind;
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

/** What was found about the whole game. */
export interface Triage {
  findings: Finding[];
  /** What players liked, in their words. */
  praise: string[];
}

/** The most findings kept, and how many entries are tagged at once. */
export const MAX_FINDINGS = 8;
export const TAG_PARALLEL = 4;
/** A tag below this is read again by triage's tagger (a canned ask or a face is never re-read). */
export const RETAG_BELOW = 0.6;

/** A signal of something wrong, before it is clustered. */
interface Raw {
  kind: FeedbackKind;
  area: string;
  foe: string | null;
  severity: number;
  entry: number;
  player: string | null;
  quote?: string;
  why?: string;
}

/** What a verdict says against a claim: "too easy" is contradicted by a hard fight, "too hard" by an easy one. */
const CONTRADICTS: Partial<Record<FeedbackKind, string[]>> = {
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
    const map: Record<string, FeedbackKind | undefined> = { struggle: 'too_hard', easy: 'too_easy', lost: 'confusing' };
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
    (e) => e.state.stall >= LONG_STALL && e.kind !== 'breather',
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
function checkAgainstNumbers(e: ReportEntry, kind: FeedbackKind): string | null {
  const foe = nearFoe(e);
  if (!foe || !(kind === 'too_easy' || kind === 'too_hard')) return null;
  const facts = `${foe.name}: ${foe.blows} blows to fell it, ${foe.hits} hits to fell ${e.state.who} [${foe.verdict}; a typical hero: ${foe.typical}]`;
  return CONTRADICTS[kind]?.includes(foe.verdict)
    ? `${e.state.who} said it was ${kind.replace('_', ' ')}, but the numbers say otherwise (${facts}): a feel or clarity problem, or gear off the curve`
    : `the numbers agree with ${e.state.who} (${facts})`;
}

/** Tag, in parallel batches, every entry of a player's words that the live pass left untagged or was unsure of. */
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
        if (t) tags.set(i, t);
      }),
    );
  }
  return tags;
}

/** The ranked findings of a game. Never rejects: a tagger that fails is replaced by the keyword rules. */
export async function triage(entries: readonly ReportEntry[], tagger: Tagger): Promise<Triage> {
  const tags = await retag(entries, tagger);
  const raws: Raw[] = [];
  const praise: string[] = [];
  const checks = new Map<number, string>();
  for (const [i, tag] of tags) {
    const e = entries[i]!;
    if (tag.kind === 'praise') {
      if (e.kind === 'said') praise.push(scrub(e.text));
      continue;
    }
    if (tag.kind === 'other' && tag.severity < 1) continue;
    const foe = nearFoe(e)?.name ?? null;
    raws.push({
      kind: tag.kind,
      area: e.state.area,
      foe,
      severity: tag.severity,
      entry: i,
      player: e.state.who === '-' ? null : e.state.who,
      ...(e.kind === 'said' ? { quote: scrub(e.text) } : {}),
    });
    const check = checkAgainstNumbers(e, tag.kind);
    if (check) checks.set(i, check);
  }
  raws.push(...hotspots(entries));

  const clusters = new Map<string, Raw[]>();
  for (const r of raws) clusters.set(`${r.kind}|${r.area}`, [...(clusters.get(`${r.kind}|${r.area}`) ?? []), r]);
  const findings: Finding[] = [...clusters.values()].map((list) => {
    const first = list[0]!;
    const foes = list.map((r) => r.foe).filter((f): f is string => !!f);
    const foe =
      [...new Set(foes)].sort((a, b) => foes.filter((f) => f === b).length - foes.filter((f) => f === a).length)[0] ??
      null;
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
      foe,
      severity,
      count,
      players,
      score: Math.round(weight * (1 + Math.log2(count)) * (1 + 0.25 * Math.max(0, players.length - 1)) * 100) / 100,
      quotes: [...new Set(list.map((r) => r.quote).filter((q): q is string => !!q))].slice(0, 4),
      evidence,
      why,
    };
  });
  findings.sort((a, b) => b.score - a.score || FEEDBACK_KINDS.indexOf(a.kind) - FEEDBACK_KINDS.indexOf(b.kind));
  const kept = findings.slice(0, MAX_FINDINGS).map((f, i) => ({ ...f, id: `F${i + 1}` }));
  return { findings: kept, praise: praise.slice(0, 5) };
}

/** Is this kind a complaint (what a report calls a problem rather than a wish or a compliment)? */
export const isProblem = (f: Finding): boolean => COMPLAINTS.includes(f.kind);
