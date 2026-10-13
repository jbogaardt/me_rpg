// The story quests (Pixi-free). A warden in the town hands out one task at a time, in a chain that grows harder and tells
// the first part of the game's story; the easy ones pay gold and XP, the hard ones also give rare gear (systems/items.ts,
// `rare`) that no shop sells. Each hero keeps a `QuestLog` (combat.ts): how many quests are done, whether the current one
// has been given, and its progress. The rules here either succeed completely or change nothing.
//
// The host owns every hero (see CLAUDE.md, Co-op): solo and the host talk and count kills directly; a guest asks the host
// to talk (`DoMsg` op `talk`), is told the answer as a story key (`Talk.key`, turned back into lines with `linesFor`) and
// is told its log in every `pack` message.
//
// Add a quest by adding to QUESTS (the order is the story). Sites (`MapData.sites`, placed with `z.site`) are where gather
// quests send the player; their kinds are SITE_KINDS.

import { MOB_KINDS, gainXp, type Hero, type MobKind, type QuestLog } from './combat';
import { collect } from './chests';
import { packFree, takeFromPack } from './inventory';
import { ITEMS, type ItemId } from './items';

/** Someone who gives quests, standing in a zone (`z.giver(id, col, row)`, MapData.givers). */
export interface Giver {
  name: string;
  /** Key of NPC_LOOKS (systems/looks.ts). */
  look: string;
  /** Floats over their head. */
  tag: string;
  /** The zone they stand in (where a quest's arrow leads to hand a task in). */
  zone: string;
}

export const GIVERS: Record<string, Giver> = {
  maren: { name: 'Warden Maren', look: 'warden', tag: 'Maren', zone: 'town' },
  // The training wizard (systems/skills.ts): teaches spells that any weapon can carry. Not part of the quest chain.
  orin: { name: 'Orin the Trainer', look: 'trainer', tag: 'Trainer', zone: 'shop_wizard' },
};

/** The giver whose chain QUESTS is (there is one story so far). */
export const QUEST_GIVER = 'maren';

/** A place a gather quest sends the player to (`MapData.sites`): drawn as a glowing thing that is touched with the action key. */
export interface SiteKind {
  name: string;
  /** What it is drawn as (entities/QuestSite.ts). */
  shape: 'mushroom' | 'stone' | 'sand';
  /** Main and glow colours, 0xRRGGBB. */
  color: number;
  glow: number;
  /** What the player sees when they touch one: one entry per site of this kind in its zone (by placement order, repeating). */
  notes: string[][];
}

export const SITE_KINDS: Record<string, SiteKind> = {
  glimmercap: {
    name: 'Glimmercap',
    shape: 'mushroom',
    color: 0x7fe8ff,
    glow: 0x4aa8ff,
    notes: [
      ['A glimmercap, glowing softly blue. It is warm to the touch, and something inside it ticks like a tiny heart.'],
    ],
  },
  echostone: {
    name: 'Echo stone',
    shape: 'stone',
    color: 0xb8c4d8,
    glow: 0xd8b8ff,
    notes: [
      [
        'The stone hums under your hand, and an old voice speaks from inside it:',
        '"The Great Hourglass turns, and the Vale turns with it. Seed and harvest, frost and thaw. Every hour has its keeper."',
      ],
      [
        'Another voice, low and hurried:',
        '"Someone climbs the Spire stairs at night. He has a clockmaker\'s hands. He casts no shadow. Do not let him reach the..." The voice breaks off.',
      ],
      [
        'The last stone is cracked, and its voice cracks with it:',
        '"It broke. The Hourglass broke into five shards. Whoever holds them holds the hours... But look: a child outside the glass, untouched by it..."',
        'Silence. The runes go dark.',
      ],
    ],
  },
  hoursand: {
    name: 'Hourglass sand',
    shape: 'sand',
    color: 0xffd86b,
    glow: 0xffb13f,
    notes: [['A glittering mound of gold sand. Each grain ticks as it falls, though nothing is falling.']],
  },
};

