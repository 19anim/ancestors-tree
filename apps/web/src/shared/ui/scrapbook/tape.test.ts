import { describe, expect, it } from 'vitest';
import { BRANCH_TAPE_COUNT, tapeColor } from './tape';

describe('tapeColor', () => {
  it('maps the named kinds to their tokens', () => {
    expect(tapeColor('progenitor')).toBe('var(--tape-progenitor)');
    expect(tapeColor('in-law')).toBe('var(--tape-in-law)');
    expect(tapeColor('loose')).toBe('var(--tape-loose)');
  });

  it('cycles branch numbers through the six branch tapes', () => {
    expect(BRANCH_TAPE_COUNT).toBe(6);
    expect(tapeColor(0)).toBe('var(--tape-1)');
    expect(tapeColor(5)).toBe('var(--tape-6)');
    expect(tapeColor(6)).toBe('var(--tape-1)');
  });

  it('accepts negative and fractional branch numbers', () => {
    expect(tapeColor(-1)).toBe('var(--tape-2)');
    expect(tapeColor(2.7)).toBe('var(--tape-3)');
  });
});
