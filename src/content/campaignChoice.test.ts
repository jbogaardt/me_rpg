import { describe, expect, it } from 'vitest';
import { chooseCampaign } from './campaignChoice';

describe('chooseCampaign', () => {
  const seed = () => 777;
  it('plays the build’s default, or the campaign the address names', () => {
    expect(chooseCampaign('', 'campaign1', seed)).toEqual({
      campaign: 'campaign1',
      seed: 0,
      search: null,
      tag: 'campaign1',
    });
    expect(chooseCampaign('?campaign=campaign2', 'random', seed).campaign).toBe('campaign2');
    expect(chooseCampaign('?campaign=../x', 'campaign1', seed).campaign).toBe('campaign1');
  });

  it('keeps a random campaign’s seed in the address', () => {
    expect(chooseCampaign('?seed=42', 'random', seed)).toEqual({
      campaign: 'random',
      seed: 42,
      search: null,
      tag: 'random:42',
    });
    expect(chooseCampaign('?campaign=random&x=1', 'campaign1', seed)).toEqual({
      campaign: 'random',
      seed: 777,
      search: '?campaign=random&x=1&seed=777',
      tag: 'random:777',
    });
    expect(chooseCampaign('?seed=abc', 'random', seed).seed).toBe(777);
    expect(chooseCampaign('?seed=42', 'campaign1', seed).tag).toBe('random:42'); // a seed alone asks for a random world
    expect(chooseCampaign('?seed=abc', 'campaign1', seed).campaign).toBe('campaign1');
  });

  it('chooses a live world with its seed and, if named, its arc', () => {
    expect(chooseCampaign('?campaign=live&seed=7&arc=lost_lanterns', 'campaign1', () => 1)).toEqual({
      campaign: 'live',
      seed: 7,
      arc: 'lost_lanterns',
      search: null,
      tag: 'live:7:lost_lanterns',
    });
    const fresh = chooseCampaign('?campaign=live', 'campaign1', () => 99);
    expect(fresh).toMatchObject({ campaign: 'live', seed: 99, tag: 'live:99' });
    expect(fresh.search).toBe('?campaign=live&seed=99');
    expect(chooseCampaign('?campaign=live&seed=3&arc=../x', 'campaign1', () => 1).arc).toBeUndefined();
  });
});