/** What a quest asks for. */
export type Objective =
  /** Defeat `count` of a mob kind (a key of MOB_KINDS), anywhere or only in `zone`. */
  | { t: 'kill'; kind: string; count: number; zone?: string }
  /** Touch `count` different sites of a kind (SITE_KINDS) in `zone`. */
  | { t: 'gather'; site: string; zone: string; count: number }
  /** Hand over `count` of an item from the pack. */
  | { t: 'bring'; item: ItemId; count: number };

export interface Reward {
  gold: number;
  xp: number;
  /** Gear or supplies; the hero needs room in the pack for them. */
  items?: ItemId[];
}

/** A stretch of the story: a few quests that belong together, with a title and what Maren says as it begins. */
export interface Chapter {
  title: string;
  /** Said before the first quest's offer, to set the scene and say why the next task matters. */
  intro: string[];
}

export interface Quest {
  /** Short and stable: story keys are `<id>.offer` and so on. */
  id: string;
  /** Index into CHAPTERS. A chapter's quests are next to each other, and its first quest starts with the chapter's intro. */
  chapter: number;
  /** What the hero has learned once this is handed in: one line of the story, kept in the journal on the Quests tab. */
  learned: string;
  /** The moment the task is done out in the world, before going back: a line or two of narration (shown as a dialog). */
  fieldNote: string[];
  title: string;
  /** The task in a few words, for the quest log ("Drive off 5 goblins"). */
  goal: string;
  /** Where to go and what to do, for the quest page (it names areas as ZONE_NAMES does). */
  hint: string;
  /** The zones the task can be done in, nearest first wins; `door` is the door (by the zone it leads to) a bring task starts at. */
  where: { zones: string[]; door?: string };
  /** What is counted in progress text ("goblins": "3/5 goblins"). */
  unit: string;
  objective: Objective;
  reward: Reward;
  /** The giver hands the task out. */
  offer: string[];
  /** Asked again before it is done. */
  remind: string[];
  /** The task is handed in (a line naming the reward follows automatically). */
  done: string[];
}

/** The first part of the story, in four chapters (the quests of a chapter are next to each other in QUESTS). */
export const CHAPTERS: Chapter[] = [
  {
    title: 'The Stilled Hour',
    intro: [
      'Ah, you are the stranger from the crossroads. I am Maren, Warden of Lanternrest, and I have watched the road for you.',
      'Three winters ago, the night the sky cracked, the whole Vale held its breath, and it has not let it out since: clocks stopped, birds fell silent, roads forgot where they led. We call it the Stillness.',
      'I keep the town lamp burning, because a flame that moves is proof that time still does. Help me keep it moving, and I will teach you what I know.',
    ],
  },
  {
    title: 'Voices in the Stone',
    intro: [
      'You have shown me you can walk where others freeze. Now I must ask you to listen, not fight.',
      'The old Vale remembered itself in stone, and it is still talking, if someone is quiet enough to hear. It may tell us what broke.',
    ],
  },
  {
    title: 'The Fallen Sand',
    intro: [
      'The Hourglass did not simply break. It scattered. Where its sand fell, the Stillness is thicker, and it has set guards there.',
      'Whatever is behind this is gathering the pieces. We must find them first, and that means going where the guards are.',
    ],
  },
  {
    title: 'The Frozen March',
    intro: [
      'The road to the Spire runs through the cold east, and the cold east is where the Stillness has marched its soldiers.',
      'This is the last of what I can ask of you for now, and the hardest. After it, we will know who we are fighting.',
    ],
  },
];

