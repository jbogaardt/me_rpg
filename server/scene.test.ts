import { describe, expect, it, vi } from 'vitest';
import { CueStream, CueTimeline, cleanCued, parseCued, stripCues, type Cue } from '../src/systems/cues';
import { ClaudeNarrator, cleanCuedLine } from './claude';
import { JevScene, type SystemOne } from './jev';
import { MockNarrator, stage, type Beat } from './narrate';
import {
  DIRECTOR_RULES,
  RuleJudge,
  factsFor,
  hasFiller,
  readDrama,
  resolveScene,
  ruleDrama,
  verdictBrief,
  type SceneFacts,
} from './scene';

/** The moment this suite plays through: a player lunges, the goblin dodges, the lantern breaks. */
const facts: SceneFacts = {
  area: 'the Mossy Cellar',
  setting: 'a cellar lit by one hanging lantern',
  props: ['a hanging lantern on a chain'],
  surface: 'wet flagstone',
  mechanical: { actor: 'p1', action: 'lunge at the goblin with a sword', target: 'the goblin', outcome: 'partial' },
  damagePercent: 5,
  actorHealthPercent: 80,
  targetHealthPercent: 70,
};
const beat: Beat = { kind: 'hurt', slot: 1, area: facts.area };

/** Jev stands in: furious_clash, lighting_changed, taunting (the 3rd, 3rd and 2nd options of each question). */
function fakeJev(answers = { tension: 'option_3', twist: 'option_3', reaction: 'option_2' }) {
  const sent: Parameters<SystemOne['systemOne']>[0][] = [];
  const client: SystemOne = {
    systemOne: (request) => {
      sent.push(request);
      return Promise.resolve({
        answers: {
          tension: { choice: answers.tension, confidence: 0.9, probabilities: {} },
          twist: { choice: answers.twist, confidence: 0.9, probabilities: {} },
          reaction: { choice: answers.reaction, confidence: 0.9, probabilities: {} },
        },
      });
    },
  };
  return { client, sent };
}

/** What Haiku writes for that verdict: the action and the cues interleaved where each lands. */
const HAIKU =
  'Steel <cue:anim actor="p1" action="lunge" dir="right" />leaps from the wet flagstone and the goblin ' +
  '<cue:anim actor="foe" action="dodge" dir="left" />twists aside, the point ringing off the lantern chain ' +
  '<cue:sfx name="glass_break" />as the glass bursts <cue:camera shake="0.5" duration="0.3" />and the cellar drops into orange gloom.';

describe('Jev reads the drama of a moment', () => {
  it('asks three independent choices over the same named facts, each option described by what it means', async () => {
    const { client, sent } = fakeJev();
    const verdict = await resolveScene(facts, new JevScene(client));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.state).toEqual(facts);
    expect(Object.keys(sent[0]!.questions)).toEqual(['tension', 'twist', 'reaction']);
    const tension = sent[0]!.questions.tension!;
    expect(tension.type).toBe('choice');
    expect(Object.values(tension.criteria as Record<string, string>)[2]).toMatch(/^furious clash: fast and physical/);
    expect(verdict).toEqual({
      mechanical: facts.mechanical, // the game's own resolution passes through untouched
      dramatic_tension: 'furious_clash',
      environmental_twist: 'lighting_changed',
      npc_reaction_state: 'taunting',
    });
  });

  it('falls back to the rules when Jev fails or answers outside the vocabulary', async () => {
    const down: SystemOne = { systemOne: () => Promise.reject(new Error('503')) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const viaRules = await resolveScene(facts, new JevScene(down));
    expect(viaRules).toEqual({ mechanical: facts.mechanical, ...ruleDrama(facts) });
    const odd = await resolveScene(
      facts,
      new JevScene(fakeJev({ tension: 'option_9', twist: 'option_1', reaction: 'option_1' }).client),
    );
    expect(odd.dramatic_tension).toBe(ruleDrama(facts).dramatic_tension);
    warn.mockRestore();
    expect(
      readDrama({ dramatic_tension: 'epic', environmental_twist: 'none', npc_reaction_state: 'flinching' }),
    ).toBeNull();
  });

  it('has rules that read the moment sensibly on their own', () => {
    expect(ruleDrama(facts)).toEqual({
      dramatic_tension: 'furious_clash',
      environmental_twist: 'lighting_changed',
      npc_reaction_state: 'calculating',
    });
    const whiff = {
      ...facts,
      mechanical: { ...facts.mechanical, outcome: 'setback' as const },
      damagePercent: 0,
      props: [],
    };
    expect(ruleDrama(whiff)).toMatchObject({
      dramatic_tension: 'comic_relief',
      npc_reaction_state: 'taunting',
      environmental_twist: 'footing_compromised',
    });
    expect(ruleDrama({ ...facts, actorHealthPercent: 12 }).dramatic_tension).toBe('mounting_dread');
    expect(ruleDrama({ ...facts, targetHealthPercent: 10 }).npc_reaction_state).toBe('desperate');
  });
});

