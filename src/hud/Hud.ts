import type { Hero } from '../systems/combat';
import { hintsOn } from '../systems/aids';
import { enabled } from '../systems/capabilities';
import { trackerText } from '../systems/guide';
import { needLevel, needWord } from '../systems/needs';
import { heroCombos, SKILLS } from '../systems/skills';
import { arrows, progress, SPELLS } from '../systems/spells';
import {
  HUD_RULES,
  heartFills,
  heartLayout,
  heartsDim,
  lostHeart,
  manaDim,
  manaMoved,
  needBase,
  needDim,
  needMoved,
  stepQuiet,
} from '../systems/hudRules';
import { coinUrl, heartEmptyUrl, heartFullUrl } from './heartArt';

// The quiet HUD: the hero's health as a row of pixel hearts (quarter steps, no numbers), mana as a thin bar that only shows
// while it matters, hunger and thirst the same, and gold that flashes beside the hearts when it changes. The rules (how many
// hearts, when everything fades, every threshold) are Pixi-free in `systems/hudRules.ts`. HTML rather than canvas so it stays
// sharp on high-DPI phones and respects notch safe areas; markup in index.html, styles in src/ui.css. Exact numbers are in
// the menu's Status tab; here they are only in visually hidden `.label`s (screen readers, tests). Local, nothing is sent.

/** Hunger or thirst below this (the 'low' level, systems/needs.ts) keeps its bar shown. */
const LOW_NEED = 20;

interface Bar {
  root: HTMLElement;
  fill: HTMLElement;
  label: HTMLElement | null;
}

function bar(id: string): Bar {
  const el = document.getElementById(id)!;
  return { root: el, fill: el.querySelector<HTMLElement>('.fill')!, label: el.querySelector<HTMLElement>('.label') };
}

export class Hud {
  private hp = bar('hud-hp');
  private mp = bar('hud-mp');
  private food = bar('hud-food');
  private water = bar('hud-water');
  private hearts = this.hp.root.querySelector<HTMLElement>('.hearts')!;
  private gold = document.getElementById('hud-gold')!;
  private needsRow = document.getElementById('hud-needs')!;
  private combos = document.getElementById('combo-hud')!;
  private tracker = document.getElementById('quest-tracker')!;
  private stats = document.getElementById('hud-stats')!;
  private dmBadge = document.getElementById('hud-dm')!;
  private shown = '';
  // What the quiet rules last saw: seconds since each bar changed, and the values to notice a change against (-1: not yet seen).
  private quiet = { hp: 0, mp: 0, food: 0, water: 0 };
  private seen = { hp: -1, mp: -1, food: -1, water: -1, gold: -1 };
  private dimmed = { hp: false, mp: false, food: false, water: false };
  private goldLeft = 0;
  private fills: number[] = [];
  private cells: HTMLElement[] = [];

  constructor() {
    const root = document.documentElement.style;
    root.setProperty('--heart-full', heartFullUrl());
    root.setProperty('--heart-empty', heartEmptyUrl());
    root.setProperty('--coin', coinUrl());
  }

  /** A quest moved on: the tracker pulses once (the world shows a ring of sparks; the words are the tracker's own). */
  tickQuest() {
    this.tracker.classList.remove('tick');
    void this.tracker.offsetWidth; // restart the animation when a second tick follows quickly
    this.tracker.classList.add('tick');
  }

  private shownCombos = '';

  /** `story`: the story's own quest shows in the tracker (solo); online only the Dungeon Master's does. `typed` is what the player has tapped toward a combo so far (lights the first arrows of the ones it leads to). `dt` is the frame's seconds (the quiet bars fade by it; 0 while the game is paused). */
  update(hero: Hero, typed = '', zone = '', dm = false, task = '', story = true, dt = 0) {
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
    const needs = enabled('needs', zone);
    this.fade(hero, hp, mp, needs, dt);
    const quest = task || (story && hintsOn(zone) ? trackerText(hero) : ''); // a campaign (or zone) without the guide has no tracker line
    const key = `${needs} ${hp}/${s.maxHp} ${mp}/${s.maxMp} ${hero.gold} ${Math.ceil(hero.needs.food)} ${Math.ceil(hero.needs.water)} ${quest}`;
    if (key === this.shown) return; // only touch the DOM when something changed
    this.shown = key;
    this.setHearts(hp, s.maxHp);
    if (this.hp.label) this.hp.label.textContent = `${hp} / ${s.maxHp}`;
    this.set(this.mp, mp, s.maxMp);
    this.needsRow.hidden = !needs;
    this.need(this.food, 'food', hero.needs.food);
    this.need(this.water, 'water', hero.needs.water);
    this.gold.querySelector('.label')!.textContent = String(hero.gold);
    this.tracker.hidden = quest === '';
    this.tracker.textContent = quest;
  }

