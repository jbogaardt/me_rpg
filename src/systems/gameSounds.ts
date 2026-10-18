// The game's own sounds (Pixi-free, cosmetic, core engine; no capability): which sound an event makes, and the small
// rules the player (`hud/gameSfx.ts`) plays by. This is NOT the Dungeon Master's cue vocabulary (`cues.ts` SFX_NAMES stays
// closed, so the DM's prompts and checks do not change). Every page plays from events it already gets (an `fx`, a `slash`,
// a `bolt`), so a co-op guest hears what the host hears and nothing is sent for it. The host's own
// simulation goes through the same `Visuals` calls, so one event makes one sound.

import type { ParticleEffectName } from './particleEffects';

export const GAME_SOUND_NAMES = [
  'swing', // a sword arc through the air
  'arrow', // a bowstring
  'cast', // a spell going off
  'bolt', // a bolt leaving the hand
  'boltHit', // a bolt landing
  'hit', // a blow landing on flesh
  'clack', // a shot striking something hard (a foe's bolt, a wall)
  'hurt', // a hero is hit
  'death', // a foe goes (plain)
  'deathDust', // ... crumbling
  'deathSplat', // ... wet
  'deathWisp', // ... airy
  'chest', // a chest opens
  'glint', // a soft sparkle
  'levelUp', // the chime
  'pickup', // an item picked up
  'tell', // a foe's windup begins: a rising tone, the cue to dodge
  'deny', // the quick-item button refused (nothing to use, or no need): a short dull thud
  'roll', // the dodge roll: a short low whoosh of air and a soft scuff
  'land', // a ledge drop lands: a soft low thud
] as const;
export type GameSoundName = (typeof GAME_SOUND_NAMES)[number];

/** Which sound a particle effect makes. Effects not listed are silent (smoke, drips, embers...). */
export const FX_SOUNDS: Partial<Record<ParticleEffectName, GameSoundName>> = {
  hitSpark: 'hit',
  hitGraze: 'hit',
  hitHeavy: 'hit',
  heroHurt: 'hurt',
  heroHurtHeavy: 'hurt',
  fall: 'hurt',
  mobPoof: 'death',
  mobDust: 'deathDust',
  mobSplat: 'deathSplat',
  mobWisp: 'deathWisp',
  boltImpact: 'boltHit',
  castGlow: 'cast',
  nova: 'cast',
  blast: 'cast',
  zap: 'cast',
  frost: 'cast',
  heal: 'cast',
  ward: 'cast',
  blink: 'cast',
  levelUp: 'glint', // also made when watering a crop, so only a whisper; the chime is `levelRing`'s
  levelRing: 'levelUp',
  deny: 'deny',
  gainMotes: 'pickup',
  shimmer: 'glint',
  questTick: 'glint',
  coinPop: 'chest', // a chest's coins (nothing else pops coins)
};

export const soundForFx = (name: ParticleEffectName): GameSoundName | undefined => FX_SOUNDS[name];

/** At most this many game sounds sound at once (a phone's budget); a new one beyond it displaces the oldest. */
export const MAX_VOICES = 6;
/** The same sound is not started again within this many seconds (a whole pack hit at once is one thud, not a rattle). */
export const MIN_REPEAT = 0.045;
/** Sound-effect settings bounds. */
export const DEFAULT_SFX_VOLUME = 0.8;

/** A pitch (or filter) factor around 1: `amount` 0.08 gives 0.92..1.08. `r` is a random number in [0, 1). */
export function jitter(r: number, amount: number): number {
  return 1 + (r * 2 - 1) * amount;
}

export interface LiveVoice {
  /** Context time it started and ends. */
  start: number;
  end: number;
  stop: () => void;
}

/** The voices sounding now: never more than `max`. Pure bookkeeping (the player owns the nodes behind each). */
export class VoiceCap {
  private live: LiveVoice[] = [];
  private lastStart = new Map<string, number>();
  constructor(private readonly max = MAX_VOICES) {}

  get count(): number {
    return this.live.length;
  }

  /** Is this sound too soon after the same one? */
  tooSoon(name: string, now: number): boolean {
    const last = this.lastStart.get(name);
    return last !== undefined && now - last < MIN_REPEAT;
  }

  /** Admit a voice, stopping the oldest still sounding if the cap is full. Returns those it stopped. */
  add(name: string, voice: LiveVoice, now: number): LiveVoice[] {
    this.live = this.live.filter((v) => v.end > now);
    const dropped: LiveVoice[] = [];
    while (this.live.length >= this.max) {
      const oldest = this.live.shift();
      if (!oldest) break;
      oldest.stop();
      dropped.push(oldest);
    }
    this.live.push(voice);
    this.lastStart.set(name, now);
    return dropped;
  }
}
