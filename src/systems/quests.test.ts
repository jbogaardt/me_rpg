import { describe, expect, it } from 'vitest';
import { MOB_KINDS, goldFor, newHero, speedFactor, spellPower, xpFor, type Hero } from './combat';
import { BASE_PACK } from './inventory';
import { itemOf } from './items';
import { NPC_LOOKS } from './looks';
import {
  CHAPTERS,
  EPILOGUE,
  GIVERS,
  QUESTS,
  QUEST_GIVER,
  SITE_KINDS,
  VISIT_RADIUS,
  completerOf,
  currentChapter,
  currentQuest,
  giverMark,
  journal,
  linesFor,
  mobKey,
  offerLines,
  offererOf,
  progressOf,
  progressText,
  questDials,
  questFromWire,
  questStatus,
  questWire,
  recordKill,
  recordSite,
  recordVisit,
  rewardText,
  siteNote,
  siteOpen,
  startsChapter,
  talk,
  type Quest,
} from './quests';

const quest = (id: string): Quest => {
  const q = QUESTS.find((x) => x.id === id);
  if (!q) throw new Error(`no quest ${id}`);
  return q;
};

/** A hero who has been given quest `id` (every one before it handed in). */
function onQuest(id: string): Hero {
  const hero = newHero();
  hero.quests = { stage: QUESTS.indexOf(quest(id)), taken: false, progress: 0 };
  talk(hero, offererOf(quest(id)));
  return hero;
}

/** Finish quest `id` for a hero who is on it, whatever it asks, and hand it in. */
function finish(hero: Hero) {
  const q = currentQuest(hero.quests)!;
  const o = q.objective;
  if (o.t === 'kill') hero.quests.progress = o.count;
  if (o.t === 'gather') hero.quests.progress = 2 ** o.count - 1;
  if (o.t === 'visit') hero.quests.progress = 1;
  if (o.t === 'bring') for (let i = 0; i < o.count; i++) hero.pack.push(itemOf(o.item));
  return talk(hero, completerOf(q));
}

describe('the quest chain', () => {
  it('is a real story: unique ids, written lines, a goal and a reward each', () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    for (const q of QUESTS) {
      expect(q.id, q.id).toMatch(/^[a-z0-9]{1,16}$/); // story keys travel as `<id>.<part>`
      expect(q.title, q.id).toBeTruthy();
      expect(q.goal, q.id).toBeTruthy();
      for (const lines of [q.offer, q.remind, q.done]) {
        expect(lines.length, q.id).toBeGreaterThan(0);
        for (const line of lines) expect(line.length, `${q.id}: ${line}`).toBeLessThanOrEqual(420);
      }
      expect(q.reward.gold, q.id).toBeGreaterThan(0);
      expect(q.reward.xp, q.id).toBeGreaterThan(0);
    }
  });

  it('asks only for things that exist', () => {
    for (const q of QUESTS) {
      const o = q.objective;
      expect(o.count, q.id).toBeGreaterThan(0);
      if (o.t === 'kill') expect(MOB_KINDS[o.kind], q.id).toBeDefined();
      if (o.t === 'gather') {
        expect(SITE_KINDS[o.site], q.id).toBeDefined();
        expect(o.count, q.id).toBeLessThanOrEqual(30); // one bit per site
      }
      if (o.t === 'bring') expect(itemOf(o.item), q.id).toBeDefined();
      for (const id of q.reward.items ?? []) expect(itemOf(id), q.id).toBeDefined();
      for (const who of [offererOf(q), completerOf(q)]) expect(GIVERS[who], `${q.id}: ${who}`).toBeDefined();
    }
  });

  it('is not one task over and over: it mixes every kind and never repeats one three times running', () => {
    const kinds = QUESTS.map((q) => q.objective.t);
    expect(new Set(kinds).size).toBeGreaterThanOrEqual(5); // meet, visit, bring, gather, kill
    for (let i = 2; i < kinds.length; i++)
      expect(new Set(kinds.slice(i - 2, i + 1)).size, `at ${QUESTS[i]!.id}`).toBeGreaterThan(1);
    // The kills are mostly one-of-a-kind enemies with a name, not "N of the common ones".
    const kills = QUESTS.flatMap((q) => (q.objective.t === 'kill' ? [q.objective] : []));
    expect(kills.filter((k) => k.count === 1).length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...kills.map((k) => k.count))).toBeLessThanOrEqual(5);
  });

  it('is told by many people, not one: a cast, each with something to say when idle', () => {
    const people = new Set(QUESTS.flatMap((q) => [offererOf(q), completerOf(q)]));
    expect(people.size).toBeGreaterThanOrEqual(5);
    for (const [id, g] of Object.entries(GIVERS)) {
      if (id === 'orin') continue; // the trainer has his own talk (systems/skills.ts)
      expect(g.idle?.length, id).toBeGreaterThan(0);
      expect(NPC_LOOKS[g.look], id).toBeDefined();
    }
  });

  it('gets harder: the rewards never shrink, and only the later quests hand out gear', () => {
    for (let i = 1; i < QUESTS.length; i++) {
      expect(QUESTS[i]!.reward.gold).toBeGreaterThan(QUESTS[i - 1]!.reward.gold);
      expect(QUESTS[i]!.reward.xp).toBeGreaterThan(QUESTS[i - 1]!.reward.xp);
    }
    for (const q of QUESTS.slice(0, Math.floor(QUESTS.length / 2) - 1)) expect(q.reward.items ?? [], q.id).toEqual([]);
    expect(QUESTS.at(-1)!.reward.items?.length).toBeGreaterThan(0);
  });

  it('hands out only rare gear, which no shop sells', () => {
    for (const q of QUESTS) for (const id of q.reward.items ?? []) expect(itemOf(id), id).toMatchObject({ rare: true });
  });

  it('gives each site kind a note to read', () => {
    for (const [id, kind] of Object.entries(SITE_KINDS)) {
      expect(kind.notes.length, id).toBeGreaterThan(0);
      expect(siteNote(id, 0).length, id).toBeGreaterThan(0);
    }
    // The three echo stones each say something different.
    expect(new Set([0, 1, 2].map((i) => siteNote('echostone', i).join())).size).toBe(3);
  });
});

