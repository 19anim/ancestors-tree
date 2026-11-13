import { describe, expect, it } from 'vitest';
import { anniversaryFor, conversionNotes } from './anniversary.ts';
import type { LunarCalendar } from './calendar.ts';

describe('anniversaryFor', () => {
  it('names the first and second anniversaries, then regular ones', () => {
    const death = { day: 12, month: 3, year: 2023, isLeap: false };
    expect(anniversaryFor(death, 2024)).toEqual({
      lunarDate: { day: 12, month: 3, year: 2024, isLeap: false },
      solarDate: { day: 20, month: 4, year: 2024 },
      kind: 'first',
      notes: [],
    });
    expect(anniversaryFor(death, 2025)).toMatchObject({
      solarDate: { day: 9, month: 4, year: 2025 },
      kind: 'second',
    });
    expect(anniversaryFor(death, 2026)).toMatchObject({
      solarDate: { day: 28, month: 4, year: 2026 },
      kind: 'regular',
    });
  });

  it('has no anniversary in or before the year of death', () => {
    const death = { day: 12, month: 3, year: 2023, isLeap: false };
    expect(anniversaryFor(death, 2023)).toBeNull();
    expect(anniversaryFor(death, 2022)).toBeNull();
  });

  it('uses the regular month when this year has no such leap month', () => {
    expect(anniversaryFor({ day: 10, month: 4, year: 2020, isLeap: true }, 2021)).toEqual({
      lunarDate: { day: 10, month: 4, year: 2021, isLeap: false },
      solarDate: { day: 21, month: 5, year: 2021 },
      kind: 'first',
      notes: [{ code: 'leapMonthAbsent', month: 4 }],
    });
  });

  it('still uses the regular month when this year has the same leap month', () => {
    expect(anniversaryFor({ day: 15, month: 2, year: 2004, isLeap: true }, 2023)).toEqual({
      lunarDate: { day: 15, month: 2, year: 2023, isLeap: false },
      solarDate: { day: 6, month: 3, year: 2023 },
      kind: 'regular',
      notes: [{ code: 'leapMonthUsesRegular', month: 2 }],
    });
  });

  it('moves day 30 to day 29 when this year the month is short', () => {
    expect(anniversaryFor({ day: 30, month: 7, year: 1990, isLeap: false }, 1991)).toEqual({
      lunarDate: { day: 29, month: 7, year: 1991, isLeap: false },
      solarDate: { day: 7, month: 9, year: 1991 },
      kind: 'first',
      notes: [{ code: 'day30Shortened', month: 7 }],
    });
    expect(anniversaryFor({ day: 30, month: 7, year: 1990, isLeap: false }, 2025)).toEqual({
      lunarDate: { day: 30, month: 7, year: 2025, isLeap: false },
      solarDate: { day: 21, month: 9, year: 2025 },
      kind: 'regular',
      notes: [],
    });
  });

  it('accepts a recorded death date even if this calendar has no such day', () => {
    // 30/12/2025 does not exist here (month 12 has 29 days), but an old almanac may say so.
    expect(anniversaryFor({ day: 30, month: 12, year: 2025, isLeap: false }, 2026)).toMatchObject({
      kind: 'first',
    });
  });

  it('rejects impossible dates and years outside 1000–3000', () => {
    expect(() => anniversaryFor({ day: 1, month: 13, year: 2023, isLeap: false }, 2024)).toThrow(
      RangeError,
    );
    expect(() => anniversaryFor({ day: 31, month: 1, year: 2023, isLeap: false }, 2024)).toThrow(
      RangeError,
    );
    expect(() => anniversaryFor({ day: 1, month: 1, year: 2023, isLeap: false }, 3001)).toThrow(
      RangeError,
    );
  });

  it('works with any LunarCalendar', () => {
    const calendar: LunarCalendar = {
      solarToLunar: () => ({ day: 1, month: 1, year: 2000, isLeap: false }),
      lunarToSolar: (date) => ({ day: date.day, month: date.month, year: date.year }),
      daysInLunarMonth: () => 29,
      leapMonthOf: () => null,
    };
    expect(
      anniversaryFor({ day: 30, month: 5, year: 2000, isLeap: false }, 2010, calendar),
    ).toEqual({
      lunarDate: { day: 29, month: 5, year: 2010, isLeap: false },
      solarDate: { day: 29, month: 5, year: 2010 },
      kind: 'regular',
      notes: [{ code: 'day30Shortened', month: 5 }],
    });
  });
});

describe('conversionNotes', () => {
  it('asks the family to confirm a lunar date derived from a solar one', () => {
    expect(conversionNotes({ day: 12, month: 5, year: 1990 })).toEqual([
      { code: 'derivedFromSolar', solar: { day: 12, month: 5, year: 1990 } },
    ]);
  });

  it('adds a warning before 1976, when the calendar was not yet computed for UTC+7 everywhere', () => {
    expect(conversionNotes({ day: 12, month: 5, year: 1960 })).toEqual([
      { code: 'derivedFromSolar', solar: { day: 12, month: 5, year: 1960 } },
      { code: 'beforeUnifiedCalendar', year: 1960 },
    ]);
    expect(conversionNotes({ day: 1, month: 1, year: 1976 })).toHaveLength(1);
    expect(conversionNotes({ day: 31, month: 12, year: 1975 })).toHaveLength(2);
  });

  it('rejects invalid dates', () => {
    expect(() => conversionNotes({ day: 31, month: 2, year: 1990 })).toThrow(RangeError);
    expect(() => conversionNotes({ day: 1, month: 1, year: 999 })).toThrow(RangeError);
  });
});
