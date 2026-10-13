import type { Hero } from '../systems/combat';
import { questArt } from './questArt';
import { zoneName } from '../systems/places';
import {
  CHAPTERS,
  GIVERS,
  QUESTS,
  QUEST_GIVER,
  currentChapter,
  currentQuest,
  journal,
  progressText,
  questStatus,
  rewardText,
} from '../systems/quests';

/**
 * The Quests tab of the pause menu: the task the hero is on, what it pays, and the ones already handed in. Rules and the
 * story are systems/quests.ts; this is only the page. Returns markup (all of it from the game's own text).
 */
export function questPage(hero: Hero, portrait: (mobKind: string) => string | null = () => null): string {
  const giver = GIVERS[QUEST_GIVER]?.name ?? 'the warden';
  const q = currentQuest(hero.quests);
  const status = questStatus(hero);
  let now: string;
  if (!q) {
    now = `<p class="quest-note">Every task is done, for now. The next part of the story is still being written.</p>`;
  } else if (status === 'offer') {
    now = `<h3>${q.title} <small>not started</small></h3><p class="quest-note">Speak to ${giver} in ${zoneName(GIVERS[QUEST_GIVER]?.zone ?? 'town')}, on the market square, for a new task. An arrow on screen points the way.</p>`;
  } else {
    const done = status === 'ready';
    const search =
      !done && q.objective.t !== 'bring'
        ? `<p class="quest-note">Press M to open the map: the gold <b>?</b> circle marks the area to search.</p>`
        : '';
    now = `<h3>${q.title} <small>${done ? 'ready to hand in' : 'in progress'}</small></h3>
      <div class="quest-look">${questArt(q, portrait)}<div><p>${q.goal}</p>
      <p class="quest-hint">${q.hint}</p>${search}</div></div>
      <p class="quest-progress${done ? ' done' : ''}">${progressText(hero)}</p>
      <p class="quest-note">${done ? `Return to ${giver} in ${zoneName(GIVERS[QUEST_GIVER]?.zone ?? 'town')}.` : `Reward: ${rewardText(q.reward)}.`}</p>`;
  }
  // The story so far: what the hero has learned, chapter by chapter (the quest titles they handed in are under each).
  const story = journal(hero.quests);
  const past = story.length
    ? `<h3>The story so far <small>${hero.quests.stage} of ${QUESTS.length} tasks done</small></h3>` +
      story
        .map(
          (c) =>
            `<h4 class="quest-chapter">${c.title}</h4><ul class="quest-done">${c.lines.map((l) => `<li>${l}</li>`).join('')}</ul>`,
        )
        .join('')
    : '';
  const chapter = currentChapter(hero.quests);
  const heading = chapter
    ? `<p class="quest-chapter-title">Chapter ${chapter.index + 1} of ${CHAPTERS.length}: <b>${chapter.chapter.title}</b>${q ? '' : ' <small>(the end of part one)</small>'}</p>`
    : '';
  return `<h2>Quests</h2>${heading}${now}${past}`;
}
