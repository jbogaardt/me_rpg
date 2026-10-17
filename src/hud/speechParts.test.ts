import { describe, expect, it } from 'vitest';
import { speechParts } from './speechParts';

describe('speechParts', () => {
  it('cuts a caption into sentences', () => {
    expect(speechParts('Well met. Where are you going? Be careful!')).toEqual([
      'Well met.',
      'Where are you going?',
      'Be careful!',
    ]);
  });

  it('keeps a line with no stop whole, and drops blanks', () => {
    expect(speechParts('  Follow the compass  ')).toEqual(['Follow the compass']);
    expect(speechParts('   ')).toEqual([]);
    expect(speechParts('')).toEqual([]);
  });
});