describe('talking to the people of the story', () => {
  it('offers the first task, then reminds until it is done', () => {
    const hero = newHero();
    const first = QUESTS[0]!;
    expect(questStatus(hero)).toBe('offer');
    expect(giverMark(hero, offererOf(first))).toBe('!');
    expect(giverMark(hero, 'hale')).toBe('');
    const told = talk(hero, offererOf(first));
    expect(told.key).toBe(`${first.id}.offer`);
    expect(told.lines).toEqual(offerLines(first));
    expect(questStatus(hero)).toBe('ready'); // going to meet someone is all there is to it
    expect(giverMark(hero, completerOf(first))).toBe('?');
    expect(talk(hero, offererOf(first)).key).toBe(`${first.id}.remind`); // Maren sends you to Hale: she does not pay
    expect(hero.quests.stage).toBe(0);
  });

  it('online (story off) every giver only passes the time of day: no offer, no progress', () => {
    const hero = newHero();
    const first = QUESTS[0]!;
    const told = talk(hero, offererOf(first), false);
    expect(told.key).toBe(`${offererOf(first)}.idle`);
    expect(hero.quests.taken).toBe(false);
    expect(questStatus(hero)).toBe('offer');
  });

  it('pays a quest to the one it is handed in to, and moves on', () => {
    const hero = onQuest('watch');
    const gold = hero.gold;
    const told = talk(hero, 'hale');
    expect(told.key).toBe('watch.reward');
    expect(told.paid).toBe(true);
    expect(hero.gold).toBe(gold + quest('watch').reward.gold);
    expect(hero.quests).toEqual({ stage: 1, taken: false, progress: 0 });
    expect(told.lines.at(-1)).toBe(`Received ${rewardText(quest('watch').reward)}.`);
    // The next quest is Hale's to hand out, not Maren's.
    expect(giverMark(hero, 'hale')).toBe('!');
    expect(talk(hero, QUEST_GIVER).key).toBe('maren.idle');
    expect(talk(hero, 'hale').key).toBe('elixir.offer');
  });

  it('has people with nothing to do with your task say their own piece', () => {
    const hero = onQuest('elixir');
    const told = talk(hero, 'gruk');
    expect(told.key).toBe('gruk.idle');
    expect(told.lines).toEqual(GIVERS.gruk!.idle);
    expect(told.paid).toBe(false);
    expect(linesFor('gruk.idle')).toEqual(GIVERS.gruk!.idle);
    expect(hero.quests).toMatchObject({ stage: 1, taken: true });
  });

  it('turns a quest in only to the right person, and only when it is done', () => {
    const hero = onQuest('elixir'); // wants an Elixir for Hale
    expect(talk(hero, 'hale').key).toBe('elixir.remind');
    hero.pack.push(itemOf('elixir'));
    expect(talk(hero, QUEST_GIVER).paid).toBe(false); // Maren cannot take it
    expect(hero.pack.length).toBe(1);
    const told = talk(hero, 'hale');
    expect(told.paid).toBe(true);
    expect(hero.pack).toEqual([]);
  });

  it('ends with an epilogue that does not pay again', () => {
    const hero = newHero();
    hero.quests = { stage: QUESTS.length, taken: false, progress: 0 };
    expect(currentQuest(hero.quests)).toBeUndefined();
    expect(questStatus(hero)).toBe('complete');
    const gold = hero.gold;
    const told = talk(hero);
    expect(told.key).toBe('end');
    expect(told.lines).toEqual(EPILOGUE);
    expect(hero.gold).toBe(gold);
    expect(giverMark(hero)).toBe('');
    expect(talk(hero, 'hale').key).toBe('hale.idle');
  });

  it('can be played through, every quest, start to finish', () => {
    const hero = newHero();
    for (const q of QUESTS) {
      expect(talk(hero, offererOf(q)).key, q.id).toBe(`${q.id}.offer`);
      const told = finish(hero);
      expect(told.paid, q.id).toBe(true);
    }
    expect(questStatus(hero)).toBe('complete');
    expect(hero.stats.level).toBeGreaterThan(5); // the story is a real climb
  });
});

