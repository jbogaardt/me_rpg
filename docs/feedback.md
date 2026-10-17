# Feedback: how a game reports itself

Read before touching `DmReport.ts`, `systems/reportLog.ts`, `systems/feedback.ts`, `systems/breather.ts` or `server/report.ts`,
`triage.ts`, `tag.ts`. How a run is read and fixed is in `docs/playtests.md`; the bot is in `server/README.md`.

## What players report without trying (the host's notebook and `reports/`)

Nobody fills in a form: a menu for reporting would never be used. The host writes down, on its own, **what each player
says to the DM** (their own words from the 💬 line, a canned ask such as "This is too hard", a tapped face on the breather
badge) **and what the game did around it** (the director's nudges, knockouts, quests ending, breathers), each with **the
state of the game at that moment**, as much as it takes to judge the complaint: who (P1, P2...), the hero as they really
are (blow and armour with gear, health, mana, supplies, gold, xp), how fighting has gone (knockouts here and in all, damage
taken and dealt in the last minute and by whom, who hurt them last, the DM's pressure), the zone (its level band, foes alive),
and **each kind of foe in it as this player fights it**: blows to fell it, hits for it to fell them, a verdict (deadly to
trivial) and the same for a typical hero of their level, so "too easy" can be checked against the numbers. Plus where, the
quest, the party, how long since anything progressed and the last events (`DmReport`, `systems/reportLog.ts`).

**Long campaigns stay small.** Only what a player said, asked or tapped, and each knockout, carry that whole state (about 1 KB
each, and rare). What the game did by itself (a nudge, a quest end, a breather) is noted lean (about 250 bytes), and a
nudge of the same kind is noted once every two minutes with a count of the repeats. The analyst is never given the raw
log: it reads a digest kept to a character budget however long the game (`digest` in `server/report.ts`): the whole game in
5-minute blocks (where the party was, levels, nudges counted, knockouts, quests, breathers, how often players spoke), then what
players said and every knockout in order. If that is too long the oldest knockouts lose their detail first, then asks and taps,
and the players' own words last, with a count of what was left out. The full raw log stays in `reports/raw/`.

**Two Jev workflows share one vocabulary** (`systems/feedback.ts`: bug, too hard, too easy, confusing, pace, request, praise,
other, with a severity of 0 to 3). *In the game* the bot tags every utterance as it arrives (a canned ask or a tapped face says
what it is; words go to Jev, or to keyword rules without a key) and keeps the tag on the entry. A vague complaint (a short
one, a sure tag) is asked back by the DM, privately and once in a while, with a canned line ("which foe, and where?"); the tag
never changes the world. The bot also keeps the table read it already makes (pressure, stalled) as an *engagement curve*, one
line per block. *After the game* triage (`server/triage.ts`) tags what the live pass left out or was unsure of, finds hotspots
in the state itself (knockouts piling up, repeated nudges, long stalls, heroes under a zone's band), clusters them by kind and
area, tests each "too easy"/"too hard" against the numbers beside it, and ranks the findings in code. The analyst is given
those findings with their evidence, the small digest, not the log. Entries go to the
host's console as `[report]` lines, and the DM bot collects them (`DmBot.reports`).

When a game ends (everyone leaves, or the bot is stopped) the bot has Haiku read the log as a playtest analyst
(`server/report.ts`) and writes `reports/<date>-<code>.md`: findings ranked, each with the players' words and the state
they were in, where in the repo to look, and a prompt to start the next session with (rules alone if no model answers, or
`DM_BOT_REPORT=plain`). Raw entries stay in `reports/raw/` (not committed). **Read a report before committing it**: it
quotes what players typed, so players are P1, P2 and links, emails and long numbers are cut. A session starts from the
newest report: take its findings in order, reproduce, fix, test. Solo play has no bot, so only the console lines exist.

A **breather** (`systems/breather.ts`) is the pause after a quest, said out loud: a 🍺 badge with a clock and three faces at
the left of the screen (`hud/BreatherBadge.ts`) and one line from the DM (`BREATHER_WORDS`); the director leaves the same
minute before it offers the next quest. It is local to each page, started by the quest each already sees end (a saga's
middle step is no lull). A tapped face is the lightest report there is: a guest's travels to the host as a note (protocol 55).
Lanternrest's tavern, the Resting Lantern, is where a party spends it.
