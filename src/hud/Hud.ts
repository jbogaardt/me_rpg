import type { Hero } from '../systems/combat';

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
  private gold = document.getElementById('hud-gold')!;
  private shown = '';

  update(hero: Hero) {
    const s = hero.stats;
    const hp = Math.ceil(s.hp);
    const mp = Math.floor(s.mp);
    const key = `${hp}/${s.maxHp} ${mp}/${s.maxMp} ${hero.gold}`;
    if (key === this.shown) return; // only touch the DOM when something changed
    this.shown = key;
    this.set(this.hp, hp, s.maxHp);
    this.hp.fill.style.backgroundColor = hpColor(hp / s.maxHp);
    this.set(this.mp, mp, s.maxMp);
    this.gold.querySelector('.label')!.textContent = String(hero.gold);
  }

  private set(b: Bar, value: number, max: number) {
    b.fill.style.setProperty('--frac', String(Math.max(0, Math.min(1, value / max))));
    if (b.label) b.label.textContent = `${value} / ${max}`;
  }
}