describe('kill quests', () => {
  it('count a kill only for the right kind, in the right zone, up to what is needed', () => {
    const hero = onQuest('dead');
    const wanted = MOB_KINDS.skeleton!;
    expect(recordKill(hero, MOB_KINDS.goblin!, 'undead')).toBeNull();
    expect(recordKill(hero, wanted, 'greenwood')).toBeNull(); // only counts in the Barrow Lands
    expect(recordKill(hero, wanted, 'undead')?.text).toBe('1/4 skeletons');
    for (let i = 0; i < 10; i++) recordKill(hero, wanted, 'undead');
    expect(progressOf(hero)).toBe(4);
    expect(recordKill(hero, wanted, 'undead')).toBeNull();
    expect(questStatus(hero)).toBe('ready');
  });

  it('can name one creature: a story boss', () => {
    const hero = onQuest('glade');
    expect(mobKey(MOB_KINDS.palelurker!)).toBe('palelurker');
    expect(recordKill(hero, MOB_KINDS.shade!, 'greenwood')).toBeNull(); // an ordinary shade is not the Lurker
    const got = recordKill(hero, MOB_KINDS.palelurker!, 'greenwood');
    expect(got?.ready).toBe(true);
    expect(questStatus(hero)).toBe('ready');
  });

  it('do not count before the task is given', () => {
    const hero = newHero();
    expect(recordKill(hero, MOB_KINDS.goblin!, 'greenwood')).toBeNull();
    expect(hero.quests.progress).toBe(0);
  });
});

describe('gather quests', () => {
  it('count each site once, in any order', () => {
    const hero = onQuest('lamp');
    const [n] = [quest('lamp').objective.count];
    expect(siteOpen(hero, 'glimmercap', 'greenwood', 2)).toBe(true);
    expect(siteOpen(hero, 'glimmercap', 'eastwood', 2)).toBe(false); // wrong zone
    expect(siteOpen(hero, 'echostone', 'greenwood', 0)).toBe(false); // wrong kind
    expect(recordSite(hero, 'glimmercap', 'greenwood', 2)?.text).toBe(`1/${n} glimmercaps`);
    expect(recordSite(hero, 'glimmercap', 'greenwood', 2)).toBeNull(); // already touched
    expect(siteOpen(hero, 'glimmercap', 'greenwood', 2)).toBe(false);
    for (const i of [0, 3]) recordSite(hero, 'glimmercap', 'greenwood', i);
    expect(progressText(hero)).toBe(`${n}/${n} glimmercaps`);
    expect(questStatus(hero)).toBe('ready');
    expect(recordSite(hero, 'glimmercap', 'greenwood', 4)).toBeNull(); // enough
  });

  it('show nothing before the quest is given', () => {
    const hero = newHero();
    hero.quests.stage = QUESTS.indexOf(quest('lamp'));
    expect(siteOpen(hero, 'glimmercap', 'greenwood', 0)).toBe(false);
  });
});

