import { describe, expect, it } from 'vitest';
import type { ContentManager } from '../../content/ContentManager';
import type { DmMsg, Message } from '../../net/protocol';
import type { PeerInput, Session } from '../../net/session';
import { DayClock } from '../../systems/daynight';
import type { Dial } from '../../systems/capabilities';
import type { Arena } from './Arena';
import { DmDesk } from './DmDesk';

/** A host with friends in seats 1 and 2, whose inputs and the messages sent them the test controls. */
function host() {
  const sent: [number, Message][] = [];
  const votes = new Map<number, [number, number]>();
  const arena = {
    role: 'host',
    remotes: new Map([
      [1, { dm: false }],
      [2, { dm: false }],
    ]),
  } as unknown as Arena;
  const session = {
    sendTo: (slot: number, m: Message) => sent.push([slot, m]),
    peerInput: (slot: number) => {
      const vt = votes.get(slot);
      return (vt ? { vt } : {}) as PeerInput;
    },
  } as unknown as Session;
  let dials: Partial<Record<Dial, boolean>> = {};
  const content = {
    get dialsSet() {
      return dials;
    },
    setDials: (d: Partial<Record<Dial, boolean>>) => (dials = { ...d }),
  } as unknown as ContentManager;
  const clock = new DayClock(() => 0);
  const desk = new DmDesk(arena, session, content, clock);
  const last = (slot: number) => [...sent].reverse().find(([s]) => s === slot)?.[1] as DmMsg | undefined;
  return { desk, sent, votes, last, clock, content: () => dials };
}

const roads = [
  { cue: 'frost|thaw', label: 'Into frost lands, over a thaw crossing' },
  { cue: 'swamp|', label: 'Into swamp lands' },
];

describe('the Dungeon Master’s desk', () => {
  it('tells every friend the dials and the time of day, and again when they change', () => {
    const { desk, last, clock } = host();
    desk.update(0);
    expect(last(1)).toMatchObject({ k: 'dm', shift: 0, dials: {}, vote: null });
    desk.setDial('map', false);
    desk.setHour(12);
    desk.update(0.01);
    expect(last(2)).toMatchObject({ dials: { map: false }, shift: clock.shift });
    desk.setDial('map', null);
    desk.update(0.01);
    expect(last(1)!.dials).toEqual({});
  });

  it('opens a vote, counts each friend’s choice from their input, and closes it', () => {
    const { desk, votes, last } = host();
    desk.openVote(roads);
    desk.update(0);
    const vote = last(1)!.vote!;
    expect(vote.options).toEqual(roads.map((r) => r.label));
    expect(vote.tally).toEqual([0, 0]);
    votes.set(1, [vote.id, 1]);
    votes.set(2, [vote.id + 99, 0]); // a vote in an old poll does not count
    desk.update(0.01);
    expect(last(1)!.vote).toMatchObject({ tally: [0, 1], yours: 1 });
    expect(last(2)!.vote).toMatchObject({ tally: [0, 1], yours: -1 });
    expect(desk.voteView()).toEqual({ open: true, tally: { 'swamp|': 1 }, voters: 2 });
    desk.closeVote();
    desk.update(0.01);
    expect(last(1)!.vote).toBeNull();
  });

  it('sends what the DM says to every friend for a few seconds, then stops', () => {
    const { desk, last } = host();
    const heard: string[] = [];
    desk.onSay = (t) => heard.push(t);
    expect(desk.say('   ')).toBe(false);
    expect(desk.say('  Beware\nthe  fen  ')).toBe(true);
    expect(heard).toEqual(['Beware the fen']);
    desk.update(0);
    expect(last(1)!.say).toEqual([1, 'Beware the fen']);
    expect(last(2)!.say).toEqual([1, 'Beware the fen']);
    desk.update(9);
    expect(last(1)!.say).toBeUndefined();
    desk.say('Run');
    desk.update(0);
    expect(last(1)!.say).toEqual([2, 'Run']);
  });

  it('asks nothing with fewer than two roads', () => {
    const { desk } = host();
    desk.openVote(roads.slice(0, 1));
    expect(desk.voteView().open).toBe(false);
  });
});

describe('a friend at the Dungeon Master’s table', () => {
  it('sets its clock and dials from what it is told, and sends its vote until the vote closes', () => {
    let msg: DmMsg | null = null;
    const session = { takeDm: () => [msg, (msg = null)][0] } as unknown as Session;
    let dials: Partial<Record<Dial, boolean>> = {};
    const content = { setDials: (d: Partial<Record<Dial, boolean>>) => (dials = d) } as unknown as ContentManager;
    const clock = new DayClock(() => 0);
    const desk = new DmDesk({ role: 'client' } as unknown as Arena, session, content, clock);
    msg = {
      k: 'dm',
      n: 1,
      shift: 0.25,
      dials: { needs: false },
      vote: { id: 3, options: ['a', 'b'], tally: [0, 0], yours: -1 },
    };
    desk.update(0);
    expect(clock.shift).toBe(0.25);
    expect(dials).toEqual({ needs: false });
    expect(desk.openVoteForGuest).toMatchObject({ id: 3, mine: -1 });
    expect(desk.voteInput).toBeUndefined();
    desk.castVote(1);
    expect(desk.voteInput).toEqual([3, 1]);
    expect(desk.openVoteForGuest!.mine).toBe(1);
    msg = { k: 'dm', n: 2, shift: 0.25, dials: { needs: false }, vote: null };
    desk.update(0);
    expect(desk.openVoteForGuest).toBeNull();
    expect(desk.voteInput).toBeUndefined();
  });

  it('shows what the DM said once, however often the host repeats it', () => {
    let msg: DmMsg | null = null;
    const session = { takeDm: () => [msg, (msg = null)][0] } as unknown as Session;
    const content = { setDials: () => {} } as unknown as ContentManager;
    const desk = new DmDesk({ role: 'client' } as unknown as Arena, session, content, new DayClock(() => 0));
    const heard: string[] = [];
    desk.onSay = (t) => heard.push(t);
    const word = (n: number, say?: [number, string]): DmMsg => ({
      k: 'dm',
      n,
      shift: 0,
      dials: {},
      vote: null,
      ...(say ? { say } : {}),
    });
    for (const m of [word(1, [1, 'Hush']), word(2, [1, 'Hush']), word(3), word(4, [2, 'Run'])]) {
      msg = m;
      desk.update(0);
    }
    expect(heard).toEqual(['Hush', 'Run']);
  });
});
