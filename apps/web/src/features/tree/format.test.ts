import { describe, expect, it } from 'vitest';
import { fixturePerson } from './fixtures';
import { lifeYears, yearOf } from './format';

const ID = '64b7f0c2a1b2c3d4e5f6a0aa';

describe('life years', () => {
  it('uses the side of a date the user entered', () => {
    expect(yearOf({ source: 'solar', solar: { day: 1, month: 2, year: 1931 } })).toBe('1931');
    expect(
      yearOf({ source: 'lunar', lunar: { day: 15, month: 10, year: 1930, isLeap: false } }),
    ).toBe('1930');
    expect(yearOf({ source: 'approx', approxYear: 1900 })).toBe('1900');
    expect(yearOf(undefined)).toBeUndefined();
  });

  it('shows birth and death years when known', () => {
    const born = { source: 'approx', approxYear: 1931 } as const;
    const died = { source: 'approx', approxYear: 2004 } as const;
    expect(lifeYears(fixturePerson(ID, 'A', { birth: born }))).toBe('1931');
    expect(
      lifeYears(fixturePerson(ID, 'A', { birth: born, death: { isDeceased: true, date: died } })),
    ).toBe('1931–2004');
    expect(lifeYears(fixturePerson(ID, 'A', { birth: born, death: { isDeceased: true } }))).toBe(
      '1931–?',
    );
    expect(lifeYears(fixturePerson(ID, 'A', { death: { isDeceased: true, date: died } }))).toBe(
      '?–2004',
    );
    expect(lifeYears(fixturePerson(ID, 'A'))).toBeUndefined();
  });
});
