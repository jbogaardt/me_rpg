import type { Hero } from '../systems/combat';
import { questArt } from './questArt';
import { zoneName } from '../systems/places';
import {
  CHAPTERS,
  GIVERS,
  QUESTS,
  completerOf,
  offererOf,
  currentChapter,
  currentQuest,
  journal,
  progressText,
  questStatus,
  rewardText,
} from '../systems/quests';
import { esc } from './html';
import { HINT_AREA, taskText, type TaskView } from '../systems/dmTasks';

/**
 * The Quests tab of the pause menu: the task the hero is on, what it pays, and the ones already handed in. Rules and the
 * story are systems/quests.ts; this is only the page. Returns markup (all of it from the game's own text).
 */
export function questPage(hero: Hero, portrait: (mobKind: string) => string | null = () => null): string {
  const q = currentQuest(hero.quests);
  const status = questStatus(hero);
  let now: string;
  if (!q) {
    now = `<p class="quest-note">Every task is done, for now. The next part of the story is still being written.</p>`;
  } else if (status === 'offer') {
    const from = GIVERS[offererOf(q)];
    now = `<h3>${esc(q.title)} <small>not started</small></h3><p class="quest-note">Speak to ${esc(from?.name ?? 'the warden')} in ${esc(zoneName(from?.zone ?? ''))} for a new task. An arrow on screen points the way.</p>`;
  } else {
    const done = status === 'ready';
    const to = GIVERS[completerOf(q)];
    const search =
      !done && q.objective.t !== 'bring' && q.objective.t !== 'meet'
        ? `<p class="quest-note">Press M to open the map: the gold <b>?</b> circle marks the area to search.</p>`
        : '';
    now = `<h3>${esc(q.title)} <small>${done ? 'ready to hand in' : 'in progress'}</small></h3>
      <div class="quest-look">${questArt(q, portrait)}<div><p>${esc(q.goal)}</p>
      <p class="quest-hint">${esc(q.hint)}</p>${search}</div></div>
      <p class="quest-progress${done ? ' done' : ''}">${esc(progressText(hero))}</p>
      <p class="quest-note">${done ? `${q.objective.t === 'meet' || q.objective.t === 'visit' || offererOf(q) !== completerOf(q) ? 'Speak to' : 'Return to'} ${esc(to?.name ?? 'the warden')} in ${esc(zoneName(to?.zone ?? ''))}.` : `Reward: ${esc(rewardText(q.reward))}.`}</p>`;
  }
  // The story so far: what the hero has learned, chapter by chapter (the quest titles they handed in are under each).
  const story = journal(hero.quests);
  const past = story.length
    ? `<h3>The story so far <small>${hero.quests.stage} of ${QUESTS.length} tasks done</small></h3>` +
      story
        .map(
          (c) =>
            `<h4 class="quest-chapter">${esc(c.title)}</h4><ul class="quest-done">${c.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`,
        )
        .join('')
    : '';
  const chapter = currentChapter(hero.quests);
  const heading = chapter
    ? `<p class="quest-chapter-title">Chapter ${chapter.index + 1} of ${CHAPTERS.length}: <b>${esc(chapter.chapter.title)}</b>${q ? '' : ' <small>(the end of part one)</small>'}</p>`
    : '';
  return `<h2>Quests</h2>${heading}${now}${past}`;
}

/**
 * The Quests tab online, where the story's own quests are put away and the Dungeon Master's are the only ones: what was
 * asked, how it stands, and the telling the party was given (`pages`, from systems/dmBrief.ts).
 */
export function dmQuestPage(task: TaskView | null, pages: string[]): string {
  if (!task)
    return `<h2>Quests</h2><p class="quest-note">The Dungeon Master has asked nothing of the party right now. A task will come when the story needs one.</p>`;
  const state = task.state === 'done' ? 'done' : task.state === 'failed' ? 'called off' : 'in progress';
  return `<h2>Quests</h2><h3>${esc(task.title)} <small>${state}</small></h3>
    <p class="quest-progress${task.state === 'done' ? ' done' : ''}">${esc(taskText(task))}</p>
    ${pages.map((p) => `<p class="quest-note">${esc(p)}</p>`).join('')}
    ${task.state === 'active' && task.hint >= HINT_AREA ? `<p class="quest-note">The Dungeon Master has lent you a compass: follow its needle.</p>` : ''}`;
}
