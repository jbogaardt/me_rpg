import { describe, expect, it } from 'vitest';
import { parseMap } from '../../src/map/types';
import { packMap } from './encode';
import { Zone } from './zone';

describe('packMap', () => {
  it('round-trips through parseMap, sharing ground stacks and object parts', () => {
    const z = new Zone(8, 6);
    z.fill('grass');
    z.paint('sand', { col: 2, row: 2, w: 3, h: 2 });
    z.forest({ col: 0, row: 0, w: 8, h: 2 });
    z.prop('rock', 6, 5);
    z.spawn(1, 4);
    const d = z.toMapData();
    const packed = JSON.parse(JSON.stringify(packMap(d))) as unknown;
    expect(parseMap(packed)).toEqual(d);
    const p = packMap(d);
    expect(p.palette.length).toBeLessThan(d.ground.length);
    expect(p.parts.length).toBeLessThan(d.objects.length);
  });
});
