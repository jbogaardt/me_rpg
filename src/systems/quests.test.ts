import { describe, expect, it } from 'vitest';
import { MOB_KINDS, newHero, speedFactor, xpFor, goldFor, spellPower, type Hero } from './combat';
import { npcLook, NPC_LOOKS } from './looks';
import { ITEMS } from './items';
import { BASE_PACK } from './inventory';
import {
  EPILOGUE,
  GIVERS,
  QUESTS,
  QUEST_GIVER,
  SITE_KINDS,
  currentQuest,
  giverMark,
  linesFor,
  mobKey,
  progressOf,
  progressText,
  questFromWire,
  questStatus,
  questWire,
  recordKill,
  recordSite,
  rewardText,
  siteNote,
  siteOpen,
  talk,
} from './quests';

/** A hero who has been given quest number `n` (everything before it handed in). */
function onQuest(n: number): Hero {
  const hero = newHero();
  hero.quests = { stage: n, taken: false, progress: 0 };
  talk(hero);
  return hero;
}

describe('the quest chain', () => {
  it('is a real story: unique ids, written lines, a goal and a reward each', () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    for (const q of QUESTS) {
      expect(q.title, q.id).toBeTruthy();
      expect(q.goal, q.id).toBeTruthy();
      for (const lines of [q.offer, q.remind, q.done]) {
        expect(lines.length, q.id).toBeGreaterThan(0);
        for (const line of lines) expect(line.length, `${q.id}: ${line}`).toBeLessThanOrEqual(260);
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
      if (o.t === 'bring') expect(ITEMS[o.item], q.id).toBeDefined();
      for (const id of q.reward.items ?? []) expect(ITEMS[id], q.id).toBeDefined();
    }
  });

  it('gets harder: the rewards never shrink, and only the harder half hands out gear', () => {
    for (let i = 1; i < QUESTS.length; i++) {
      expect(QUESTS[i]!.reward.gold).toBeGreaterThan(QUESTS[i - 1]!.reward.gold);
      expect(QUESTS[i]!.reward.xp).toBeGreaterThan(QUESTS[i - 1]!.reward.xp);
    }
    const early = QUESTS.slice(0, QUESTS.length / 2 - 1);
    for (const q of early) expect(q.reward.items ?? [], q.id).toEqual([]);
    expect(QUESTS.at(-1)!.reward.items?.length).toBeGreaterThan(0);
  });

  it('hands out only rare gear, which no shop sells', () => {
    for (const q of QUESTS) {
      for (const id of q.reward.items ?? []) {
        expect(ITEMS[id], id).toMatchObject({ rare: true });
      }
    }
  });

  it('is told by a giver who has a look', () => {
    const giver = GIVERS[QUEST_GIVER]!;
    expect(NPC_LOOKS[giver.look]).toBeDefined();
    expect(() => npcLook(giver.look)).not.toThrow();
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

describe('talking to the giver', () => {
  it('offers the first task, then reminds until it is done', () => {
    const hero = newHero();
    expect(questStatus(hero)).toBe('offer');
    expect(giverMark(hero)).toBe('!');
    const first = talk(hero);
    expect(first.key).toBe('road.offer');
    expect(first.lines).toEqual(QUESTS[0]!.offer);
    expect(questStatus(hero)).toBe('active');
    expect(giverMark(hero)).toBe('');
    expect(talk(hero).key).toBe('road.remind');
    expect(hero.quests.stage).toBe(0);
  });

  it('pays a finished kill quest once, and moves on', () => {
    const hero = onQuest(0);
    for (let i = 0; i < 5; i++) recordKill(hero, MOB_KINDS.goblin!, 'greenwood');
    expect(questStatus(hero)).toBe('ready');
    expect(giverMark(hero)).toBe('?');
    const gold = hero.gold;
    const xp = hero.stats.xp;
    const t = talk(hero);
    expect(t.key).toBe('road.reward');
    expect(t.paid).toBe(true);
    expect(hero.gold).toBe(gold + 30);
    expect(hero.stats.xp + hero.stats.level * 1000).toBeGreaterThan(xp);
    expect(hero.quests).toEqual({ stage: 1, taken: false, progress: 0 });
    expect(t.lines.at(-1)).toBe('Received 30 gold and 30 XP.');
    // Talking again starts the next quest rather than paying twice.
    expect(talk(hero).key).toBe('glimmer.offer');
    expect(hero.gold).toBe(gold + 30);
  });

  it('counts a kill only for the right kind, in the right zone, up to what is needed', () => {
    const hero = onQuest(0);
    expect(recordKill(hero, MOB_KINDS.wolfkin!, 'greenwood')).toBeNull();
    expect(recordKill(hero, MOB_KINDS.goblin!, 'greenwood')?.text).toBe('1/5 goblins');
    for (let i = 0; i < 10; i++) recordKill(hero, MOB_KINDS.goblin!, 'greenwood');
    expect(progressOf(hero)).toBe(5);
    expect(recordKill(hero, MOB_KINDS.goblin!, 'greenwood')).toBeNull();

    const frost = onQuest(8);
    expect(recordKill(frost, MOB_KINDS.frostbound!, 'greenwood')).toBeNull(); // only counts in the Frostlands
    expect(recordKill(frost, MOB_KINDS.frostbound!, 'frostlands')?.text).toBe('1/4 frostbound');
  });

  it('does not count kills before the task is given', () => {
    const hero = newHero();
    expect(recordKill(hero, MOB_KINDS.goblin!, 'greenwood')).toBeNull();
    expect(hero.quests.progress).toBe(0);
  });

  it('turns a quest in only when it is done', () => {
    const hero = onQuest(0);
    recordKill(hero, MOB_KINDS.goblin!, 'greenwood');
    expect(talk(hero).paid).toBe(false);
    expect(hero.quests.stage).toBe(0);
  });

  it('ends with an epilogue that does not pay again', () => {
    const hero = newHero();
    hero.quests = { stage: QUESTS.length, taken: false, progress: 0 };
    expect(currentQuest(hero.quests)).toBeUndefined();
    expect(questStatus(hero)).toBe('complete');
    const gold = hero.gold;
    const t = talk(hero);
    expect(t.key).toBe('end');
    expect(t.lines).toEqual(EPILOGUE);
    expect(hero.gold).toBe(gold);
    expect(giverMark(hero)).toBe('');
  });
});

describe('gather quests', () => {
  it('count each site once, in any order', () => {
    const hero = onQuest(1);
    expect(siteOpen(hero, 'glimmercap', 'greenwood', 2)).toBe(true);
    expect(siteOpen(hero, 'glimmercap', 'eastwood', 2)).toBe(false); // wrong zone
    expect(siteOpen(hero, 'echostone', 'greenwood', 0)).toBe(false); // wrong kind
    expect(recordSite(hero, 'glimmercap', 'greenwood', 2)?.text).toBe('1/4 glimmercaps');
    expect(recordSite(hero, 'glimmercap', 'greenwood', 2)).toBeNull(); // already touched
    expect(siteOpen(hero, 'glimmercap', 'greenwood', 2)).toBe(false);
    for (const i of [0, 3, 1]) recordSite(hero, 'glimmercap', 'greenwood', i);
    expect(progressText(hero)).toBe('4/4 glimmercaps');
    expect(questStatus(hero)).toBe('ready');
    expect(recordSite(hero, 'glimmercap', 'greenwood', 4)).toBeNull(); // enough
  });

  it('shows nothing before the quest is given', () => {
    const hero = newHero();
    hero.quests.stage = 1;
    expect(siteOpen(hero, 'glimmercap', 'greenwood', 0)).toBe(false);
  });
});

describe('bring quests', () => {
  it('take the item from the pack and pay', () => {
    const hero = onQuest(3);
    expect(questStatus(hero)).toBe('active');
    hero.pack.push(ITEMS.elixir);
    expect(questStatus(hero)).toBe('ready');
    const t = talk(hero);
    expect(t.paid).toBe(true);
    expect(hero.pack).toEqual([]);
    expect(hero.gold).toBe(90);
  });

  it('are not paid for an item that is only worn', () => {
    const hero = onQuest(3);
    expect(questStatus(hero)).toBe('active');
  });
});

describe('rewards', () => {
  it('puts the gear on when the slot is empty or beaten, otherwise in the pack', () => {
    const hero = onQuest(4);
    hero.quests.progress = 0b111;
    const t = talk(hero);
    expect(t.paid).toBe(true);
    expect(t.gear).toBe(true);
    expect(hero.charm).toBe(ITEMS.wayfarersCharm);
    expect(speedFactor(hero)).toBeCloseTo(1.08);
  });

  it('refuses, changing nothing, when the pack has no room for the gear', () => {
    const hero = onQuest(4);
    hero.quests.progress = 0b111;
    while (hero.pack.length < BASE_PACK) hero.pack.push(ITEMS.potion);
    const gold = hero.gold;
    const t = talk(hero);
    expect(t.key).toBe('stones.full');
    expect(t.paid).toBe(false);
    expect(hero.gold).toBe(gold);
    expect(hero.quests.stage).toBe(4);
    expect(questStatus(hero)).toBe('ready');
    // After making room, it pays.
    hero.pack.pop();
    expect(talk(hero).key).toBe('stones.reward');
    expect(hero.quests.stage).toBe(5);
  });

  it('describes itself', () => {
    expect(rewardText({ gold: 30, xp: 30 })).toBe('30 gold and 30 XP');
    expect(rewardText(QUESTS[4]!.reward)).toBe("110 gold, 130 XP and Wayfarer's Charm");
  });
});

describe('story keys', () => {
  it('turn back into the same lines on the other side of the wire', () => {
    for (const q of QUESTS) {
      expect(linesFor(`${q.id}.offer`)).toEqual(q.offer);
      expect(linesFor(`${q.id}.remind`)).toEqual(q.remind);
      expect(linesFor(`${q.id}.reward`)?.length).toBe(q.done.length + 1);
      expect(linesFor(`${q.id}.full`)?.length).toBe(1);
    }
    expect(linesFor('end')).toEqual(EPILOGUE);
    expect(linesFor('nope.offer')).toBeNull();
    expect(linesFor('road.nope')).toBeNull();
    expect(linesFor('')).toBeNull();
  });

  it('name the mob kinds in MOB_KINDS', () => {
    expect(mobKey(MOB_KINDS.troll!)).toBe('troll');
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

describe('gear buffs', () => {
  it('add up over everything worn', () => {
    const hero = newHero();
    expect(speedFactor(hero)).toBe(1);
    hero.charm = ITEMS.hourglassPendant;
    hero.feet = ITEMS.duneglassBoots;
    expect(speedFactor(hero)).toBeCloseTo(1.22);
    expect(spellPower(hero)).toBe(hero.stats.magic + hero.spell.power + 4);
    expect(xpFor(hero, 100)).toBe(110);
    hero.head = ITEMS.tuskbreakerHelm;
    expect(goldFor(hero, 100)).toBe(115);
  });

  it('leave plain gear alone', () => {
    const hero = newHero();
    expect(xpFor(hero, 12)).toBe(12);
    expect(goldFor(hero, 7)).toBe(7);
  });
});