export const QUESTS: Quest[] = [
  {
    id: 'road',
    chapter: 0,
    learned: 'The Stillness is three winters old, and it has frightened even the goblins out of their burrows.',
    fieldNote: [
      'The last goblin drops its dagger and runs for the trees, shaking. Tallies are scratched into every trunk here: three winters of them. It was never hunting you. It was running from something.',
    ],
    title: 'Trouble on the Road',
    goal: 'Drive off 5 goblins',
    unit: 'goblins',
    hint: 'Goblins prowl the Greenwood, the wild country around the crossroads. Walk the trails and they will come for you.',
    where: { zones: ['greenwood'] },
    objective: { t: 'kill', kind: 'goblin', count: 5 },
    reward: { gold: 30, xp: 30 },
    offer: [
      'The goblins used to keep to their burrows. Now they swarm the Greenwood roads, half mad with fear. Drive off five of them, and I will know what you are made of.',
    ],
    remind: ['Five goblins on the Greenwood roads. You will not need to look far; they will find you.'],
    done: [
      'Five fewer. The road breathes easier already.',
      'They are not wicked, you know. Only frightened, and the Stillness feeds on fear. But stay, stranger: there is more I must tell you.',
    ],
  },
  {
    id: 'glimmer',
    chapter: 0,
    learned:
      'Glimmercaps glow wherever time still flows. The town lamp burns on them, and it is the last light in the Vale.',
    fieldNote: [
      'The last glimmercap pulses once, like a heartbeat, then holds steady. Somewhere beyond the hush, time is still running.',
    ],
    title: 'Glimmercaps',
    goal: 'Gather 4 glimmercaps in the Greenwood',
    unit: 'glimmercaps',
    hint: 'Glimmercaps glow blue in the groves of the Greenwood. Search the area marked on your map.',
    where: { zones: ['greenwood'] },
    objective: { t: 'gather', site: 'glimmercap', zone: 'greenwood', count: 4 },
    reward: { gold: 50, xp: 45 },
    offer: [
      'See the lamp behind me? It burns on glimmercaps, little mushrooms that glow wherever time still flows.',
      'Our stock is nearly gone, and the Stillness spreads. Search the Greenwood groves for four of them. Touch each with the action key.',
    ],
    remind: ['Four glimmercaps, glowing pale blue in the groves of the Greenwood. Touch each one with the action key.'],
    done: [
      'Look how the lamp leaps! Where time still flows, light keeps its colour.',
      'Once the whole Vale ran like that, under the Great Hourglass. Then it broke. I will tell you the rest when you are ready.',
    ],
  },
  {
    id: 'pack',
    chapter: 0,
    learned: 'The Stillness traps whatever it touches in a single moment. For the wolfkin, that moment is hunger.',
    fieldNote: [
      "The pack's howl cuts off mid-breath. In the quiet, you notice there are no birds anywhere. You have not heard one since you arrived.",
    ],
    title: 'The Hungry Pack',
    goal: 'Defeat 5 wolfkin',
    unit: 'wolfkin',
    hint: 'Wolfkin hunt in the Greenwood and the Eastwood, the forest east of the crossroads.',
    where: { zones: ['greenwood', 'eastwood'] },
    objective: { t: 'kill', kind: 'wolfkin', count: 5 },
    reward: { gold: 70, xp: 70 },
    offer: [
      'The wolfkin of the eastern woods were never cruel. They guided travelers home through the snow. Now they hunt in the open, and nothing fills them.',
      'That is the Stillness: it freezes a single moment, and the creature lives in it forever. For the wolfkin, that moment is hunger.',
      'I hate to ask it. Thin their numbers before they reach the town: five wolfkin.',
    ],
    remind: [
      'Five wolfkin. Grey fur, quick feet, and they see you from far off. Do not fight them in the open if you can help it.',
    ],
    done: [
      'It is done, then. May they rest easier than they lived.',
      'Do not pity them too much, though. Pity is how the Stillness gets in.',
    ],
  },
  {
    id: 'medicine',
    chapter: 0,
    learned: 'Shades are the Hollow: what is left of people the Stillness took. They leave a cold that does not heal.',
    fieldNote: [
      'The potion is cold in your hand, and so is the air. Somewhere in town, a wounded man is waiting on you.',
    ],
    title: 'Medicine for the Watch',
    goal: 'Bring 1 Elixir from the apothecary',
    unit: 'elixir',
    hint: "Buy an Elixir at the Apothecary's Shop on the market square in Lanternrest, then bring it to Maren.",
    where: { zones: ['town'], door: 'shop_apothecary' },
    objective: { t: 'bring', item: 'elixir', count: 1 },
    reward: { gold: 90, xp: 90 },
    offer: [
      'Captain Hale of the Watch took a wound from a Shade last night. It left no blood, only a cold that will not leave him.',
      'An Elixir would warm him. The apothecary on the market square sells them, if you have the coin. Bring me one and I will see him through.',
    ],
    remind: ['An Elixir from the apothecary, on the market square, and I will see to the Captain. Hurry, if you can.'],
    done: [
      'Bless you. Color is already coming back to his face, and he can speak: he saw what struck him.',
      'A Shade: a shadow with no one left to cast it. The Hollow, we call them. What the Stillness leaves of people it takes.',
      'You have more courage than coin, and I know the difference. This is for you.',
    ],
  },
  {
    id: 'stones',
    chapter: 1,
    learned:
      'The Great Hourglass broke into five shards, and you are untouched by the Stillness: the boy outside time.',
    fieldNote: [
      'The runes go dark, but one of them is still faintly warm. The echo said: a child outside the glass. It was talking about you.',
    ],
    title: 'Voices in the Stones',
    goal: 'Touch 3 echo stones in the Greenwood',
    unit: 'echo stones',
    hint: 'Echo stones stand at the old ruins in the west of the Greenwood, in the northern glade and by the old lake.',
    where: { zones: ['greenwood'] },
    objective: { t: 'gather', site: 'echostone', zone: 'greenwood', count: 3 },
    reward: { gold: 110, xp: 130, items: ['wayfarersCharm'] },
    offer: [
      'Now I can tell you why I sent for you. Grey stones ring the old Greenwood: echo stones. They remember what the Vale once was.',
      'Touch three of them. Their memory may show us where the Stillness began.',
      'Go carefully. Shades and goblins haunt the ruins in the west.',
    ],
    remind: [
      'Three echo stones stand in the Greenwood: old grey pillars carved with runes. Touch each with the action key and listen.',
    ],
    done: [
      "You heard it too. The Great Hourglass broke into five shards, and the one who broke it had a clockmaker's hands.",
      'And that last echo: a child outside the glass, untouched. Stranger, you came from no road I know. The Stillness slides off you like rain. You are outside of time.',
      'That is why I called for you. You can walk where it freezes everyone else. Take this charm. It will quicken your feet.',
    ],
  },
  {
    id: 'dead',
    chapter: 1,
    learned: 'Where time stops, the dead cannot rest. The graves are only the first place it shows.',
    fieldNote: [
      'The last skeleton folds into a heap of bone, and the air relaxes a little, as if something let go of a held breath.',
    ],
    title: 'The Restless Dead',
    goal: 'Lay 6 skeletons to rest',
    unit: 'skeletons',
    hint: 'Skeletons walk the Barrow Lands and the Eastwood. They throw bone shards from afar, so keep moving.',
    where: { zones: ['undead', 'eastwood'] },
    objective: { t: 'kill', kind: 'skeleton', count: 6 },
    reward: { gold: 150, xp: 180, items: ['wardensMantle'] },
    offer: [
      'Where time stops, the dead cannot rest. Skeletons walk the old graves in the Barrow Lands and the Eastwood, with bone shards in their fingers.',
      'They keep their distance and throw. Keep moving and they cannot aim, then close in. Put six of them back to sleep.',
    ],
    remind: ['Six skeletons. They stay at range and flick bone shards, so keep moving, then close in.'],
    done: [
      'Six more at peace. The graves sleep a little deeper tonight.',
      'My mother wore this mantle when she kept the lamp. It mends what hurts it can. Wear it well.',
    ],
  },
  {
    id: 'sand',
    chapter: 2,
    learned:
      'The Hourglass sand falls toward the north, toward the Spire, and the Stillness is hunting the shards too.',
    fieldNote: [
      'Every grain you hold tilts the same way, north, like a compass needle. Far off, a bell tolls once, and the sand goes still.',
    ],
    title: 'Sand and Silence',
    goal: 'Gather 4 mounds of hourglass sand in the Sunscar Desert',
    unit: 'mounds',
    hint: 'Hourglass sand lies scattered across the Sunscar Desert, far to the north-west. Raiders guard the dunes.',
    where: { zones: ['desert'] },
    objective: { t: 'gather', site: 'hoursand', zone: 'desert', count: 4 },
    reward: { gold: 200, xp: 240, items: ['duneglassBoots'] },
    offer: [
      'When the Hourglass broke, its sand fell across the Vale. Where it lies, time pools thick and strange. It has gathered in the Sunscar Desert.',
      'Raiders and worse prowl those dunes. Bring me four pinches and I will read the sand. Touch each glittering mound with the action key.',
    ],
    remind: ['Four glittering mounds of hourglass sand in the Sunscar Desert. Mind the raiders.'],
    done: [
      'I can read it. Look: every grain falls toward the north, toward the Spire.',
      'The Stillness gathers where the shards lie, and it is not blind. It hunts them too. The raiders, the orcs, the frozen soldiers in the east: they are all guarding something.',
      'These boots were made by a sandwalker who never once got lost. Take them.',
    ],
  },
  {
    id: 'tusk',
    chapter: 2,
    learned: 'Something that does not speak is commanding the orcs, and it can be startled.',
    fieldNote: [
      "The fallen orc's hand still beats a slow, steady rhythm against the ground. A ticking. Then it, too, goes quiet.",
    ],
    title: 'The Tusk Banner',
    goal: 'Defeat 4 orcs',
    unit: 'orcs',
    hint: 'Orcs hold the Sunscar Desert and the Tuskwood Jungle. They hit hard, so take them one at a time.',
    where: { zones: ['desert', 'jungle'] },
    objective: { t: 'kill', kind: 'orc', count: 4 },
    reward: { gold: 260, xp: 320, items: ['tuskbreakerHelm'] },
    offer: [
      'Orcs have raised a banner in the Tuskwood Jungle and the Sunscar Desert. They answer to a voice that never speaks, and they march in step to a ticking no one else can hear.',
      'Something is commanding them. Break four of them, and we will see whether the rest falter. Take your time. They hit hard, and they do not flinch.',
    ],
    remind: ['Four orcs. They do not flinch when struck, so fight them one at a time.'],
    done: [
      'Four down, and the rest did not press on. So the voice can be startled, at least.',
      "A banner-bearer's helm. Heavy, hungry, and uncannily good at finding coin. It is yours.",
    ],
  },
  {
    id: 'frost',
    chapter: 3,
    learned: 'The frozen soldiers guard the northern pass, the way to the Spire.',
    fieldNote: [
      'Where the last frostbound fell, snow begins to drift again. For a moment, the flakes fall, not hang. Then the hush returns.',
    ],
    title: 'Frostbound Vigil',
    goal: 'Defeat 4 frostbound in the Frostlands',
    unit: 'frostbound',
    hint: 'The frozen soldiers stand in the Frostlands, east of Lanternrest along the town road.',
    where: { zones: ['frostlands'] },
    objective: { t: 'kill', kind: 'frostbound', count: 4, zone: 'frostlands' },
    reward: { gold: 340, xp: 420, items: ['sunforgedCuirass'] },
    offer: [
      'East along the town road, the snow has stopped falling. Not melted: stopped. The frostbound stand in it, still as statues, guarding the cold.',
      'They are the Stillness made flesh: soldiers frozen mid-march. Four of them block the northern pass, and the pass is the way to the Spire.',
      'Their blades are cold iron and they do not flinch. Strike, step back, strike again.',
    ],
    remind: ['Four frostbound in the Frostlands, east along the town road. They do not flinch, so hit and step back.'],
    done: [
      'You came back whole, with frost on your boots and not a flake in your hair. The Stillness fears you, stranger.',
      "This cuirass was my father's. It was lit from the town lamp once, and it still holds the warmth. Wear it.",
    ],
  },
  {
    id: 'heart',
    chapter: 3,
    learned:
      'A shard of the Hourglass bears a name: Orrin, Clockmaker. Four shards remain, and the Stillness knows yours.',
    fieldNote: ["The troll's heavy hand opens, and a splinter of glass rolls out, warm, ticking. Take it to Maren."],
    title: 'The Heart of the Stillness',
    goal: 'Defeat 2 trolls',
    unit: 'trolls',
    hint: 'Trolls roam the Frostlands, the Tuskwood Jungle and Gloamfen Marsh. The Frostlands are the nearest.',
    where: { zones: ['frostlands', 'jungle', 'marsh'] },
    objective: { t: 'kill', kind: 'troll', count: 2 },
    reward: { gold: 500, xp: 650, items: ['hourglassPendant'] },
    offer: [
      'Last, and worst. I can feel a splinter of the Hourglass in the trolls of the Vale, like a bad tooth. Two of them carry what we need.',
      'They roam the Frostlands, the Tuskwood Jungle and Gloamfen Marsh. They are slow, they cannot be stunned, and they hit like falling roofs. Take potions. Take your time.',
      'Bring down two, and I will see what they hold.',
    ],
    remind: [
      'Two trolls, in the Frostlands, the Tuskwood Jungle or Gloamfen Marsh. Huge, slow, and hard to stun. Keep your distance and keep potions close.',
    ],
    done: [
      'A shard of the Hourglass. It is warm, and it ticks. I hold it to the lamp, and the flame stands perfectly still.',
      'There is a name scratched into the splinter: "Orrin, Clockmaker." The keeper of the Spire. The one with the clockmaker\'s hands.',
      'He did not break the Vale, stranger. He was the first thing the Stillness took, and it still wears him.',
      'Four shards remain, and the Stillness knows your name now. Keep this pendant close and keep moving. We will speak again when the next shard calls.',
    ],
  },
];

