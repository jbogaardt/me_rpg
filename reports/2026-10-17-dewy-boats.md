# Playtest report 2026-10-17, game dewy-boats

> Written by the DM bot from the host's log (analysed by Haiku). **Read it before committing:** it quotes what players typed to the DM.
> Players are P1, P2...; links, emails and long numbers are cut. Raw log: `reports/raw/` (not committed).

- 1439 minutes, 1 player heard from (P3); ended: triaged after the operator stopped the bot
- players said 22 thing(s) to the DM, asked 0 canned request(s), tapped 2 note(s)
- the director made 14 nudge(s); 2 knockout(s) (The Reedmere 2); 12 quest end(s); 0 breather(s)

## Prompt for the next session

Read CLAUDE.md and docs/playtests.md first, then src/systems/CLAUDE.md for the heroModel balance notes. Take the findings below in order, starting with the highest severity. For each one, reproduce the situation in the game or in a test before you change anything. Change as little as possible, and touch only the files the finding names. Add or adjust tests for each change, then run npm run verify and report the result.

## At a glance

Only one player, P3, was heard from. P3 sent 22 messages and tapped two notes. The operator stopped the bot, and the run was triaged after that. The run header reports 1439 minutes, but the timed play below covers 0:00 to 20:00. P3 seemed lost and frustrated for most of it. The quotes are mostly "where" and "what" questions, plus two "bad" notes. The biggest problem is that P3 was knocked out twice in The Reedmere at level 2, by Ash Hound, while the director pressure was "fierce."

## Findings

### 1. Two knockouts in The Reedmere at level 2 (severity: high)

