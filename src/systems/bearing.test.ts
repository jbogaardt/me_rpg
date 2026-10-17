import { describe, expect, it } from 'vitest';
import { CELL } from '../map/types';
import { bearing, direction, distanceWord } from './bearing';

const o = { x: 0, y: 0 };
describe('bearing', () => {
  it('reads the eight points with north up', () => {
    expect(bearing(o, { x: 0, y: -50 })).toBe('north');
    expect(bearing(o, { x: 50, y: -50 })).toBe('north-east');
    expect(bearing(o, { x: 50, y: 0 })).toBe('east');
    expect(bearing(o, { x: 50, y: 50 })).toBe('south-east');
    expect(bearing(o, { x: 0, y: 50 })).toBe('south');
    expect(bearing(o, { x: -50, y: 50 })).toBe('south-west');
    expect(bearing(o, { x: -50, y: 0 })).toBe('west');
    expect(bearing(o, { x: -50, y: -50 })).toBe('north-west');
  });
  it('has none on the spot', () => expect(bearing(o, o)).toBeNull());
  it('rounds off-axis to the nearest point', () => expect(bearing(o, { x: 10, y: -100 })).toBe('north'));
});

describe('distanceWord', () => {
  it('grows with the distance', () => {
    expect(distanceWord(2 * CELL)).toBe('close by');
    expect(distanceWord(10 * CELL)).toBe('a short way');
    expect(distanceWord(40 * CELL)).toBe('a good way');
    expect(distanceWord(100 * CELL)).toBe('far');
  });
});

describe('direction', () => {
  it('says the way and how far', () => {
    expect(direction(o, { x: 100 * CELL, y: -100 * CELL })).toBe('far to the north-east');
    expect(direction(o, { x: 3 * CELL, y: 0 })).toBe('close by, to the east');
  });
  it('can be read from a named place', () => {
    expect(direction(o, { x: 0, y: 12 * CELL }, 'the Old Mill')).toBe('a short way south of the Old Mill');
  });
  it('copes with the same spot', () => expect(direction(o, o)).toBe('close by'));
});