/** What Maren says once the whole chain is done (for now). */
export const EPILOGUE: string[] = [
  'The lamp burns steady tonight, and that is your doing.',
  "Four shards of the Hourglass are still out there, and whatever wears the clockmaker's hands is still walking. But the Vale is not lost.",
  'Rest, stranger. The next part of this story is still being written.',
];

// --- Where a hero stands ---

export type Status = 'offer' | 'active' | 'ready' | 'complete';

/** The quest the hero is on (given or not), or undefined once every one is done. */
export const currentQuest = (log: QuestLog): Quest | undefined => QUESTS[log.stage];

const bits = (n: number) => {
  let count = 0;
  for (let v = n; v > 0; v = Math.floor(v / 2)) count += v % 2;
  return count;
};

/** The mob kind's key in MOB_KINDS (for counting kills), or undefined for a kind that is not in it. */
export const mobKey = (kind: MobKind): string | undefined => Object.keys(MOB_KINDS).find((k) => MOB_KINDS[k] === kind);

/** How much of the current task is done (capped at what it needs). */
export function progressOf(hero: Hero): number {
  const q = currentQuest(hero.quests);
  if (!q || !hero.quests.taken) return 0;
  const { objective: o } = q;
  switch (o.t) {
    case 'kill':
      return Math.min(o.count, hero.quests.progress);
    case 'gather':
      return Math.min(o.count, bits(hero.quests.progress));
    case 'bring':
      return Math.min(o.count, hero.pack.filter((i) => i === ITEMS[o.item]).length);
  }
}

