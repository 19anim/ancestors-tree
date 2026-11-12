import { describe, expect, it } from 'vitest';
import { MAX_TILT, tiltFor } from './tilt';

describe('tiltFor', () => {
  it('is deterministic for the same id', () => {
    expect(tiltFor('64f1a2b3c4d5e6f708192a3b')).toBe(tiltFor('64f1a2b3c4d5e6f708192a3b'));
  });

  it('stays within ±MAX_TILT degrees in 0.1° steps', () => {
    for (let index = 0; index < 500; index += 1) {
      const tilt = tiltFor(`person-${index}`);
      expect(Math.abs(tilt)).toBeLessThanOrEqual(MAX_TILT);
      expect(Math.round(tilt * 10) / 10).toBe(tilt);
    }
  });

  it('spreads different ids over many angles', () => {
    const angles = new Set(Array.from({ length: 200 }, (_, index) => tiltFor(`person-${index}`)));
    expect(angles.size).toBeGreaterThanOrEqual(25);
  });
});
