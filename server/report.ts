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

/** Characters of log the analyst is given (about 15k tokens), and the repo file's own appendix. */
export const BUDGET = 60_000;
export const APPENDIX_BUDGET = 16_000;
/** What the digest's own headings and its note of what was left out take, in characters. */
const OVERHEAD = 400;
/** The length of a block of the game's timeline, in seconds. */
export const BLOCK = 300;

/** Cut what must not reach a public repo: links, email addresses, long digit runs (a phone number), a name given away. */
export function redact(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, '[email]')
    .replace(/\+?\d[\d ().-]{6,}\d/g, '[number]');
}

/** `redact`, and one line (a player's words, a log entry). */
export const scrub = (text: string): string => redact(text).replace(/\s+/g, ' ').trim();

const pctOf = (n: number) => `${Math.round(n * 100)}%`;
const clip = (e: ReportEntry) =>
  `${stamp(e.t)} ${e.state.who} ${e.kind}: ${e.kind === 'said' ? `"${scrub(e.text)}"` : scrub(e.text)}`;

/** The state in one bracket: who and how they were, where, what the party was doing. */
function brief(e: ReportEntry): string {
  const s = e.state;
  const band = s.detail?.place.band ? ` levels ${s.detail.place.band[0]}\u2013${s.detail.place.band[1]}` : '';
  return `[lv${s.level} hp ${s.hp}/${s.maxHp}, ${s.area} (${s.at[0]},${s.at[1]})${band}, quest: ${s.quest ?? 'none'}, party ${s.party.size} avg ${pctOf(s.party.avgHp)} lowest ${pctOf(s.party.lowest)}${s.stall ? `, stalled ${s.stall}s` : ''}${s.breather ? ', in a breather' : ''}]`;
}

