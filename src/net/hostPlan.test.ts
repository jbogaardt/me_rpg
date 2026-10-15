import { describe, expect, it } from 'vitest';
import { saveHostPlan, takeHostPlan } from './hostPlan';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

describe('the host plan', () => {
  it('is read once, as it was left', () => {
    const store = memory();
    saveHostPlan({ pressure: 'fierce' }, store);
    expect(takeHostPlan(store)).toEqual({ pressure: 'fierce' });
    expect(takeHostPlan(store)).toBeNull();
  });

  it('ignores anything that is not a plan', () => {
    const store = memory();
    store.setItem('me_rpg.hostplan', '{"pressure":"brutal"}');
    expect(takeHostPlan(store)).toBeNull();
    store.setItem('me_rpg.hostplan', 'not json');
    expect(takeHostPlan(store)).toBeNull();
    expect(takeHostPlan(undefined)).toBeNull();
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    expect(() => saveHostPlan({ pressure: 'gentle' }, broken)).not.toThrow();
    expect(takeHostPlan(broken)).toBeNull();
  });
});
