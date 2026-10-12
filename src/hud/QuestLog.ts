import type { Hero } from '../systems/combat';
import { GIVERS, QUESTS, QUEST_GIVER, currentQuest, progressText, questStatus, rewardText } from '../systems/quests';

/**
 * The Quests tab of the pause menu: the task the hero is on, what it pays, and the ones already handed in. Rules and the
 * story are systems/quests.ts; this is only the page. Returns markup (all of it from the game's own text).
 */
export function questPage(hero: Hero): string {
  const giver = GIVERS[QUEST_GIVER]?.name ?? 'the warden';
  const q = currentQuest(hero.quests);
  const status = questStatus(hero);
  let now: string;
  if (!q) {
    now = `<p class="quest-note">Every task is done, for now. The next part of the story is still being written.</p>`;
  } else if (status === 'offer') {
    now = `<h3>${q.title} <small>not started</small></h3><p class="quest-note">Speak to ${giver} in Lanternrest for a new task.</p>`;
  } else {
    const done = status === 'ready';
    now = `<h3>${q.title} <small>${done ? 'ready to hand in' : 'in progress'}</small></h3>
      <p>${q.goal}</p>
      <p class="quest-progress${done ? ' done' : ''}">${progressText(hero)}</p>
      <p class="quest-note">${done ? `Return to ${giver} in Lanternrest.` : `Reward: ${rewardText(q.reward)}.`}</p>`;
  }
  const finished = QUESTS.slice(0, hero.quests.stage);
  const past = finished.length
    ? `<h3>Done <small>${finished.length} of ${QUESTS.length}</small></h3>
       <ul class="quest-done">${finished.map((d) => `<li>${d.title}</li>`).join('')}</ul>`
    : '';
  return `<h2>Quests</h2>${now}${past}`;
}
