import { describe, expect, it } from 'vitest';
import { canChiYear } from './can-chi.ts';

describe('canChiYear', () => {
  it('names the year in the sixty-year cycle', () => {
    expect(canChiYear(1924)).toBe('Giáp Tý');
    expect(canChiYear(1985)).toBe('Ất Sửu');
    expect(canChiYear(1968)).toBe('Mậu Thân');
    expect(canChiYear(2025)).toBe('Ất Tỵ');
    expect(canChiYear(2026)).toBe('Bính Ngọ');
    expect(canChiYear(1983)).toBe('Quý Hợi');
    expect(canChiYear(1984)).toBe('Giáp Tý');
  });

  it('repeats every 60 years and rejects years outside 1000–3000', () => {
    expect(canChiYear(1000)).toBe(canChiYear(1060));
    expect(() => canChiYear(999)).toThrow(RangeError);
  });
});
