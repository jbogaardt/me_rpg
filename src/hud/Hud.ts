import type { Hero } from '../systems/combat';
import { hintsOn } from '../systems/aids';
import { enabled } from '../systems/capabilities';
import { trackerText } from '../systems/guide';
import { needLevel, needWord } from '../systems/needs';
import { heroCombos, SKILLS } from '../systems/skills';
import { arrows, progress, SPELLS } from '../systems/spells';

// Health / mana bars, mirrored on one line (XP and level are in the pause menu). HTML rather than
// canvas so the text stays sharp on high-DPI phones and can respect notch safe areas; markup and
// styles are in index.html and src/ui.css.

// HP colour by fraction left, sampled from the GUI kit's red→green bar in gradients.png.
const HP_STOPS = [0xfd0401, 0xed6f01, 0xbfbe01, 0x70ed01, 0x04fd01];

function hpColor(frac: number): string {
  const t = Math.max(0, Math.min(1, frac)) * (HP_STOPS.length - 1);
  const i = Math.min(HP_STOPS.length - 2, Math.floor(t));
  const mix = (shift: number) => {
    const from = HP_STOPS[i] ?? 0;
    const a = (from >> shift) & 255;
    const b = ((HP_STOPS[i + 1] ?? from) >> shift) & 255;
    return Math.round(a + (b - a) * (t - i));
  };
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

interface Bar {
  fill: HTMLElement;
  label: HTMLElement | null;
}

function bar(id: string): Bar {
  const el = document.getElementById(id)!;
  return { fill: el.querySelector<HTMLElement>('.fill')!, label: el.querySelector<HTMLElement>('.label') };
}

export class Hud {
  private hp = bar('hud-hp');
  private mp = bar('hud-mp');
  private food = bar('hud-food');
  private water = bar('hud-water');
  private gold = document.getElementById('hud-gold')!;
  private needsRow = document.getElementById('hud-needs')!;
  private combos = document.getElementById('combo-hud')!;
  private tracker = document.getElementById('quest-tracker')!;
  private stats = document.getElementById('hud-stats')!;
  private dmBadge = document.getElementById('hud-dm')!;
  private shown = '';

  /** A quest moved on: the tracker pulses once (the world shows a ring of sparks; the words are the tracker's own). */
  tickQuest() {
    this.tracker.classList.remove('tick');
    void this.tracker.offsetWidth; // restart the animation when a second tick follows quickly
    this.tracker.classList.add('tick');
  }

  private shownCombos = '';

  /** `story`: the story's own quest shows in the tracker (solo); online only the Dungeon Master's does. `typed` is what the player has tapped toward a combo so far (lights the first arrows of the ones it leads to). */
  update(hero: Hero, typed = '', zone = '', dm = false, task = '', story = true) {
    // The Dungeon Master (an online host) has no bars, combos or quest of their own: only a badge saying who they are.
    this.dmBadge.hidden = !dm;
    const badge = task ? `Dungeon Master · ${task}` : 'Dungeon Master';
    if (this.dmBadge.textContent !== badge) this.dmBadge.textContent = badge;
    this.stats.hidden = dm;
    if (dm) {
      this.combos.hidden = this.tracker.hidden = true;
      this.shown = this.shownCombos = 'dm';
      return;
    }
    this.updateCombos(hero, typed, zone);
    const s = hero.stats;
    const hp = Math.ceil(s.hp);
    const mp = Math.floor(s.mp);
    const quest = task || (story && hintsOn(zone) ? trackerText(hero) : ''); // a campaign (or zone) without the guide has no tracker line
    const needs = enabled('needs', zone);
    const key = `${needs} ${hp}/${s.maxHp} ${mp}/${s.maxMp} ${hero.gold} ${Math.ceil(hero.needs.food)} ${Math.ceil(hero.needs.water)} ${quest}`;
    if (key === this.shown) return; // only touch the DOM when something changed
    this.shown = key;
    this.set(this.hp, hp, s.maxHp);
    this.hp.fill.style.backgroundColor = hpColor(hp / s.maxHp);
    this.set(this.mp, mp, s.maxMp);
    this.needsRow.hidden = !needs;
    this.need(this.food, 'food', hero.needs.food);
    this.need(this.water, 'water', hero.needs.water);
    this.gold.querySelector('.label')!.textContent = String(hero.gold);
    this.tracker.hidden = quest === '';
    this.tracker.textContent = quest;
  }

  private need(b: Bar, kind: 'food' | 'water', value: number) {
    const level = needLevel(value);
    this.set(b, Math.ceil(value), 100);
    b.fill.parentElement!.classList.toggle('low', level === 'low');
    b.fill.parentElement!.classList.toggle('empty', level === 'empty');
    b.fill.parentElement!.title = needWord(kind, value);
  }

  private set(b: Bar, value: number, max: number) {
    b.fill.style.setProperty('--frac', String(Math.max(0, Math.min(1, value / max))));
    if (b.label) b.label.textContent = `${value} / ${max}`;
  }

  /** What the hero can cast (the wand or tome's combos, then their skills): each arrow lit once tapped, dim while the mana is short. */
  private updateCombos(hero: Hero, typed: string, zone: string) {
    const list = heroCombos(hero, zone);
    const mp = Math.floor(hero.stats.mp);
    const key = list.length ? `${typed}|${list.map((c) => `${c.keys}${mp >= c.cost ? 1 : 0}`).join()}` : '';
    if (key === this.shownCombos) return;
    this.shownCombos = key;
    this.combos.hidden = !list.length;
    this.combos.innerHTML = list
      .map((c) => {
        const lit = progress(typed, c.keys);
        const keys = [...arrows(c.keys)].map((a, i) => (i < lit ? `<b>${a}</b>` : `<i>${a}</i>`)).join('');
        const name = c.skill ? SKILLS[c.skill].name : SPELLS[c.spell].name;
        return `<li${mp >= c.cost ? '' : ' class="poor"'}><span class="keys">${keys}</span> ${name} <small>${c.cost}</small></li>`;
      })
      .join('');
  }
}
