import { describe, expect, it } from 'vitest';
import { PET_FRAME, PET_KINDS, petFrame, petPose, petSound } from './pets';

describe('pets', () => {
  it('answers in its own language, cycling', () => {
    const dog = PET_KINDS.dog_brown!;
    const cat = PET_KINDS.cat_black!;
    expect(petSound(dog, 0)).toBe('Woof!');
    expect(petSound(cat, 0)).toBe('Meow!');
    expect(petSound(cat, cat.sounds.length)).toBe(petSound(cat, 0));
    expect(petSound(cat, -1)).toBe(cat.sounds[cat.sounds.length - 1]);
  });

  it('keeps every frame inside its 512x256 sheet', () => {
    for (const kind of Object.values(PET_KINDS)) {
      for (const pose of ['stand', 'lie'] as const) {
        for (const dir of ['up', 'down', 'left', 'right'] as const) {
          const f = petFrame(kind, pose, dir);
          expect(f.x + f.w).toBeLessThanOrEqual(512);
          expect(f.y + f.h).toBeLessThanOrEqual(256);
        }
      }
    }
  });

  it('lies down side-on and stands facing any way', () => {
    const kind = PET_KINDS.cat_white!;
    expect(petFrame(kind, 'lie', 'left').y).toBe(3 * PET_FRAME);
    expect(petFrame(kind, 'lie', 'down').y).toBe(0);
    expect(petFrame(kind, 'stand', 'down').y).toBe(2 * PET_FRAME);
  });

  it('alternates between standing and lying', () => {
    const poses = new Set(Array.from({ length: 60 }, (_, t) => petPose(t, 3)));
    expect(poses).toEqual(new Set(['stand', 'lie']));
  });
});
