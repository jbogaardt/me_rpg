import { xpToNext, type Hero } from './combat';

// Health / mana / XP bars. HTML rather than canvas so the text stays sharp on high-DPI phones and
// can respect notch safe areas; markup and styles are in index.html and src/ui.css.

interface Bar {
  fill: HTMLElement;
  label: HTMLElement | null;
}

function bar(id: string): Bar {
  const el = document.getElementById(id)!;
  return { fill: el.querySelector<HTMLElement>('.fill')!, label: el.querySelector<HTMLElement>('.label') };
}

export class Hud {
  private level = document.getElementById('hud-level')!;
  private hp = bar('hud-hp');
  private mp = bar('hud-mp');
  private xp = bar('hud-xp');
  private shown = '';

  update(hero: Hero) {
    const s = hero.stats;
    const hp = Math.ceil(s.hp);
    const mp = Math.floor(s.mp);
    const next = xpToNext(s.level);
    const key = `${s.level} ${hp}/${s.maxHp} ${mp}/${s.maxMp} ${s.xp}`;
    if (key === this.shown) return; // only touch the DOM when something changed
    this.shown = key;
    this.level.textContent = `Lv ${s.level}`;
    this.set(this.hp, hp, s.maxHp);
    this.set(this.mp, mp, s.maxMp);
    this.set(this.xp, s.xp, next);
  }

  private set(b: Bar, value: number, max: number) {
    b.fill.style.width = `${Math.max(0, Math.min(1, value / max)) * 100}%`;
    if (b.label) b.label.textContent = `${value} / ${max}`;
  }
}
