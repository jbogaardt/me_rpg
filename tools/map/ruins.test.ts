import { describe, expect, it } from 'vitest';
import { RUIN_FRAMES } from '../../src/systems/landmarks';
import { RUINS_ATLAS } from './ruinsAtlas';

describe('ruins sheet', () => {
  it('the ruin landmark reads the pieces the cutting script put on the sheet', () => {
    expect(RUIN_FRAMES.pillar).toEqual(RUINS_ATLAS.pillarBroken);
    expect(RUIN_FRAMES.idol).toEqual(RUINS_ATLAS.statueFace);
    expect(RUIN_FRAMES.rubble).toEqual(RUINS_ATLAS.rubbleD);
  });
});
