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
  });
});
