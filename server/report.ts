// A game's report, from the host's log to a prompt file a future Claude session can act on (the DM bot, at the game's end).
// The page notes what players said to the DM with the state of the game each time (`src/systems/reportLog.ts`); the bot
// collects it, writes it down as it comes (`reports/raw/`, ignored by git) and, when the game ends, asks Haiku (the same
// headless Claude Code as the DM's words, `claude.ts`) to read it as a playtest analyst and write `reports/<date>-<code>.md`:
// findings ranked, each with the players' own words and the state they were in, where in the repo to look and how to check a
// fix, and a prompt to start the next session with. Without a model (not logged in, a failure, a timeout) the same file is
// written from the log by rules, so a game's worth is never lost. The repo is public: players are P1, P2..., links, emails
// and long numbers are cut (`scrub`), and the file says to read it before committing, since it quotes what players typed.

import fs from 'node:fs';
import path from 'node:path';
import { stamp, type ReportEntry } from '../src/systems/reportLog';
import type { Ask } from './claude';

/** What a game's report is about. */
export interface GameInfo {
  code: string;
  started: Date;
  ended: Date;
  /** Why it ended ("everyone left", "the operator stopped the bot"). */
  why: string;
  /** The build the page ran, when known. */
  build?: string;
}

/** The most entries given to the analyst (the latest ones; a game rarely has more worth reading). */
export const MAX_ENTRIES = 160;

/** Cut what must not reach a public repo: links, email addresses, long digit runs (a phone number), a name given away. */
export function redact(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, '[email]')
    .replace(/\+?\d[\d ().-]{6,}\d/g, '[number]');
}

/** `redact`, and one line (a player's words, a log entry). */
export const scrub = (text: string): string => redact(text).replace(/\s+/g, ' ').trim();

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** One entry as a line of the timeline the analyst reads (and the file ends with). */
export function lineOf(e: ReportEntry, withRecent = false): string {
  const s = e.state;
  const near =
    Object.entries(s.near)
      .map(([k, n]) => `${k}x${n}`)
      .join(' ') || 'none';
  const facts =
    `lv${s.level} hp ${s.hp}/${s.maxHp}, ${s.area} (${s.at[0]},${s.at[1]}), quest: ${s.quest ?? 'none'}, ` +
    `party ${s.party.size} avg ${pct(s.party.avgHp)} lowest ${pct(s.party.lowest)}, near: ${near}, stalled ${s.stall}s` +
    (s.breather ? ', in a breather' : '');
  const head = `${stamp(e.t)} ${s.who} ${e.kind}: ${e.kind === 'said' ? `"${scrub(e.text)}"` : scrub(e.text)}`;
  const recent = withRecent && s.recent.length ? `\n    just before: ${s.recent.map(scrub).join(' | ')}` : '';
  return `${head}\n    [${facts}]${recent}`;
}

/** The log as the analyst reads it: the latest `MAX_ENTRIES`, what players said with what led up to it. */
export function timeline(entries: readonly ReportEntry[]): string {
  const kept = entries.slice(-MAX_ENTRIES);
  const talk = new Set(['said', 'ask', 'note', 'down']);
  return kept.map((e) => lineOf(e, talk.has(e.kind))).join('\n');
}

/** The numbers about a game, said plainly (the analyst is given them, and the file opens with them). */
export function facts(game: GameInfo, entries: readonly ReportEntry[]): string[] {
  const count = (kind: ReportEntry['kind']) => entries.filter((e) => e.kind === kind).length;
  const seats = new Set(entries.filter((e) => e.state.who !== '-').map((e) => e.state.who));
  const areas = new Map<string, number>();
  for (const e of entries.filter((x) => x.kind === 'down')) areas.set(e.state.area, (areas.get(e.state.area) ?? 0) + 1);
  const minutes = Math.max(1, Math.round((game.ended.getTime() - game.started.getTime()) / 60000));
  return [
    `${minutes} minute${minutes === 1 ? '' : 's'}, ${seats.size} player${seats.size === 1 ? '' : 's'} heard from (${[...seats].sort().join(', ') || 'none'}); ended: ${game.why}`,
    `players said ${count('said')} thing(s) to the DM, asked ${count('ask')} canned request(s), tapped ${count('note')} note(s)`,
    `the director made ${count('signal')} nudge(s); ${count('down')} knockout(s)${areas.size ? ` (${[...areas].map(([a, n]) => `${a} ${n}`).join(', ')})` : ''}; ${count('quest')} quest end(s); ${count('breather')} breather(s)`,
  ];
}

/** Where things are in the repo, for the analyst to point a future session at (paths of docs that exist). */
export const REPO_MAP = [
  'CLAUDE.md: layers, commands, working procedure',
  'docs/dungeon-master.md: the DM, the director (when cards and breathers come), epics, possession',
  'docs/epics.md and src/systems/dmQuests.ts, dmTasks.ts, dmEpics.ts: quests and sagas',
  'docs/playtests.md: how a run is read and what past runs settled',
  'src/systems/CLAUDE.md: capabilities, balance (heroModel), quests, survival, economy',
  'src/systems/levels.ts and src/content/CLAUDE.md: zone level bands and the gate; content layers',
  'src/systems/dmDirector.ts, src/scenes/overworld/DmPrompts.ts: what the DM is offered, and when',
  'public/content/campaign1/*.json: enemies, items, shops, scenarios (who stands where), biomes',
  'maps/*.ts and tools/map/CLAUDE.md: zone maps and the map pipeline',
  'server/README.md and server/*.ts: the DM bot (router, narrator, epic writer)',
].join('\n');