describe('visit quests', () => {
  const places = [
    { name: 'The Frozen Ledge', col: 100, row: 80 },
    { name: 'Mirrorfrost Lake', col: 20, row: 20 },
  ];
  const at = (col: number, row: number) => [(col + 0.5) * 32, (row + 0.5) * 32] as const;

  it('count arriving near the named place, in its zone only', () => {
    const hero = onQuest('ledge');
    expect(questStatus(hero)).toBe('active');
    expect(recordVisit(hero, 'frostlands', places, ...at(20, 20))).toBeNull(); // the wrong place
    expect(recordVisit(hero, 'greenwood', places, ...at(100, 80))).toBeNull(); // the wrong zone
    expect(recordVisit(hero, 'frostlands', places, ...at(100 + VISIT_RADIUS + 3, 80))).toBeNull(); // too far
    const arrived = recordVisit(hero, 'frostlands', places, ...at(100 + VISIT_RADIUS - 2, 80));
    expect(arrived?.ready).toBe(true);
    expect(questStatus(hero)).toBe('ready');
    expect(giverMark(hero, 'voss')).toBe('?'); // the sergeant at the ledge takes it
    expect(recordVisit(hero, 'frostlands', places, ...at(100, 80))).toBeNull(); // only once
  });

  it('do nothing for a hero on another kind of quest', () => {
    const hero = onQuest('dead');
    expect(recordVisit(hero, 'frostlands', places, ...at(100, 80))).toBeNull();
    expect(hero.quests.progress).toBe(0);
  });
});

describe('bring quests', () => {
  it('take the item from the pack and pay', () => {
    const hero = onQuest('elixir');
    expect(questStatus(hero)).toBe('active');
    hero.pack.push(itemOf('elixir'));
    expect(questStatus(hero)).toBe('ready');
    const told = talk(hero, 'hale');
    expect(told.paid).toBe(true);
    expect(hero.pack).toEqual([]);
    expect(hero.gold).toBe(quest('elixir').reward.gold);
  });
});

describe('rewards', () => {
  it('puts the gear on when the slot is empty or beaten, otherwise in the pack', () => {
    const hero = onQuest('dead');
    hero.quests.progress = 4;
    const told = talk(hero, 'brannoch');
    expect(told.paid).toBe(true);
    expect(told.gear).toBe(true);
    expect(hero.charm).toBe(itemOf('wayfarersCharm'));
    expect(speedFactor(hero)).toBeCloseTo(1.08);
  });

  it('refuses, changing nothing, when the pack has no room for the gear', () => {
    const hero = onQuest('dead');
    hero.quests.progress = 4;
    while (hero.pack.length < BASE_PACK) hero.pack.push(itemOf('potion'));
    const gold = hero.gold;
    const told = talk(hero, 'brannoch');
    expect(told.key).toBe('dead.full');
    expect(told.paid).toBe(false);
    expect(hero.gold).toBe(gold);
    expect(questStatus(hero)).toBe('ready');
    hero.pack.pop(); // After making room, it pays.
    expect(talk(hero, 'brannoch').key).toBe('dead.reward');
  });

  it('describes itself', () => {
    expect(rewardText({ gold: 30, xp: 30 })).toBe('30 gold and 30 XP');
    expect(rewardText(quest('dead').reward)).toBe("150 gold, 170 XP and Wayfarer's Charm");
  });
});

describe('story keys', () => {
  it('turn back into the same lines on the other side of the wire', () => {
    for (const q of QUESTS) {
      expect(linesFor(`${q.id}.offer`)).toEqual(offerLines(q));
      expect(linesFor(`${q.id}.remind`)).toEqual(q.remind);
      expect(linesFor(`${q.id}.reward`)?.length).toBe(q.done.length + 1);
      expect(linesFor(`${q.id}.full`)?.length).toBe(1);
    }
    expect(linesFor('end')).toEqual(EPILOGUE);
    expect(linesFor('maren.idle')).toEqual(GIVERS.maren!.idle);
    expect(linesFor('nope.offer')).toBeNull();
    expect(linesFor('nope.idle')).toBeNull();
    expect(linesFor('road.nope')).toBeNull();
    expect(linesFor('')).toBeNull();
  });

  it('are short enough to cross the wire as a story key', () => {
    for (const q of QUESTS)
      for (const part of ['offer', 'remind', 'reward', 'full']) {
        expect(`${q.id}.${part}`).toMatch(/^[a-z0-9]{1,16}(\.[a-z]{1,8})?$/);
      }
    for (const id of Object.keys(GIVERS)) expect(`${id}.idle`).toMatch(/^[a-z0-9]{1,16}(\.[a-z]{1,8})?$/);
  });
});

describe('the log on the wire', () => {
  it('round-trips', () => {
    const log = { stage: 4, taken: true, progress: 0b101 };
    expect(questFromWire(questWire(log))).toEqual(log);
  });

  it('refuses nonsense', () => {
    expect(questFromWire([99, 0, 0])).toBeNull();
    expect(questFromWire([1, 2, 0])).toBeNull();
    expect(questFromWire([1, 0, -1])).toBeNull();
    expect(questFromWire([1, 0])).toBeNull();
    expect(questFromWire([1.5, 0, 0])).toBeNull();
  });
});

