import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANDMARK_ATLAS, LANDMARK_SHEET } from '../../src/systems/landmarkAtlas';
import { isArt, readPng, ROOT } from './image';

describe('landmarks sheet', () => {
  const sheet = readPng(path.join(ROOT, 'public/tilesets/landmarks.png'));

  it('is the size the atlas says', () => {
    expect(sheet.width).toBe(LANDMARK_SHEET.width);
    expect(sheet.height).toBe(LANDMARK_SHEET.height);
  });

  it('holds every piece inside the sheet, with art in its corners-to-centre (never an empty cut)', () => {
    for (const [name, f] of Object.entries(LANDMARK_ATLAS)) {
      expect(f.x + f.w, name).toBeLessThanOrEqual(sheet.width);
      expect(f.y + f.h, name).toBeLessThanOrEqual(sheet.height);
      let art = 0;
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) if (isArt(sheet, x, y)) art++;
      expect(art / (f.w * f.h), `${name} is mostly empty`).toBeGreaterThan(0.2);
    }
  });
});
