// Who the Dungeon Master is, in words (Pixi-free, tested; core engine): a theatrical old storyteller with a dry wit, fond of
// the party and not above teasing it. Never a bare "Well done."; always a small flourish, an aside, a wager, a raised
// eyebrow. Each moment has several wordings (`Phrasebook` picks one not said lately), kept short enough to read at a
// glance. These are the DM's canned words for the moments the game spots itself; the DM bot's own model is given the same
// character (`server/narrate.ts` PERSONA), and a person at the table words what they like.

/** The party finished the DM's quest. */
export const DONE_WORDS = [
  'Ha! They said it could not be done. They were not there. You were.',
  'Splendid! I shall tell that one for years, and I shall make it sound harder than it was.',
  'Well, well. Look at you, heroes after all. Do not let it go to your heads: there is more.',
  'That, my friends, is how it is done. Bask for a breath. The road is already clearing its throat.',
  'Done! I had a small wager that you would. I will not say with whom.',
  'Magnificent. I confess I peeked at the ending, and you were better than the ending.',
];

/** The quest failed. */
export const FAILED_WORDS = [
  'Ah. That did not go as the story wanted. Do not look so glum: every good tale has a stumble in it.',
  'The chance slipped through your fingers like a wet fish. Dust yourselves off; another is coming.',
  'Hm. A setback. Even I have lost the thread of a tale once or twice. Not often. Twice.',
  'Gone, and no use weeping over it. Chin up, friends: the world is large, and rude, and full of second chances.',
];

/** The DM calls a quest off. */
export const CANCEL_WORDS = [
  'Let that one go, friends. I have a better one up my sleeve.',
  'We shall leave that task for another day, and pretend it never happened. I am good at that.',
  'Forget that errand. The road has other plans for you, and it is quite pleased with them.',
  'That task is called off. Rest a moment, drink something, and brace yourselves for the next.',
];

/** The DM offers a compass (toward the place first), then steadies it on the goal. */
export const COMPASS_WORDS = [
  'You look lost, friends. Take this compass: it will lean you toward the place to look.',
  'Here, let me help. This compass knows the way, roughly. Rather like me.',
  'You have walked in circles long enough, and the circles are getting smug. Take my compass; follow its needle.',
  'The land is not giving it up easily. My compass will turn you the right way, with a little sulking.',
  'No shame in asking the way. Borrow my compass: it leans toward whatever you seek.',
];
export const COMPASS_STEADY_WORDS = [
  'Still nothing? The needle has steadied. Follow it, it will not lead you wrong. Much.',
  'Very well, I will lead you by the hand. The compass points true now.',
  'Enough wandering! The compass has found it: follow the needle.',
  'Some places hide well, the scoundrels. The compass will take you straight there.',
];

/** The DM's private replies to a friend who asked for something (`dmRequests.ts` `REPLIES`, in this order). */
export const REPLY_WORDS = [
  'On my way!',
  'One moment, friend. The world will not unravel while I think.',
  'Not just now. Patience is a virtue, or so I am told.',
  'A fine idea. Consider it done.',
];

/** The game starts: the DM's welcome, a pair of lines. */
export const WELCOMES: string[][] = [
  [
    'Ah, there you are! Gather round, travellers. I am your Dungeon Master, and I have been looking forward to this.',
    'Stay close, mind one another, and do try not to die before the interesting part.',
  ],
  [
    'Welcome, welcome! Mind the dragons, they are a figure of speech. Mostly.',
    'I shall call on you when the tale needs you. Until then: look about, be brave, be kind to the chickens.',
  ],
  [
    'Well! A fresh party, a fresh world, and not one of you yet knows what a mess you are about to make of it.',
    'Splendid. Together now, and listen for my voice. It is the one that sounds pleased.',
  ],
];

/** The party has reached the person a step of a saga sent them to. */
export const MEET_WORDS = [
  (who: string) => `${who} is right there. Go on, say hello. They will not bite. Probably.`,
  (who: string) => `Ah, that will be ${who}. Do speak to them; it is rude to stare.`,
  (who: string) => `You found ${who}! Walk up and have a word. They have been waiting, and are the impatient sort.`,
];

/** A saga ends early. */
export const SAGA_LOST_WORDS = [
  'The thread has snapped, and the saga with it. A pity: it was shaping up nicely.',
  'And there the tale breaks off, mid-sentence. I shall pretend I meant that.',
];
export const SAGA_OFF_WORDS = [
  'And so that tale is put away, unfinished. Another will take its place.',
  'The saga is called off. Do not sulk: I was not enjoying the second act either.',
];
export const SAGA_QUIET_WORDS = [
  'The lands fall quiet, with nothing more to give this tale. It ends here, for now.',
  'The world has run out of road for that story. It happens to the best of them.',
];

/** A signpost whose every way has gone (the road leads nowhere in this world): what it says instead of a list. */
export const SIGN_NOWHERE_WORDS = [
  'The arrows have been painted over, and I cannot say I blame them. This road goes nowhere in particular.',
  'Every way on this post leads to a polite shrug. Trust your feet; they have better taste than the carpenter.',
  'A fine signpost, and not one road to name. I would apologise on its behalf, but it has no manners.',
];
