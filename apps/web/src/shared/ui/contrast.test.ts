import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
  });

  it('rejects anything that is not #rrggbb', () => {
    expect(() => relativeLuminance('#fff')).toThrow('#rrggbb');
    expect(() => relativeLuminance('red')).toThrow('#rrggbb');
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#2b59ff', '#2b59ff')).toBe(1);
  });

  it('does not depend on argument order', () => {
    expect(contrastRatio('#2b59ff', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#2b59ff'),
      10,
    );
  });

  it('matches a known value', () => {
    expect(contrastRatio('#2B59FF', '#FFFFFF')).toBeCloseTo(5.28, 2);
  });
});
