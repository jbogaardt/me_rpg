import { describe, expect, it } from 'vitest';
import {
  coverRadius,
  ease,
  IRIS_CLOSE,
  IRIS_DARK,
  IRIS_OPEN,
  irisAt,
  nearestEdge,
  pickTransition,
  SLIDE_TIME,
  slideAt,
  transitionLength,
} from './transition';
import { CELL } from './types';

const outdoor = { indoor: false, width: 40, height: 30 };
const room = { indoor: true, width: 12, height: 10 };

describe('door transitions', () => {
  it('eases from 0 to 1 and clamps outside', () => {
    expect(ease(-1)).toBe(0);
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(1)).toBe(1);
    expect(ease(2)).toBe(1);
  });

  it('finds the nearest map edge', () => {
    expect(nearestEdge(100, 80, 3, 40)).toEqual({ dir: 'left', distance: 3 });
    expect(nearestEdge(100, 80, 95, 40)).toEqual({ dir: 'right', distance: 5 });
    expect(nearestEdge(100, 80, 50, 2)).toEqual({ dir: 'up', distance: 2 });
    expect(nearestEdge(100, 80, 50, 79)).toEqual({ dir: 'down', distance: 1 });
  });

  it('irises into and out of rooms, wherever the door is', () => {
    expect(pickTransition(outdoor, room, 20 * CELL, 15 * CELL).kind).toBe('iris');
    expect(pickTransition(room, outdoor, 6 * CELL, 9.9 * CELL).kind).toBe('iris');
    expect(pickTransition(outdoor, room, 0.5 * CELL, 15 * CELL).kind).toBe('iris'); // a cave mouth at the edge
  });

  it('slides between open-air zones when leaving at an edge, toward that edge', () => {
    expect(pickTransition(outdoor, outdoor, 39.5 * CELL, 15 * CELL)).toEqual({ kind: 'slide', dir: 'right' });
    expect(pickTransition(outdoor, outdoor, 0.5 * CELL, 15 * CELL)).toEqual({ kind: 'slide', dir: 'left' });
    expect(pickTransition(outdoor, outdoor, 20 * CELL, 0.9 * CELL)).toEqual({ kind: 'slide', dir: 'up' });
    expect(pickTransition(outdoor, outdoor, 20 * CELL, 29.9 * CELL)).toEqual({ kind: 'slide', dir: 'down' });
    // Far from any edge (waking at the spawn after a defeat): no side to slide from.
    expect(pickTransition(outdoor, outdoor, 20 * CELL, 15 * CELL).kind).toBe('iris');
    // A gap between two biomes says which way it goes, wherever it is in the map.
    expect(pickTransition(outdoor, outdoor, 20 * CELL, 15 * CELL, 'up')).toEqual({ kind: 'slide', dir: 'up' });
    expect(pickTransition(outdoor, room, 20 * CELL, 15 * CELL, 'up').kind).toBe('iris');
  });

  it('closes the iris on the old view, stays dark, then opens on the new one', () => {
    expect(irisAt(0)).toEqual({ open: 1, closing: true });
    expect(irisAt(IRIS_CLOSE / 2).open).toBeCloseTo(0.5);
    expect(irisAt(IRIS_CLOSE + IRIS_DARK / 2)).toEqual({ open: 0, closing: false });
    expect(irisAt(IRIS_CLOSE + IRIS_DARK + IRIS_OPEN / 2).open).toBeCloseTo(0.5);
    expect(irisAt(transitionLength('iris')).open).toBe(1);
    expect(irisAt(10, true)).toEqual({ open: 0, closing: false }); // held shut while the zone loads
  });

  it('covers the whole screen from any centre', () => {
    expect(coverRadius(0, 0, 30, 40)).toBe(50);
    expect(coverRadius(15, 20, 30, 40)).toBe(25);
    expect(coverRadius(30, 0, 30, 40)).toBe(50);
  });

  it('slides the views a screen apart, the new one in from the side being walked to', () => {
    const start = slideAt(0, 'right', 640, 480);
    expect(start.old).toEqual({ x: 0, y: 0 });
    expect(start.fresh).toEqual({ x: 640, y: 0 });
    const mid = slideAt(SLIDE_TIME / 2, 'up', 640, 480);
    expect(mid.old).toEqual({ x: 0, y: 240 });
    expect(mid.fresh).toEqual({ x: 0, y: -240 });
    const end = slideAt(SLIDE_TIME, 'left', 640, 480);
    expect(end.old).toEqual({ x: 640, y: 0 });
    expect(end.fresh).toEqual({ x: 0, y: 0 });
    expect(transitionLength('slide')).toBe(SLIDE_TIME);
  });
});
