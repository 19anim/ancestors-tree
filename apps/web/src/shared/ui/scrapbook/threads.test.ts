import { describe, expect, it } from 'vitest';
import { midpoint, pinPoint, stitchEnds, stitchPath, threadPath } from './threads';

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

  it('keeps a minimum bend for short gaps', () => {
    expect(threadPath({ x: 0, y: 0 }, 100, { x: 50, y: 110 })).toBe(
      'M0 0 L0 100 C0 112 50 98 50 110',
    );
  });
});