describe('Haiku is handed the verdict and the curator’s rules', () => {
  it('puts every field of Jev’s verdict, and what it means, in the prompt', async () => {
    const verdict = await resolveScene(facts, new JevScene(fakeJev().client));
    const brief = verdictBrief(verdict);
    expect(brief).toContain('"dramatic_tension":"furious_clash"');
    expect(brief).toContain('"environmental_twist":"lighting_changed"');
    expect(brief).toContain('"npc_reaction_state":"taunting"');
    expect(brief).toContain('"outcome":"partial"');
    expect(brief).toMatch(/Yes, but/); // a partial success is told as a Yes, but
    expect(brief).toMatch(/fast and physical/);
    expect(brief).toMatch(/lantern swings or breaks/);
  });

  it('teaches the tag grammar from the page’s own vocabulary, bans filler and sets the improv frames', () => {
    expect(DIRECTOR_RULES).toContain('<cue:anim actor=');
    expect(DIRECTOR_RULES).toContain('<cue:sfx name=');
    expect(DIRECTOR_RULES).toContain('<cue:camera shake=');
    expect(DIRECTOR_RULES).toContain('glass_break'); // read from systems/cues.ts, so it cannot drift from what plays
    expect(DIRECTOR_RULES).toMatch(/exactly where the physical action happens/);
    expect(DIRECTOR_RULES).toMatch(/concrete sensory anchors/);
    expect(DIRECTOR_RULES).toMatch(/Yes, but.*No, and/s);
    expect(hasFiller('A chill runs down your spine as ancient evil stirs.')).toBe(true);
    expect(hasFiller(stripCues(HAIKU))).toBe(false);
  });

  it('asks Haiku with the verdict and returns its directed line, tags intact', async () => {
    const verdict = await resolveScene(facts, new JevScene(fakeJev().client));
    const ask = vi.fn<(system: string, prompt: string) => Promise<string>>().mockResolvedValue(HAIKU);
    const line = await new ClaudeNarrator(ask).line(beat, verdict);
    const [system, prompt] = ask.mock.calls[0]!;
    expect(system).toContain('<cue:anim actor=');
    expect(prompt).toContain('furious_clash');
    expect(prompt).toContain('lighting_changed');
    expect(prompt).toContain('taunting');
    expect(prompt).toContain('Actors you may direct: p1, party, foe');
    expect(parseCued(line).cues.map((c) => c.kind)).toEqual(['anim', 'anim', 'sfx', 'camera']);
    expect(cleanCued(line)).toBe(line); // already in the form the page sends
  });

  it('keeps each cue beside its word when the line is cut to two sentences and its quotes and asides dropped', () => {
    const line = cleanCuedLine(
      '"The *grin* wide" <cue:sfx name="thud" />hits. Then <cue:camera shake="1" />more. A third sentence.',
    );
    const said = parseCued(line);
    expect(said.text).toBe('The wide hits. Then more.');
    expect(said.text.slice(said.cues[0]!.at)).toMatch(/^hits\./);
    expect(said.text.slice(said.cues[1]!.at)).toMatch(/^more\./);
  });

  it('refuses a line with filler or no words, and tells the stock line instead (still directed)', async () => {
    const verdict = await resolveScene(facts, new RuleJudge());
    for (const bad of ['A chill runs down your spine as the ancient evil stirs.', '<cue:sfx name="thud" />']) {
      const line = await new ClaudeNarrator(() => Promise.resolve(bad), new MockNarrator()).line(beat, verdict);
      expect(stripCues(line)).not.toBe('');
      expect(hasFiller(stripCues(line))).toBe(false);
    }
  });
});

