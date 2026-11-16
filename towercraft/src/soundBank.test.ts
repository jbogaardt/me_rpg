import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BANK, bankFiles, COMMON_KINDS, KINDS, pickVariant, pitchOf, UI_KINDS } from './soundBank';
import { musicFiles } from './playlist';
import { THEMES } from './soundClass';
import { ambienceFile } from './ambience';
import { VOICE_LINES, voiceFile } from './voiceLines';
import type { RaceId } from './sim/races';

const pub = (p: string) => new URL(`../public/${p}`, import.meta.url);
const credits = readFileSync(pub('audio/CREDITS.md'), 'utf8');

describe('the effects bank', () => {
  it('has every variant of every kind on disk, and no file on disk that the bank does not name', () => {
    for (const f of bankFiles()) expect(existsSync(pub(f)), f).toBe(true);
    const named = new Set(bankFiles().map((f) => f.replace('audio/sfx/', '')));
    for (const f of readdirSync(pub('audio/sfx'))) expect(named.has(f), `${f} is not in the bank`).toBe(true);
  });

  it('credits every kind, every music file, every ambience bed and the voices', () => {
    for (const k of KINDS) expect(credits, k).toContain(`\`${k}-1..${BANK[k].variants}\``);
    for (const f of [...musicFiles(), ...THEMES.map(ambienceFile)]) {
      expect(existsSync(pub(f)), f).toBe(true);
      expect(credits, f).toContain(f.replace('audio/', ''));
    }
    for (const f of readdirSync(pub('audio/music'))) expect(musicFiles().includes(`audio/music/${f}`), f).toBe(true);
    for (const f of readdirSync(pub('audio/ambience')))
      expect(THEMES.map(ambienceFile).includes(`audio/ambience/${f}`), f).toBe(true);
    expect(credits).toContain('voice/<race>-<unit>-<line>.ogg');
  });

  it('has an Ogg voice file for every line, and no other file in the voice folder', () => {
    const want = new Set<string>();
    for (const [race, units] of Object.entries(VOICE_LINES))
      for (const [unit, lines] of Object.entries(units))
        for (const line of Object.keys(lines) as ('pick' | 'go')[]) {
          const f = voiceFile(race as RaceId, unit, line);
          expect(existsSync(pub(f)), f).toBe(true);
          want.add(f.replace('audio/voice/', ''));
        }
    for (const f of readdirSync(pub('audio/voice'))) expect(want.has(f), f).toBe(true);
  });

  it('keeps the budget: the whole audio folder stays within 14 MB', () => {
    let total = 0;
    const walk = (dir: URL) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(new URL(`${e.name}/`, dir));
        else total += readFileSync(new URL(e.name, dir)).length;
      }
    };
    walk(pub('audio/'));
    expect(total).toBeLessThan(14 * 1024 * 1024);
  });

  it('keeps sane numbers: variants, a cap per tick, gaps and pitch drift', () => {
    for (const k of KINDS) {
      const s = BANK[k];
      expect(s.variants, k).toBeGreaterThanOrEqual(1);
      expect(s.max, k).toBeGreaterThanOrEqual(1);
      expect(s.gain, k).toBeGreaterThan(0);
      expect(s.gain, k).toBeLessThanOrEqual(1);
      expect(s.pitch, k).toBeLessThan(0.12);
    }
  });

  it('loads only the interface sounds before a match', () => {
    expect(UI_KINDS.every((k) => BANK[k].group === 'ui')).toBe(true);
    expect(COMMON_KINDS.some((k) => BANK[k].group === 'ui')).toBe(false);
  });
});

describe('picking a variant', () => {
  it('never repeats the last variant when there is a choice, and stays in range', () => {
    for (const n of [2, 3, 4, 5])
      for (let last = -1; last < n; last++)
        for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
          const v = pickVariant(n, last, r);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(n);
          if (last >= 0) expect(v).not.toBe(last);
        }
    expect(pickVariant(1, 0, 0.5)).toBe(0);
  });

  it('drifts the pitch within the kind’s limit', () => {
    expect(pitchOf('sword', 0.5)).toBe(1);
    expect(pitchOf('sword', 0)).toBeCloseTo(1 - BANK.sword.pitch);
    expect(pitchOf('sword', 1)).toBeCloseTo(1 + BANK.sword.pitch);
  });
});
