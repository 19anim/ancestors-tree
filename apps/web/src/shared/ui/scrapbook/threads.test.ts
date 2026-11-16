import { describe, expect, it } from 'vitest';
import {
  midpoint,
  pinPoint,
  stitchEnds,
  stitchPath,
  threadBranchPath,
  threadPath,
} from './threads';

const CARD = { width: 100, height: 124 };

describe('thread geometry', () => {
  it('finds the midpoint of two points', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });

  it('joins the facing edges of two cards at mid-height, in either order', () => {
    const thinh = { x: 170, y: 40 };
    const hoa = { x: 298, y: 40 };
    const expected = { left: { x: 270, y: 102 }, right: { x: 298, y: 102 } };
    expect(stitchEnds(thinh, hoa, CARD)).toEqual(expected);
    expect(stitchEnds(hoa, thinh, CARD)).toEqual(expected);
  });

  it('draws the stitch as a straight line', () => {
    expect(stitchPath({ x: 270, y: 102 }, { x: 298, y: 102 })).toBe('M270 102 L298 102');
  });

  it('puts the pin above the centre of the child card', () => {
    expect(pinPoint({ x: 90, y: 240 }, CARD)).toEqual({ x: 140, y: 224 });
  });

  it('drops straight down, then curves to the pin', () => {
    expect(threadPath({ x: 284, y: 102 }, 172, { x: 140, y: 224 })).toBe(
      'M284 102 L284 172 C284 198 140 198 140 224',
    );
  });

  it("gives a child's own part of its thread: not the trunk its siblings share", () => {
    const knot = { x: 284, y: 102 };
    const own = threadBranchPath(knot, 172, { x: 140, y: 224 });
    // It starts below the branch point, on the curve, and ends at the pin.
    expect(own).toBe('M261.5 187.44 C221 199.63 140 204.5 140 224');
    const startX = (path: string) => Number(/^M(\S+)/.exec(path)?.[1]);
    // Two siblings a card apart: their own parts start further apart than a 12 px hit stroke.
    const left = threadBranchPath(knot, 172, { x: 214, y: 224 });
    const right = threadBranchPath(knot, 172, { x: 354, y: 224 });
    expect(startX(right) - startX(left)).toBeGreaterThan(12);
    // A child straight below the knot: a straight run from below the branch point.
    expect(threadBranchPath(knot, 172, { x: 284, y: 224 })).toBe(
      'M284 187.44 C284 199.63 284 204.5 284 224',
    );
  });

  it('keeps a minimum bend for short gaps', () => {
    expect(threadPath({ x: 0, y: 0 }, 100, { x: 50, y: 110 })).toBe(
      'M0 0 L0 100 C0 112 50 98 50 110',
    );
  });
});