/** One entry as lines for the analyst: the words (`how` 'words'), plus a bracket of state ('brief'), or the whole state ('full'). */
export function lineOf(e: ReportEntry, how: 'words' | 'brief' | 'full' = 'full'): string {
  if (how === 'words') return clip(e);
  const d = e.state.detail;
  if (how === 'brief' || !d) return `${clip(e)}\n    ${brief(e)}`;
  const s = e.state;
  const { hero: h, fight: f, place } = d;
  const by =
    Object.entries(f.by)
      .map(([k, n]) => `${k} x${n}`)
      .join(', ') || 'no one';
  const foes = d.foes.map(
    (x) =>
      `${x.name} x${x.count} (${x.near} near) hp ${x.maxHp} atk ${x.attack} def ${x.defense} xp ${x.xp}: ` +
      `${x.blows} blows to fell it, ${x.hits} hits to fell the hero [${x.verdict}; a typical hero of this level: ${x.typical}]`,
  );
  return [
    clip(e),
    `    hero: lv${s.level} hp ${s.hp}/${s.maxHp} mp ${h.mp}/${h.maxMp}, blow ${h.power} (${h.attack}+${h.attackGear} gear), armor ${h.armor} (${h.defense}+${h.defenseGear} gear), magic ${h.magic}, ${h.weapon}${h.worn.length ? ` + ${h.worn.join(', ')}` : ', nothing else worn'}, healing items ${h.potions}, food ${h.food} water ${h.water}, gold ${h.gold}, xp ${h.xp[0]}/${h.xp[1]}${h.skills.length ? `, skills ${h.skills.join(', ')}` : ''}`,
    `    fights: knocked out ${f.downs}x (${f.downsHere} in this zone), the party killed ${f.killsHere} here (${f.kills} in all); last 60s: took ${f.taken} damage in ${f.hitsTaken} hits (${by}), the party dealt ${f.dealt}${f.lastHurtBy ? `; last hurt by ${f.lastHurtBy.foe} ${f.lastHurtBy.ago}s ago` : ''}; DM pressure ${f.pressure}`,
    `    where: ${s.area} (${s.at[0]},${s.at[1]})${place.band ? ` levels ${place.band[0]}\u2013${place.band[1]}` : ''}, ${place.alive} of ${place.total} foes alive; quest: ${s.quest ?? 'none'}; party ${s.party.size} avg ${pctOf(s.party.avgHp)} lowest ${pctOf(s.party.lowest)}; stalled ${s.stall}s${s.breather ? '; in a breather' : ''}`,
    `    foes in the zone: ${foes.join(' | ') || 'none alive'}`,
    s.recent.length ? `    just before: ${s.recent.map(scrub).join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The game in blocks of `BLOCK` seconds, one line each, for the whole length of the game however long it was: where the
 * party was, the levels, what the director offered (counted, not listed), knockouts, quests, breathers, how often players
 * spoke. This is what keeps a three-hour campaign readable: the passive entries live here, as counts.
 */
export function blocks(entries: readonly ReportEntry[]): string[] {
  const by = new Map<number, ReportEntry[]>();
  for (const e of entries) {
    const k = Math.floor(e.t / BLOCK);
    by.set(k, [...(by.get(k) ?? []), e]);
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, list]) => {
      const count = (f: (e: ReportEntry) => boolean) => list.filter(f).length;
      const tally = (kind: ReportEntry['kind'], key: (e: ReportEntry) => string) => {
        const m = new Map<string, number>();
        for (const e of list.filter((x) => x.kind === kind))
          m.set(
            key(e),
            (m.get(key(e)) ?? 0) +
              1 +
              (/\(\+(\d+) repeats/.exec(e.text)?.[1] ? Number(/\(\+(\d+) repeats/.exec(e.text)![1]) : 0),
          );
        return [...m].map(([n, c]) => `${n} x${c}`).join(', ');
      };
      const areas = [...new Set(list.map((e) => e.state.area))].join(' > ');
      const levels = `${list[0]!.state.level}\u2192${list.at(-1)!.state.level}`;
      const parts = [
        `${stamp(k * BLOCK)}-${stamp((k + 1) * BLOCK)}`,
        areas,
        `lv ${levels}`,
        `party hp ${pctOf(Math.min(...list.map((e) => e.state.party.avgHp)))}-${pctOf(Math.max(...list.map((e) => e.state.party.avgHp)))}`,
        tally('signal', (e) => e.text.replace(/ \(\+\d+ repeats since\)/, '')) &&
          `nudges: ${tally('signal', (e) => e.text.replace(/ \(\+\d+ repeats since\)/, ''))}`,
        count((e) => e.kind === 'down') &&
          `knocked out x${count((e) => e.kind === 'down')} (${tally('down', (e) => e.state.area)})`,
        count((e) => e.kind === 'quest') &&
          `quests: ${list
            .filter((e) => e.kind === 'quest')
            .map((e) => scrub(e.text))
            .join('; ')}`,
        count((e) => e.kind === 'breather') && `breathers x${count((e) => e.kind === 'breather')}`,
        count((e) => e.kind === 'said' || e.kind === 'ask' || e.kind === 'note') &&
          `players spoke x${count((e) => e.kind === 'said' || e.kind === 'ask' || e.kind === 'note')}`,
      ];
      return parts.filter(Boolean).join(' \u00b7 ');
    });
}

/**
 * The log as the analyst reads it, kept to `budget` characters however long the game: first the whole game in blocks, then
 * what players said or asked and every knockout, in order, with the state then. When that is too long the oldest knockouts
 * lose their detail first, then asks and notes, then (last) the players' own words lose theirs; whatever is cut is counted.
 * `full: false` keeps the state to a bracket (for the file's own appendix).
 */
export function digest(entries: readonly ReportEntry[], budget = BUDGET, full = true): string {
  const blockLines = blocks(entries);
  const RANK = { full: 0, brief: 1, words: 2, gone: 3 } as const;
  type Level = keyof typeof RANK;
  const how = new Map<ReportEntry, Level>();
  const picked = entries.filter((e) => e.kind === 'said' || e.kind === 'ask' || e.kind === 'note' || e.kind === 'down');
  for (const e of picked) how.set(e, full ? 'full' : 'brief');
  const size = () =>
    OVERHEAD +
    blockLines.join('\n').length +
    [...how].reduce((n, [e, h]) => n + (h === 'gone' ? 0 : lineOf(e, h).length + 1), 0);
  // Demote the least valuable first, oldest first (a knockout, then an ask or a tap, then the players' own words), one step at
  // a time across all of them: full -> brief -> words -> gone. What the players said is the last to lose anything.
  const worth = (e: ReportEntry) => (e.kind === 'down' ? 0 : e.kind === 'said' ? 2 : 1);
  const order = [...picked].sort((a, b) => worth(a) - worth(b) || a.t - b.t);
  for (const step of ['brief', 'words', 'gone'] as const)
    for (const e of order) {
      if (size() <= budget) break;
      const now = how.get(e)!;
      if (RANK[step] > RANK[now]) how.set(e, step);
    }
  const gone = [...how.values()].filter((h) => h === 'gone').length;
  return [
    "THE GAME IN 5-MINUTE BLOCKS (the director's nudges are counted here, not listed):",
    ...blockLines,
    '',
    'WHAT PLAYERS SAID, ASKED AND TAPPED, AND EVERY KNOCKOUT, IN ORDER (each with the state of the game then):',
    ...picked.flatMap((e) => {
      const h = how.get(e)!;
      return h === 'gone' ? [] : [lineOf(e, h)];
    }),
    gone ? `(${gone} older entr${gone === 1 ? 'y' : 'ies'} left out for length)` : '',
  ]
    .filter((l, i, all) => l !== '' || all[i - 1] !== '')
    .join('\n');
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
    'THE HOST LOG, as a digest of the whole game (blocks of the evening, then what players said and who fell, with the state of the game each time):',
    digest(entries),
    '',
    'WHERE THINGS ARE IN THE REPO:',
    REPO_MAP,
    '',
    'HOW TO READ THE NUMBERS: a player\'s words ("too easy", "too hard", "boring", "lost") are a claim; test it against the state ' +
      'beside it. The foes line says, for this player as they really are, how many blows they need to fell each kind of foe and how ' +
      'many hits it needs to fell them, with a verdict (deadly, slog, hard, fair, easy, trivial) and the same for a typical hero of ' +
      "their level: a verdict that differs means their gear or stats are off the curve, not the foe. Weigh the zone's level band, " +
      'how many foes are alive, knockouts here, damage taken and dealt in the last minute and what the DM pressure was. Say plainly ' +
      'when the numbers support the claim, when they contradict it (then it is a feel or clarity problem), and when the log cannot tell.',
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
  return ['', '## Log', '', '```', digest(entries, APPENDIX_BUDGET, false), '```', ''].join('\n');
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
