import { describe, expect, it } from 'vitest';
import { PET_FRAME, PET_KINDS, petFrame, PetBrain, LEASH, petSound } from './pets';

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
          expect(f.x + f.w).toBeLessThanOrEqual(kind.sheet === 'rat' ? 96 : 512);
          expect(f.y + f.h).toBeLessThanOrEqual(kind.sheet === 'rat' ? 128 : 256);
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

  it('squeaks, and a rat only stands, twitching its tail', () => {
    const rat = PET_KINDS.rat!;
    expect(petSound(rat, 0)).toBe('Squeak!');
    expect(petFrame(rat, 'lie', 'left')).toEqual(petFrame(rat, 'stand', 'left'));
    expect(petFrame(rat, 'stand', 'down', 2).x).toBe(2 * PET_FRAME);
    expect(petFrame(rat, 'stand', 'down', 3).x).toBe(0);
  });

  const seeded = (seed: number) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const home = { x: 500, y: 500 };

  it('wanders round its home, never past the leash, and lies down now and then', () => {
    const brain = new PetBrain(PET_KINDS.dog_brown!, home, () => true, seeded(7));
    const poses = new Set<string>();
    let far = 0;
    for (let t = 0; t < 600; t += 0.1) {
      brain.update(0.1);
      poses.add(brain.pose);
      far = Math.max(far, Math.hypot(brain.x - home.x, (brain.y - home.y) / 0.7));
    }
    expect(poses).toEqual(new Set(['stand', 'walk', 'lie']));
    expect(far).toBeGreaterThan(30);
    expect(far).toBeLessThanOrEqual(LEASH + 1);
  });

  it('never steps onto ground that is not free', () => {
    const free = (x: number) => x < 520; // a wall to the east
    const brain = new PetBrain(PET_KINDS.cat_black!, home, free, seeded(3));
    for (let t = 0; t < 600; t += 0.1) {
      brain.update(0.1);
      expect(brain.x).toBeLessThan(520);
    }
  });

  it('a rat never lies down', () => {
    const brain = new PetBrain(PET_KINDS.rat!, home, () => true, seeded(5));
    for (let t = 0; t < 600; t += 0.1) {
      brain.update(0.1);
      expect(brain.pose).not.toBe('lie');
    }
  });

  it('stops and faces you when spoken to', () => {
    const brain = new PetBrain(PET_KINDS.dog_tan!, home, () => true, seeded(1));
    for (let t = 0; t < 30; t += 0.1) brain.update(0.1);
    brain.attend(brain.x - 50, brain.y);
    expect(brain.pose).toBe('stand');
    expect(brain.dir).toBe('left');
    const [x, y] = [brain.x, brain.y];
    brain.update(1);
    expect([brain.x, brain.y]).toEqual([x, y]);
  });
});
