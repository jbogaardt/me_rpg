// What each unit says, per race. `pick` plays when you select it, `go` when you send it at a foe. The lines are made into
// audio ahead of time (ElevenLabs text-to-speech, recorded once and committed as WAV files) and played by `voice.ts`.
// Pixi-free and cosmetic: nothing here is part of the match.

import type { RaceId } from './sim/races';

export type Line = 'pick' | 'go';

/** The two lines of every unit, by race and unit id (`UnitDef.id`). A test checks that every unit has both. */
export const VOICE_LINES: Record<RaceId, Record<string, Record<Line, string>>> = {
  swarm: {
    spearman: { pick: 'Spears up!', go: 'Stab em good!' },
    archer: { pick: 'Arrows ready!', go: 'Loose em!' },
    boomer: { pick: 'Boom time!', go: 'Lighting the fuse!' },
    thief: { pick: 'Psst, what is shiny?', go: 'Quiet now. Sneak sneak.' },
    swordsman: { pick: 'Blades out!', go: 'Charge!' },
    glider: { pick: 'Wind is good, up we go!', go: 'Swoop!' },
    bombbat: { pick: 'Bombs on wing!', go: 'Dive, bats!' },
    dreadbat: { pick: 'Something hungry wakes.', go: 'Feast on them!' },
  },
  titan: {
    axefighter: { pick: 'For the hold!', go: 'Chop chop!' },
    thunderer: { pick: 'Powder is dry!', go: 'Fire!' },
    runesmith: { pick: 'The runes are warm.', go: 'Burn them!' },
    thane: { pick: 'The thane is ready.', go: 'Onward, my lords!' },
    yale: { pick: 'Hup, Yale!', go: 'Gallop!' },
    scout: { pick: 'Eyes high.', go: 'Take wing!' },
    gryphon: { pick: 'Gryphon ready.', go: 'Sky to the field!' },
    thundergryphon: { pick: 'Thunder wakes.', go: 'Strike from above!' },
  },
  legion: {
    warrior: { pick: 'Shield up!', go: 'For the tribe!' },
    archer: { pick: 'Bows nocked.', go: 'Loose!' },
    saxon: { pick: 'My blade is yours.', go: 'Forward, Saxons!' },
    sapper: { pick: 'Powder laid.', go: 'Light it!' },
    ritter: { pick: 'The Ritter rides.', go: 'Charge!' },
    ram: { pick: 'Loaded and ready.', go: 'Let fly!' },
    falcon: { pick: 'Falcon awake.', go: 'Hunt!' },
    griffin: { pick: 'Griffin answers.', go: 'To the skies!' },
  },
};

/** Where a line's audio is, under the page (`public/audio/voice/`). Played from this one place. */
export const voiceFile = (race: RaceId, unit: string, line: Line) => `audio/voice/${race}-${unit}-${line}.wav`;
