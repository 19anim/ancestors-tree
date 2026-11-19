import { describe, expect, it } from 'vitest';
import { MAX_SOURCE_BYTES, checkSource, fitWithin } from './photoFile';

function file(type: string, size: number): File {
  return new File([new Uint8Array(size)], 'x', { type });
}

describe('fitWithin', () => {
  it('scales the long side down to the limit, keeping the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never scales up, and never below one pixel', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe('checkSource', () => {
  it('takes jpg, png and webp up to 25 MB', () => {
    expect(checkSource(file('image/jpeg', 10))).toBeNull();
    expect(checkSource(file('image/png', 10))).toBeNull();
    expect(checkSource(file('image/webp', 10))).toBeNull();
  });

  it('names the problem otherwise', () => {
    expect(checkSource(file('image/gif', 10))).toBe('type');
    expect(checkSource(file('image/heic', 10))).toBe('type');
    expect(checkSource(file('image/jpeg', MAX_SOURCE_BYTES + 1))).toBe('sourceTooLarge');
  });
});
