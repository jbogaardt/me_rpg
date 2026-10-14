import { describe, expect, it } from 'vitest';
import { ITEMS } from './items';
import { lecternIn, lecternPages } from './lectern';

describe('lectern', () => {
  it('lists every combo of every wand and tome', () => {
    const text = lecternPages().join('\n');
    for (const item of Object.values(ITEMS)) {
      if (!('focus' in item)) continue;
      expect(text).toContain(item.name);
      for (const c of item.focus!.combos) expect(text).toContain(`${c.cost} MP`);
    }
  });

  it('stands in the wizard room only', () => {
    expect(lecternIn('shop_wizard')).not.toBeNull();
    expect(lecternIn('town')).toBeNull();
  });
});
