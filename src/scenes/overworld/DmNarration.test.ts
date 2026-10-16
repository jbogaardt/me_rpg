import { describe, expect, it } from 'vitest';
import type { Session } from '../../net/session';
import { DEFAULT_WELCOME } from '../../systems/narration';
import { CHAPTERS, WELCOME } from '../../systems/quests';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import { DmNarration } from './DmNarration';

function table() {
  const session = { lobbyOpen: true } as { lobbyOpen: boolean };
  const arena = { role: 'host', party: () => [] } as unknown as Arena;
  const said: string[] = [];
  const desk = { say: (t: string) => said.push(t) } as unknown as DmDesk;
  return { n: new DmNarration(arena, session as unknown as Session, desk), session, said };
}

describe('the DM’s narration', () => {
  it('says nothing while the lobby is open, then welcomes the party when the game starts', () => {
    const { n, session, said } = table();
    for (let i = 0; i < 20; i++) n.update(1);
    expect(said).toEqual([]);
    session.lobbyOpen = false; // the host tapped Start Game
    for (let i = 0; i < 40; i++) n.update(1);
    expect(said).toEqual(DEFAULT_WELCOME);
  });

  it('never tells the world’s own story: the DM is the story teller', () => {
    WELCOME.splice(0, WELCOME.length, 'Find the keeper.');
    CHAPTERS.splice(0, CHAPTERS.length, { title: 'One', intro: [], narration: ['First chapter.'] });
    const { n, session, said } = table();
    n.update(0);
    session.lobbyOpen = false;
    for (let i = 0; i < 80; i++) n.update(1);
    expect(said).toEqual(DEFAULT_WELCOME);
    WELCOME.splice(0, WELCOME.length);
    CHAPTERS.splice(0, CHAPTERS.length);
  });
});