/** The analyst's standing instruction. */
export const ANALYST_SYSTEM =
  'You are a playtest analyst for a small top-down action RPG with a Dungeon Master. You read the host log of one game and ' +
  'write a markdown prompt file that a future engineer-Claude session will use to improve the game. Be concrete and honest: ' +
  'quote what players said, tie each finding to the game state around it, and never invent facts the log does not show. ' +
  'Write only the markdown asked for, with no preface. Refer to players only as P1, P2...; never include names, links or ' +
  'contact details. Short sentences.';

/** The system prompt and the prompt for the analyst. */
export function analysisPrompt(game: GameInfo, entries: readonly ReportEntry[]): { system: string; prompt: string } {
  const prompt = [
    `Game ${game.code}${game.build ? `, build ${game.build}` : ''}. Facts: ${facts(game, entries).join('; ')}.`,
    '',
    'THE HOST LOG (each line: when, who, what, then the state of the game at that moment):',
    timeline(entries),
    '',
    'WHERE THINGS ARE IN THE REPO:',
    REPO_MAP,
    '',
    'Write the markdown with exactly these sections, in this order:',
    '## Prompt for the next session',
    '(3 to 6 imperative sentences a Claude session can follow: read CLAUDE.md, take the findings in order, reproduce each in the game or a test, change as little as possible, add or adjust tests, run npm run verify.)',
    '## At a glance',
    '(one short paragraph: how the evening went, the mood of the players, the single biggest problem.)',
    '## Findings',
    '(ranked, most important first, at most 6. Each as `### N. Title (severity: high|medium|low)` then bullets: **Players said / did** with quotes; **State** (level, health, area, quest, who was near); **Why it matters**; **Where to look** (paths from the map above); **Suggested change**; **How to check**.)',
    '## What went well',
    '(2 to 4 bullets, only what the log supports.)',
  ].join('\n');
  return { system: ANALYST_SYSTEM, prompt };
}

/** The file's own header: what it is, how it was made, a warning, and the facts. */
export function header(game: GameInfo, entries: readonly ReportEntry[], how: string): string {
  const day = game.started.toISOString().slice(0, 10);
  return [
    `# Playtest report ${day}, game ${game.code}`,
    '',
    `> Written by the DM bot from the host's log (${how}). **Read it before committing:** it quotes what players typed to the DM.`,
    '> Players are P1, P2...; links, emails and long numbers are cut. Raw log: `reports/raw/` (not committed).',
    '',
    ...facts(game, entries).map((f) => `- ${f}`),
    '',
  ].join('\n');
}

/** What the file ends with: the log itself, as read. */
export function appendix(entries: readonly ReportEntry[]): string {
  return ['', '## Log', '', '```', timeline(entries), '```', ''].join('\n');
}

/** The file by rules alone, for when no model could be asked. */
export function plainReport(entries: readonly ReportEntry[]): string {
  const said = entries.filter((e) => e.kind === 'said' || e.kind === 'ask' || e.kind === 'note');
  const hard = entries.filter((e) => e.kind === 'down' || (e.kind === 'signal' && /struggle|lost/.test(e.text)));
  return [
    '## Prompt for the next session',
    '',
    'Read CLAUDE.md and docs/playtests.md. Go through what players said below, then the hard moments, and decide which are',
    'bugs, which are pitching (a zone too hard, a quest unclear) and which are taste. Reproduce each in the game or a test,',
    'change as little as possible, add or adjust tests and run npm run verify. (No model was available to rank these.)',
    '',
    '## What players said',
    '',
    ...(said.length ? said.map((e) => `- ${lineOf(e).replace(/\n\s+/g, ' ')}`) : ['- Nothing was said to the DM.']),
    '',
    '## Hard moments (knockouts and the director seeing the party struggle or lost)',
    '',
    ...(hard.length ? hard.map((e) => `- ${lineOf(e).replace(/\n\s+/g, ' ')}`) : ['- None.']),
    '',
  ].join('\n');
}

/** `reports/2026-10-17-brave-otters.md` under `dir`. */
export function reportPath(dir: string, game: GameInfo): string {
  const day = game.started.toISOString().slice(0, 10);
  return path.join(dir, `${day}-${game.code.replace(/[^\w-]+/g, '-')}.md`);
}

/** Does the analyst's answer look like the file asked for (the sections, and no code fence around it all)? */
export function looksRight(text: string): boolean {
  return ['## Prompt for the next session', '## At a glance', '## Findings'].every((h) => text.includes(h));
}

/**
 * Write a game's report: Haiku's reading when `ask` gives one the file asked for, else the rules' own. Returns the path and
 * which it was. Nothing is written for a game nobody said or did anything in.
 */
export async function writeReport(
  dir: string,
  game: GameInfo,
  entries: readonly ReportEntry[],
  ask: Ask | null,
): Promise<{ path: string; how: 'haiku' | 'plain' } | null> {
  if (!entries.length) return null;
  let body = '';
  if (ask) {
    try {
      const { system, prompt } = analysisPrompt(game, entries);
      const answer = (await ask(system, prompt)).replace(/^```(?:markdown|md)?\n|\n```\s*$/g, '').trim();
      if (looksRight(answer)) body = redact(answer.replace(/[ \t]+$/gm, ''));
    } catch {
      body = ''; // a failure, a slow answer: the rules' file below
    }
  }
  const how = body ? 'haiku' : 'plain';
  const file = reportPath(dir, game);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    file,
    `${header(game, entries, how === 'haiku' ? 'analysed by Haiku' : 'by rules; no model answered')}\n${body || plainReport(entries)}\n${appendix(entries)}`,
  );
  return { path: file, how };
}