describe('the story is told in chapters', () => {
  it('is in order, each opened by its first quest, none empty', () => {
    expect(CHAPTERS.length).toBeGreaterThanOrEqual(3);
    let last = 0;
    for (const q of QUESTS) {
      expect(q.chapter, q.id).toBeGreaterThanOrEqual(last); // the story never goes back
      expect(q.chapter - last, q.id).toBeLessThanOrEqual(1); // and never skips a chapter
      last = q.chapter;
      expect(q.learned, q.id).toBeTruthy();
    }
    CHAPTERS.forEach((c, i) => {
      expect(c.title).toBeTruthy();
      expect(c.intro.length).toBeGreaterThan(0);
      const quests = QUESTS.filter((q) => q.chapter === i);
      expect(quests.length, c.title).toBeGreaterThan(0);
      expect(startsChapter(quests[0]!), c.title).toBe(true);
      for (const q of quests.slice(1)) expect(startsChapter(q), q.id).toBe(false);
      // The chapter's opening is in the chain giver's voice, so the quest it opens is hers to hand out.
      expect(offererOf(quests[0]!), c.title).toBe(QUEST_GIVER);
    });
  });

  it('opens a chapter with its intro, and only then', () => {
    const second = QUESTS.find((q) => q.chapter === 1 && startsChapter(q))!;
    expect(offerLines(second)).toEqual([...CHAPTERS[1]!.intro, ...second.offer]);
    expect(offerLines(QUESTS[1]!)).toEqual(QUESTS[1]!.offer);
  });

  it('keeps a journal of what the hero has learned, by chapter', () => {
    const hero = newHero();
    expect(journal(hero.quests)).toEqual([]);
    const upTo = QUESTS.findIndex((q) => q.chapter === 1) + 1;
    hero.quests.stage = upTo;
    const j = journal(hero.quests);
    expect(j.map((c) => c.title)).toEqual([CHAPTERS[0]!.title, CHAPTERS[1]!.title]);
    expect(j[1]!.lines).toEqual([QUESTS[upTo - 1]!.learned]);
    expect(currentChapter(hero.quests)?.index).toBe(QUESTS[upTo]!.chapter);
    hero.quests.stage = QUESTS.length;
    expect(currentChapter(hero.quests)?.index).toBe(CHAPTERS.length - 1);
  });
});

describe('gear buffs', () => {
  it('add up over everything worn', () => {
    const hero = newHero();
    expect(speedFactor(hero)).toBe(1);
    hero.charm = itemOf('hourglassPendant');
    hero.feet = itemOf('duneglassBoots');
    expect(speedFactor(hero)).toBeCloseTo(1.22);
    expect(spellPower(hero)).toBe(hero.stats.magic + (hero.weapon.focus?.power ?? 0) + 4);
    expect(xpFor(hero, 100)).toBe(110);
    hero.head = itemOf('tuskbreakerHelm');
    expect(goldFor(hero, 100)).toBe(115);
  });

  it('leave plain gear alone', () => {
    const hero = newHero();
    expect(xpFor(hero, 12)).toBe(12);
    expect(goldFor(hero, 7)).toBe(7);
  });
});

describe('what the party’s quests switch', () => {
  /** Run `fn` with the first quest switching `caps` (the quest object is shared, so it is put back). */
  const switching = (caps: Quest['capabilities'], fn: () => void) => {
    const q = QUESTS[0]!;
    const saved = q.capabilities;
    q.capabilities = caps;
    try {
      fn();
    } finally {
      q.capabilities = saved;
    }
  };
  const on = (taken: boolean): Hero => {
    const h = newHero();
    h.quests = { stage: 0, taken, progress: 0 };
    return h;
  };

  it('switches what a taken quest says, and nothing for one not yet taken', () => {
    switching({ map: false, needs: true }, () => {
      expect(questDials([on(true)])).toEqual({ map: false, needs: true });
      expect(questDials([on(false)])).toEqual({});
    });
  });

  it('lets the first hero to say a thing win, and ignores a hero with no quest left', () => {
    const done = newHero();
    done.quests = { stage: QUESTS.length, taken: true, progress: 0 };
    switching({ map: false }, () => {
      expect(questDials([done, on(true)])).toEqual({ map: false });
      expect(questDials([])).toEqual({});
    });
  });
});
