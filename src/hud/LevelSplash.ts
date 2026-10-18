import type { Stats } from '../systems/combat';

/** What a level-up added, as "+6 HP · +2 Attack" (stats that did not change are left out; empty when nothing did). */
export function gainText(before: Stats, after: Stats): string {
  const parts: [string, number][] = [
    ['HP', after.maxHp - before.maxHp],
    ['MP', after.maxMp - before.maxMp],
    ['Attack', after.attack - before.attack],
    ['Defense', after.defense - before.defense],
    ['Magic', after.magic - before.magic],
  ];
  return parts
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `+${n} ${label}`)
    .join(' · ');
}

/**
 * The splash in the middle of the screen when the local hero reaches a new level (markup in index.html, the animation in
 * src/ui.css). Local only, nothing on the wire: it watches the hero's level, so every way of gaining one (a kill, a quest,
 * a chest, training, and a co-op guest told by the host) shows it. `sync` is called every frame; the first call and `reset`
 * only take note of the level, so loading a save or becoming a different hero does not splash.
 */
export class LevelSplash {
  private root = document.getElementById('level-splash')!;
  private level = this.root.querySelector<HTMLElement>('.level')!;
  private gains = this.root.querySelector<HTMLElement>('.gains')!;
  private seen: Stats | null = null;

  /** Take the hero's level as it is, without a splash. */
  reset(stats: Stats | null = null) {
    this.seen = stats && { ...stats };
  }

  sync(stats: Stats) {
    const before = this.seen;
    this.seen = { ...stats };
    if (!before || stats.level <= before.level) return;
    this.level.textContent = String(stats.level);
    this.gains.textContent = gainText(before, stats);
    this.root.classList.remove('show'); // restart it when a second level follows quickly
    void this.root.offsetWidth;
    this.root.classList.add('show');
  }
}