describe('the stock narrator directs too', () => {
  it('has a hurt friend wince on the word that says so, and shakes a grim moment', async () => {
    const verdict = { ...(await resolveScene(facts, new RuleJudge())), dramatic_tension: 'mounting_dread' as const };
    const said = parseCued(stage('Courage is no armour, friends. One of you has paid dearly.', beat, verdict));
    expect(said.cues.map((c) => c.kind)).toEqual(['camera', 'anim']);
    expect(said.text.slice(said.cues[1]!.at)).toMatch(/^One of you/);
    expect(factsFor({ kind: 'arrive', area: 'x' }, 1)).toBeNull();
    expect(factsFor(beat, 0.2)).toMatchObject({ actorHealthPercent: 20, mechanical: { actor: 'p1' } });
  });
});

describe('the whole pipeline: action, verdict, directed prose, playback', () => {
  it('lunge, dodge, lantern: the cues are dispatched in order, each on the word it was written beside', async () => {
    // 1. the game resolved the action; Jev adds the drama.
    const verdict = await resolveScene(facts, new JevScene(fakeJev().client));
    // 2. Haiku tells it, with cues, and the bot sends the line (the page checks it again with cleanCued).
    const told = cleanCued(await new ClaudeNarrator(() => Promise.resolve(HAIKU)).line(beat, verdict));
    // 3. a page receives it, here in small pieces as a model's tokens would arrive.
    const stream = new CueStream();
    let visible = '';
    const cues: Cue[] = [];
    for (let i = 0; i < told.length; i += 9) {
      const step = stream.push(told.slice(i, i + 9));
      visible += step.text;
      cues.push(...step.cues);
      expect(step.text).not.toContain('<'); // a tag never shows, not even half of one
    }
    stream.flush();
    expect(visible).toBe(stripCues(HAIKU).replace(/ $/, ''));
    // 4. the reading plays out frame by frame; the controllers record what they are asked, with the words shown so far.
    const log: { what: string; shown: string }[] = [];
    const controllers = {
      anim: (c: Extract<Cue, { kind: 'anim' }>) => `anim ${c.actor} ${c.action} ${c.dir}`,
      sfx: (c: Extract<Cue, { kind: 'sfx' }>) => `sfx ${c.name}`,
      camera: (c: Extract<Cue, { kind: 'camera' }>) => `camera ${c.shake} ${c.duration}`,
    };
    const timeline = new CueTimeline(visible, cues);
    for (let t = 0; t < timeline.duration + 1; t += 1 / 60) {
      const { shown, due } = timeline.advance(1 / 60);
      for (const cue of due) {
        const what =
          cue.kind === 'anim'
            ? controllers.anim(cue)
            : cue.kind === 'sfx'
              ? controllers.sfx(cue)
              : controllers.camera(cue);
        log.push({ what, shown: visible.slice(0, shown) });
      }
    }
    expect(log.map((l) => l.what)).toEqual([
      'anim p1 lunge right',
      'anim foe dodge left',
      'sfx glass_break',
      'camera 0.5 0.3',
    ]);
    // Each fired the moment the reading reached its offset (within a frame's worth of characters), never before.
    cues.forEach((cue, i) => {
      const shown = log[i]!.shown.length;
      expect(shown).toBeGreaterThanOrEqual(cue.at);
      expect(shown - cue.at).toBeLessThanOrEqual(1);
    });
    expect(log[0]!.shown).toBe('Steel '); // the lunge, as "leaps" begins
    expect(log[2]!.shown.endsWith('lantern chain ')).toBe(true); // the glass, as it bursts
    expect(log[3]!.shown.endsWith('as the glass bursts ')).toBe(true);
    expect(timeline.done).toBe(true);
  });
});
