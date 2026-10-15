import { afterEach, describe, expect, it } from 'vitest';
import type { Session } from '../../net/session';
import { DEFAULT_WELCOME } from '../../systems/narration';
import { CHAPTERS, QUESTS, WELCOME } from '../../systems/quests';
import type { Arena } from './Arena';
import type { DmDesk } from './DmDesk';
import { DmNarration } from './DmNarration';

const saved = { welcome: [...WELCOME], chapters: [...CHAPTERS], quests: [...QUESTS] };
afterEach(() => {
  WELCOME.splice(0, WELCOME.length, ...saved.welcome);
  CHAPTERS.splice(0, CHAPTERS.length, ...saved.chapters);
  QUESTS.splice(0, QUESTS.length, ...saved.quests);
});

function table(stage = 0) {
  const hero = { quests: { stage, taken: false, progress: 0 } };
  const session = { lobbyOpen: true } as { lobbyOpen: boolean };
  const arena = { role: 'host', party: () => [{ hero }] } as unknown as Arena;
  const said: string[] = [];
  const desk = { say: (t: string) => said.push(t) } as unknown as DmDesk;
  return { n: new DmNarration(arena, session as unknown as Session, desk), session, said, hero };
}

const chapter = (title: string, narration?: string[]) => ({ title, intro: [], ...(narration ? { narration } : {}) });

describe('the DM’s narration', () => {
  it('says nothing while the lobby is open, then welcomes the party when the game starts', () => {
    WELCOME.splice(0, WELCOME.length, 'Welcome.', 'Be careful.');
    CHAPTERS.splice(0, CHAPTERS.length, chapter('One'));
    QUESTS.splice(0, QUESTS.length, { chapter: 0 } as (typeof QUESTS)[number]);
    const { n, session, said } = table();
    for (let i = 0; i < 20; i++) n.update(1);
    expect(said).toEqual([]);
    session.lobbyOpen = false; // the host tapped Start Game
    for (let i = 0; i < 30; i++) n.update(1);
    expect(said).toEqual(['Welcome.', 'Be careful.']);
  });

  it('falls back to a plain welcome when the story has none', () => {
    WELCOME.splice(0, WELCOME.length);
    CHAPTERS.splice(0, CHAPTERS.length);
    const { n, session, said } = table();
    n.update(0);
    session.lobbyOpen = false;
    for (let i = 0; i < 40; i++) n.update(1);
    expect(said).toEqual(DEFAULT_WELCOME);
  });

  it('opens each chapter once, as the party reaches it', () => {
    WELCOME.splice(0, WELCOME.length);
    CHAPTERS.splice(
      0,
      CHAPTERS.length,
      chapter('One', ['First chapter.']),
      chapter('Two', ['Second chapter.']),
      chapter('Three'),
    );
    QUESTS.splice(
      0,
      QUESTS.length,
      { chapter: 0 } as (typeof QUESTS)[number],
      { chapter: 1 } as (typeof QUESTS)[number],
      { chapter: 2 } as (typeof QUESTS)[number],
    );
    const { n, session, said, hero } = table(0);
    n.update(0);
    session.lobbyOpen = false;
    for (let i = 0; i < 60; i++) n.update(1);
    expect(said.filter((l) => l.includes('chapter'))).toEqual(['First chapter.']);
    hero.quests.stage = 1;
    for (let i = 0; i < 30; i++) n.update(1);
    for (let i = 0; i < 30; i++) n.update(1); // nothing again for the same chapter
    expect(said.filter((l) => l.includes('chapter'))).toEqual(['First chapter.', 'Second chapter.']);
  });
});