  /** The quiet rules (systems/hudRules.ts), every frame on plain numbers: the DOM is touched only when a bar starts or stops fading. */
  private fade(hero: Hero, hp: number, mp: number, needs: boolean, dt: number) {
    const { seen, quiet } = this;
    const { maxHp, maxMp } = hero.stats;
    const food = Math.ceil(hero.needs.food);
    const water = Math.ceil(hero.needs.water);
    const first = seen.hp < 0; // the first look is not a change: the bars start shown, then fade
    quiet.hp = stepQuiet(quiet.hp, dt, !first && hp !== seen.hp);
    quiet.mp = stepQuiet(quiet.mp, dt, !first && manaMoved(seen.mp, mp, maxMp));
    quiet.food = stepQuiet(quiet.food, dt, !first && needMoved(seen.food, food));
    quiet.water = stepQuiet(quiet.water, dt, !first && needMoved(seen.water, water));
    if (!first && hero.gold !== seen.gold) this.goldLeft = HUD_RULES.goldFlash;
    else if (this.goldLeft > 0) this.goldLeft = Math.max(0, this.goldLeft - dt);
    seen.hp = hp;
    seen.mp = mp; // regeneration is slow: per frame it never counts as a change, a spend or a gulp does
    seen.food = first ? food : needBase(seen.food, food);
    seen.water = first ? water : needBase(seen.water, water);
    seen.gold = hero.gold;
    this.flip('hp', this.hp.root, heartsDim(quiet.hp, hp, maxHp));
    this.flip('mp', this.mp.root, manaDim(quiet.mp, mp, maxMp));
    this.flip('food', this.food.root, !needs || needDim(quiet.food, hero.needs.food < LOW_NEED));
    this.flip('water', this.water.root, !needs || needDim(quiet.water, hero.needs.water < LOW_NEED));
    const flash = this.goldLeft > 0;
    if (flash === this.gold.hidden) this.gold.hidden = !flash;
  }

  private flip(id: 'hp' | 'mp' | 'food' | 'water', el: HTMLElement, dim: boolean) {
    if (this.dimmed[id] === dim) return;
    this.dimmed[id] = dim;
    el.classList.toggle('dim', dim);
  }

  /** The hearts: rebuilt when their count changes, otherwise only a heart whose fill changed is touched; the one that lost HP pops. */
  private setHearts(hp: number, maxHp: number) {
    const { count } = heartLayout(maxHp);
    if (this.cells.length !== count) {
      this.hearts.replaceChildren(
        ...Array.from({ length: count }, () => {
          const cell = document.createElement('i');
          cell.append(document.createElement('b'));
          return cell;
        }),
      );
      this.cells = Array.from(this.hearts.children) as HTMLElement[];
      this.fills = [];
      this.stats.classList.toggle('many', count > 6); // a long row of hearts is drawn smaller on a phone, and wraps in two even rows past eight
      this.stats.classList.toggle('huge', count > 8);
    }
    const next = heartFills(hp, maxHp);
    const pop = this.fills.length ? lostHeart(this.fills, next) : -1;
    next.forEach((f, i) => {
      if (this.fills[i] !== f) this.cells[i]!.dataset.f = String(f);
    });
    this.fills = next;
    if (pop >= 0) {
      const cell = this.cells[pop]!;
      cell.classList.remove('pop'); // the lost heart jumps (the stylesheet drops this for reduced-motion players)
      void cell.offsetWidth;
      cell.classList.add('pop');
    }
  }

  private need(b: Bar, kind: 'food' | 'water', value: number) {
    const level = needLevel(value);
    this.set(b, Math.ceil(value), 100);
    b.root.classList.toggle('low', level === 'low');
    b.root.classList.toggle('empty', level === 'empty');
    b.root.title = needWord(kind, value);
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