/** How much the current task needs. */
export const needed = (q: Quest): number => q.objective.count;

export function questStatus(hero: Hero): Status {
  const q = currentQuest(hero.quests);
  if (!q) return 'complete';
  if (!hero.quests.taken) return 'offer';
  return progressOf(hero) >= needed(q) ? 'ready' : 'active';
}

/** "3/5 goblins". */
export const progressText = (hero: Hero): string => {
  const q = currentQuest(hero.quests);
  return q ? `${progressOf(hero)}/${needed(q)} ${q.unit}` : '';
};

/** The reward as a sentence: "30 gold, 30 XP and the Wayfarer's Charm". */
export function rewardText(r: Reward): string {
  const parts = [`${r.gold} gold`, `${r.xp} XP`, ...(r.items ?? []).map((id) => ITEMS[id].name)];
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

// --- Progress ---

export interface Progress {
  /** Floats over the hero: "3/5 goblins". */
  text: string;
  /** The task is now done and can be handed in. */
  ready: boolean;
}

function report(hero: Hero): Progress {
  return { text: progressText(hero), ready: questStatus(hero) === 'ready' };
}

/** A kill by this hero (everyone in the zone shares a kill): counts if the current kill quest wants that kind. */
export function recordKill(hero: Hero, kind: MobKind, zone: string): Progress | null {
  const q = currentQuest(hero.quests);
  if (!q || !hero.quests.taken || q.objective.t !== 'kill') return null;
  const { objective: o } = q;
  if (mobKey(kind) !== o.kind || (o.zone && o.zone !== zone) || hero.quests.progress >= o.count) return null;
  hero.quests.progress++;
  return report(hero);
}

/** Does the current quest send the hero to this site (kind, zone, and which of that kind in the zone) and have they not been to it? */
export function siteOpen(hero: Hero, kind: string, zone: string, index: number): boolean {
  const q = currentQuest(hero.quests);
  if (!q || !hero.quests.taken || q.objective.t !== 'gather') return false;
  const { objective: o } = q;
  if (o.site !== kind || o.zone !== zone || index < 0 || index > 30) return false;
  return Math.floor(hero.quests.progress / 2 ** index) % 2 === 0 && bits(hero.quests.progress) < o.count;
}

/** The hero touches a site: counts it if the current gather quest wants it and it is new. */
export function recordSite(hero: Hero, kind: string, zone: string, index: number): Progress | null {
  if (!siteOpen(hero, kind, zone, index)) return null;
  hero.quests.progress += 2 ** index;
  return report(hero);
}

/** What the player reads on touching the `index`th site of `kind` in its zone. */
export function siteNote(kind: string, index: number): string[] {
  const notes = SITE_KINDS[kind]?.notes ?? [];
  return notes[index % Math.max(1, notes.length)] ?? [];
}

// --- Talking to the giver ---

export interface Talk {
  /** Which story lines were told (`linesFor`); this is what a guest is sent, and shows from its own copy of the text. */
  key: string;
  lines: string[];
  /** The hero put on gear from the reward (the sprite must be redrawn). */
  gear: boolean;
  /** Level-ups the reward's XP gave. */
  levels: number;
  /** A reward was handed over. */
  paid: boolean;
}

const FULL_LINES = ['Your pack is too full to carry my thanks. Make room, and come back.'];

/** Does this quest begin a chapter (the one before it belongs to an earlier chapter, or it is the first)? */
export const startsChapter = (q: Quest): boolean =>
  QUESTS.indexOf(q) === 0 || QUESTS[QUESTS.indexOf(q) - 1]?.chapter !== q.chapter;

/** What the giver says when handing out `q`: the chapter's opening first, when `q` is where a chapter begins. */
export const offerLines = (q: Quest): string[] => [
  ...(startsChapter(q) ? (CHAPTERS[q.chapter]?.intro ?? []) : []),
  ...q.offer,
];

/** The chapter the hero is in (the one their current quest belongs to), or the last once every quest is done. */
export function currentChapter(log: QuestLog): { index: number; chapter: Chapter } | undefined {
  const q = currentQuest(log) ?? QUESTS[QUESTS.length - 1];
  const chapter = q && CHAPTERS[q.chapter];
  return q && chapter ? { index: q.chapter, chapter } : undefined;
}

/** What the hero has learned so far, chapter by chapter: the journal. Only chapters with something learned are listed. */
export function journal(log: QuestLog): { title: string; lines: string[] }[] {
  const done = QUESTS.slice(0, log.stage);
  return CHAPTERS.flatMap((chapter, i) => {
    const lines = done.filter((q) => q.chapter === i).map((q) => q.learned);
    return lines.length ? [{ title: chapter.title, lines }] : [];
  });
}

/** The story lines behind a key ("road.offer", "road.reward", "end"...), or null for one this build does not know. */
export function linesFor(key: string): string[] | null {
  if (key === 'end') return EPILOGUE;
  const [id, part] = key.split('.');
  const q = QUESTS.find((quest) => quest.id === id);
  if (!q) return null;
  switch (part) {
    case 'offer':
      return offerLines(q);
    case 'remind':
      return q.remind;
    case 'full':
      return FULL_LINES;
    case 'reward':
      return [...q.done, `Received ${rewardText(q.reward)}.`];
    default:
      return null;
  }
}

/** Hand the reward over, if there is room for it. Nothing changes when there is not. */
function pay(hero: Hero, q: Quest): { gear: boolean; levels: number } | null {
  const { reward, objective } = q;
  const freed = objective.t === 'bring' ? objective.count : 0;
  if (packFree(hero) + freed < (reward.items?.length ?? 0)) return null;
  if (objective.t === 'bring') for (let i = 0; i < objective.count; i++) takeFromPack(hero, ITEMS[objective.item]);
  hero.gold += reward.gold;
  let gear = false;
  for (const id of reward.items ?? []) {
    // Worn if it beats what is there, otherwise into the pack (there is room: it was checked above).
    gear ||= collect(hero, { item: ITEMS[id] }).gear !== undefined;
  }
  return { gear, levels: gainXp(hero.stats, reward.xp) };
}

/**
 * The hero speaks to the quest giver: they are given the next task, reminded of the one they are on, or (if it is done)
 * paid for it and the chain moves on. The reply says which lines to show.
 */
export function talk(hero: Hero): Talk {
  const log = hero.quests;
  const q = currentQuest(log);
  const said = (key: string, lines: string[], extra: Partial<Talk> = {}): Talk => ({
    key,
    lines,
    gear: false,
    levels: 0,
    paid: false,
    ...extra,
  });
  if (!q) return said('end', EPILOGUE);
  switch (questStatus(hero)) {
    case 'offer':
      log.taken = true;
      log.progress = 0;
      return said(`${q.id}.offer`, offerLines(q));
    case 'active':
      return said(`${q.id}.remind`, q.remind);
    default: {
      const paid = pay(hero, q);
      if (!paid) return said(`${q.id}.full`, FULL_LINES);
      log.stage++;
      log.taken = false;
      log.progress = 0;
      return said(`${q.id}.reward`, linesFor(`${q.id}.reward`) ?? [], { ...paid, paid: true });
    }
  }
}

/** The marker over the giver's head for this hero: "!" has a task to give, "?" is waiting for one to be handed in. */
export function giverMark(hero: Hero): '!' | '?' | '' {
  const status = questStatus(hero);
  return status === 'offer' ? '!' : status === 'ready' ? '?' : '';
}

// --- The log on the wire (a guest is told its log in every `pack` message) ---

export type QuestWire = [stage: number, taken: 0 | 1, progress: number];

export const questWire = ({ stage, taken, progress }: QuestLog): QuestWire => [stage, taken ? 1 : 0, progress];

/** Read a log back, or null when it cannot be one of this build's. */
export function questFromWire(w: unknown): QuestLog | null {
  if (!Array.isArray(w) || w.length !== 3) return null;
  const [stage, taken, progress] = w as number[];
  if (stage === undefined || taken === undefined || progress === undefined) return null;
  if (!Number.isInteger(stage) || stage < 0 || stage > QUESTS.length) return null;
  if ((taken !== 0 && taken !== 1) || !Number.isInteger(progress) || progress < 0 || progress > 2 ** 31) return null;
  return { stage, taken: taken === 1, progress };
}