- **Players said / did:** P3 did not say the zone was too hard. P3 said "Can you, can you, can you give me some extra gear?" at 3:27, then went to The Reedmere at 3:29. P3 was knocked out at 3:44 and again at 4:00. The "too hard" label comes from the classifier, which read the "struggle" and "lost" signals.
- **State:** Level 2. HP -6/36 at 3:44 and -5/36 at 4:00. The Reedmere, levels 2–4, with 10 of 11 foes alive. Quest: Gather 3 Marsh Lamps (1/3). In the last 60s the hero took 42 damage in 3 hits. Ash Hound is "hard" for this hero and "hard" for a typical hero of this level, so the gear is on the curve and the foe is the problem. DM pressure was "fierce." The director sent "struggle" at 1:18 and "lost" at 2:50. A revive nudge came in the first five minutes. By 4:07 the hero was back at 36/36 in The Cinder Coast.
- **Why it matters:** A level 2 hero, at the bottom of the zone band, was knocked out twice in one zone while the DM pushed hard. The log does not show whether the player could have avoided the fight.
- **Where to look:** src/systems/levels.ts (The Reedmere band); public/content/campaign1/*.json (Ash Hound and Reedmere placements); src/systems/dmDirector.ts (pressure after "struggle"); src/systems/CLAUDE.md (heroModel).
- **Suggested change:** Check whether Ash Hound and the Reedmere placements suit a level 2 hero. If they do not, adjust the foes or their placement in the scenario files. Check whether pressure should ease after "struggle."
- **How to check:** Run a level 2 hero with the same gear in The Reedmere. Confirm the Ash Hound verdict and the knockout count match the log. Confirm pressure drops after "struggle."

### 2. Late-game feel, and a breather request no DM line answered (severity: medium)

- **Players said / did:** P3 tapped "bad" at 13:33 and again at 17:25. At 17:33 P3 said "Can we skip breather sometimes?" At 18:00 P3 said "You didn't say it. You didn't say anything about what I said last time." The DM lines shown after 17:33 do not mention breathers. The "last time" line probably refers to the 17:33 request, but the log does not say so.
- **State:** At 17:25 P3 was in Hearthmere at level 9, HP 94/94, with 0 foes alive. At 14:32 in The Reedmere at level 7, every foe was "trivial" (2 blows to fell it, 74 hits to fell the hero). In the last minute there, the party dealt 134 damage and took 6. The numbers support "too easy" in the mid-to-late game. P3's words do not say "too easy," and the "bad" notes carry no text. The run recorded 0 breathers.
- **Why it matters:** Breather requests may not reach the DM, and the late game may be too easy for a geared hero. The log cannot say what "bad" meant.
- **Where to look:** docs/dungeon-master.md (breathers and the director); src/scenes/overworld/DmPrompts.ts; src/systems/dmDirector.ts; public/content/campaign1/*.json (enemy stats at levels 7–9); src/systems/levels.ts.
- **Suggested change:** Confirm that a player's breather request gets a DM reply and a breather decision. Review how breathers are triggered. Weigh whether levels 7–9 need more challenge. This is a question to test, not a verdict.
- **How to check:** Send "Can we skip breather" in a test session. Expect a DM reply. Check foe verdicts for a level 9 hero in a Reedmere-like zone.

### 3. Lost on where to go (severity: medium)

- **Players said / did:**
  - "Where are the chickens?" (0:37, The Cinder Coast, level 1)
  - "I just got teleported left and right. What just happened?" (4:07)
  - "You said South, why is it east?" and "Where's Where's the chest?" appear in the summary. Their times and state are not in the shown evidence.
  - "Where's the rift?" (5:18, The Ember Caldera, quest Reach The Rift, step 3 of 4)
  - "Where is the Eastgate? I need more dire direction.ddddd" (16:49, The Reedmere, quest Reach The East Gate, started at 15:58)
- **State:** At 0:37 the hero was level 1, HP 30/30, with no damage taken and no foes near. The shown DM lines do not mention chickens, so the log cannot tell whether a chicken is a real object. The party changed zones at least 11 times in 20 minutes ("went to" events). That fits "teleported left and right," but the log does not show whether P3 walked or the game moved them.
- **Why it matters:** P3 often could not tell where the next step was. Several lines ask "where."
- **Where to look:** src/systems/dmQuests.ts and src/systems/dmTasks.ts (quest direction text); src/scenes/overworld/DmPrompts.ts; maps/*.ts and tools/map/CLAUDE.md (zone exits and travel); docs/dungeon-master.md.
- **Suggested change:** Make the next step's direction and zone name clear in the DM's quest text. Check the zone-travel code to see whether any moves are unintended. Keep the compass hint that worked at 2:51.
- **How to check:** Start a quest in a test session. Confirm the DM text names the zone and direction. Walk the exit path and confirm each zone change is intended.

### 4. Terrain and scenery behaved oddly (severity: medium)

- **Players said / did:**
  - "Yo, why can't I walk in the lava?" (9:17, The Ember Caldera)
  - "Yeah, no, I I can walk in the lava like right now." (10:00)
  - "The entire building just disappeared right in front of me." (10:21, The Cinder Coast)
- **State:** At 9:17 the quest was Reach The Smoking Pools, step 2 of 4, with the party at 100% and stalled 94s. At 10:21 the hero was level 6, HP 58/66, in The Cinder Coast with 2 Ash Hounds near. The quest "Open the chest holding the Legion Armor" began at 10:19, just before the building vanished. The log does not show what caused the vanishing.
- **Why it matters:** Walkability and visibility changed without clear cause. These may be bugs. The log cannot tell whether they are bugs or intended changes.
- **Where to look:** maps/*.ts (lava and building tiles); tools/map/CLAUDE.md; src/systems/dmQuests.ts (what the chest quest changes in the world); the walkability and collision code (the log does not give the path, so search for it).
- **Suggested change:** Check whether lava walkability and building visibility depend on quest state. Fix only what is a bug.
- **How to check:** Enter the same zone at the same quest step. Try walking into lava before and after that step. Check building visibility before and after the chest quest starts.

### 5. Unclear taps and "read more" (severity: low)

- **Players said / did:** "Wasn't I just at read more?" (14:32). "I'm kinda confused, can you give me more context?" (14:52). "Did I clicked it multiple times?" (16:52).
- **State:** At 14:32 the hero was level 7, HP 74/74, in The Reedmere, with 9 of 11 foes alive and all foes "trivial." No damage was taken. P3 tapped "bad" notes at 13:33 and 17:25. The log cannot see what "read more" is or whether a tap registered. Two of the quotes suggest a tap or click was unclear.
- **Why it matters:** P3 may have pressed a control and not known whether it worked. The count is small, with two quotes.
- **Where to look:** The chat and note UI (search for "read more" in the scene code; the log gives no path). server/README.md for the DM bot. docs/playtests.md.
- **Suggested change:** Check that a tap on "read more" and on the note button gives visible feedback. Change the UI only if it does not.
- **How to check:** Tap "read more" and the note buttons twice each. Confirm a visible state change each time.

### 6. Stall at The Cinder Coast (severity: low)

- **Players said / did:** "There you go." (2:23). "I mean, that's not like feedback you need to give. Just talk to him. Yeah, I mean the so the send button." (3:09). Neither line mentions slowness. The 3:09 line is about feedback and a send button.
- **State:** The Cinder Coast, level 2, HP 36/36. Stalled 122s at 2:23 and 131s at 3:09. 10 of 11 foes alive. Quest Gather 3 Marsh Lamps (0/3). The party had killed 3 here. DM pressure was "fierce." The state shows a real stall. The words do not explain it. P3 may have been unsure how to send or give feedback.
- **Why it matters:** A stall may come from input confusion rather than game pace. The log cannot tell which.
- **Where to look:** docs/playtests.md; src/systems/dmDirector.ts (stall detection); src/systems/dmTasks.ts (the Marsh Lamps task).
- **Suggested change:** First check that the send and feedback path is clear (see finding 5). Then check whether the lamp task has a clear target. Do not change pacing before that.
- **How to check:** Time how long a level 2 hero takes to collect 3 lamps in The Cinder Coast, using test inputs.

## Ideas from players

- Extra gear: "Can you, can you, can you give me some extra gear?" (3:27, The Reedmere). Asked by 1 player (P3), once.
- Skip breathers sometimes: "Can we skip breather sometimes?" (17:33, Hearthmere). Asked by 1 player (P3), once.

## What went well

- After the "lost" signal at 2:50, the DM gave a direct hint at 2:51: "This compass knows the way, roughly."
- The quests kept completing. The log records 12 quest ends, and each came with a reward message, such as "You each earn 435 XP and 294 gold" at 17:15.
- Health recovered between fights. The hero was back at 36/36 at 4:07, after knockouts at 4:00, and at 74/74 at 14:32.

## Log

```
THE GAME IN 5-MINUTE BLOCKS (the director's nudges are counted here, not listed):
0:00-5:00 · The Cinder Coast > The Reedmere · lv 1→3 · party hp -16%-100% · nudges: done x2, struggle x2, lost x1, revive x1 · knocked out x2 (The Reedmere x2) · quests: done: Find Hesper Vane; done: Gather 3 Marsh Lamps · players spoke x3
5:00-10:00 · The Ember Caldera > The Cinder Coast > The Reedmere > The Barrow · lv 3→6 · party hp 90%-100% · nudges: easy x1, lost x1, land x1, done x1 · quests: done: Reach The Rift; done: Find Tamsin Reed; done: Reach The Molten Heart · players spoke x3
10:00-15:00 · The Ember Caldera > The Cinder Coast > Hearthmere > The Reedmere · lv 6→7 · party hp 86%-100% · nudges: easy x1, done x2, land x1 · quests: done: Reach The Smoking Pools; done: Open the chest holding the Legion Armor; done: Find Mother Vellan; done: Reach The Causeway · players spoke x6
15:00-20:00 · The Cinder Coast > The Ember Caldera > The Reedmere > Hearthmere · lv 7→9 · party hp 86%-100% · nudges: done x1 · quests: done: Reach The North Trail; done: Take the Kite Shield from an Ember Caster; done: Reach The East Gate · players spoke x4

WHAT PLAYERS SAID, ASKED AND TAPPED, AND EVERY KNOCKOUT, IN ORDER (each with the state of the game then):
0:37 P3 said: "Where are the chickens?"
    [lv1 hp 30/30, The Cinder Coast (35,36) levels 1–3, quest: Find Hesper Vane [saga step 1 of 4], party 1 avg 100% lowest 100%, stalled 37s]
3:09 P3 said: "I mean, that's not like feedback you need to give.Just talk to him. Yeah, I mean the so the send button."
    [lv2 hp 36/36, The Cinder Coast (49,11) levels 1–3, quest: Gather 3 Marsh Lamps (0/3) [saga step 2 of 4], party 1 avg 100% lowest 100%, stalled 131s]
3:44 P3 down: knocked out in The Reedmere by Ash Hound
    [lv2 hp -6/36, The Reedmere (39,16) levels 2–4, quest: Gather 3 Marsh Lamps (1/3) [saga step 2 of 4], party 1 avg -16% lowest -16%, stalled 15s]
4:00 P3 down: knocked out in The Reedmere by Ash Hound
    [lv2 hp -5/36, The Reedmere (34,10) levels 2–4, quest: Gather 3 Marsh Lamps (1/3) [saga step 2 of 4], party 1 avg -14% lowest -14%, stalled 9s]
4:07 P3 said: "I just got teleported left and right. What just happened?"
    [lv2 hp 36/36, The Cinder Coast (34,41) levels 1–3, quest: Gather 3 Marsh Lamps (1/3) [saga step 2 of 4], party 1 avg 100% lowest 100%, stalled 7s]
5:18 P3 said: "Where's the rift?"
    [lv3 hp 42/42, The Ember Caldera (25,30) levels 2–4, quest: Reach The Rift [saga step 3 of 4], party 1 avg 100% lowest 100%, stalled 7s]
6:40 P3 said: "You said South, why is it east?"
    [lv4 hp 45/50, The Cinder Coast (66,24) levels 1–3, quest: Reach The Rift [saga step 3 of 4], party 1 avg 90% lowest 90%, stalled 17s]
9:17 P3 said: "Yo, why can't I walk in the lava?"
    [lv6 hp 66/66, The Ember Caldera (31,18) levels 2–4, quest: Reach The Smoking Pools [saga step 2 of 4], party 1 avg 100% lowest 100%, stalled 94s]
10:21 P3 said: "The entire building just disappeared right in front of me."
    [lv6 hp 58/66, The Cinder Coast (53,24) levels 1–3, quest: Open the chest holding the Legion Armor [saga step 3 of 4], party 1 avg 88% lowest 88%, stalled 13s]
10:50 P3 said: "Where's Where's the chest?"
    [lv6 hp 64/66, The Cinder Coast (60,14) levels 1–3, quest: Open the chest holding the Legion Armor [saga step 3 of 4], party 1 avg 97% lowest 97%, stalled 43s]
11:41 P3 said: "Is the chest in one of the buildings."
    [lv6 hp 66/66, Hearthmere (19,9), quest: Open the chest holding the Legion Armor [saga step 3 of 4], party 1 avg 100% lowest 100%, stalled 21s]
13:33 P3 note: bad
    [lv7 hp 74/74, The Reedmere (40,23) levels 2–4, quest: none, party 1 avg 100% lowest 100%, stalled 44s]
14:32 P3 said: "Wasn't I just at read more?"
    [lv7 hp 74/74, The Reedmere (34,12) levels 2–4, quest: Reach The Causeway [saga step 1 of 4], party 1 avg 100% lowest 100%, stalled 3s]
14:52 P3 said: "I'm kinda confused, can you give me more context?"
    [lv7 hp 64/74, The Reedmere (30,26) levels 2–4, quest: Reach The North Trail [saga step 2 of 4], party 1 avg 86% lowest 86%, stalled 23s]
16:49 P3 said: "Where is the Eastgate? I need more dire direction.ddddd"
    [lv8 hp 80/84, The Reedmere (25,28) levels 2–4, quest: Reach The East Gate [saga step 4 of 4], party 1 avg 95% lowest 95%, stalled 23s]
16:52 P3 said: "Did I clicked it multiple times?"
    [lv8 hp 72/84, The Reedmere (25,27) levels 2–4, quest: Reach The East Gate [saga step 4 of 4], party 1 avg 86% lowest 86%, stalled 26s]
17:25 P3 note: bad
    [lv9 hp 94/94, Hearthmere (29,19), quest: none, party 1 avg 100% lowest 100%, stalled 14s]
18:00 P3 said: "You didn't say it.You didn't say anything about what I said last time."
    [lv9 hp 94/94, Hearthmere (26,19), quest: Reach The South Gate [saga step 1 of 4], party 1 avg 100% lowest 100%, stalled 49s]

```
