import { describe, expect, it } from 'vitest';
import {
  assertSupportedYear,
  daysInSolarMonth,
  fromDayNumber,
  isValidSolarDate,
  LunarDateSchema,
  MAX_YEAR,
  MIN_YEAR,
  SolarDateSchema,
  toDayNumber,
} from './dates.ts';

describe('solar dates', () => {
  it('counts days like the Julian Day Number', () => {
    expect(toDayNumber({ day: 1, month: 1, year: 2000 })).toBe(2451545);
    expect(toDayNumber({ day: 1, month: 1, year: 1900 })).toBe(2415021);
    expect(fromDayNumber(2451545)).toEqual({ day: 1, month: 1, year: 2000 });
  });

  it('uses the Gregorian calendar for every year, even before 1582', () => {
    const date = { day: 4, month: 10, year: 1582 };
    expect(toDayNumber({ day: 5, month: 10, year: 1582 }) - toDayNumber(date)).toBe(1);
    expect(fromDayNumber(toDayNumber({ day: 1, month: 3, year: 1000 }))).toEqual({
      day: 1,
      month: 3,
      year: 1000,
    });
  });

  it('round-trips every day from 1000 to 3000', () => {
    const first = toDayNumber({ day: 1, month: 1, year: MIN_YEAR });
    const last = toDayNumber({ day: 31, month: 12, year: MAX_YEAR });
    for (let day = first; day <= last; day += 1) {
      if (toDayNumber(fromDayNumber(day)) !== day)
        throw new Error(`Day ${day} does not round-trip`);
    }
  });

  it('knows leap years and month lengths', () => {
    expect(daysInSolarMonth(2, 2000)).toBe(29);
    expect(daysInSolarMonth(2, 1900)).toBe(28);
    expect(daysInSolarMonth(2, 2024)).toBe(29);
    expect(daysInSolarMonth(4, 2026)).toBe(30);
    expect(daysInSolarMonth(12, 2026)).toBe(31);
  });

  it('rejects dates that do not exist', () => {
    expect(isValidSolarDate({ day: 29, month: 2, year: 2024 })).toBe(true);
    expect(isValidSolarDate({ day: 29, month: 2, year: 2026 })).toBe(false);
    expect(isValidSolarDate({ day: 31, month: 4, year: 2026 })).toBe(false);
    expect(isValidSolarDate({ day: 0, month: 1, year: 2026 })).toBe(false);
    expect(isValidSolarDate({ day: 1, month: 13, year: 2026 })).toBe(false);
    expect(isValidSolarDate({ day: 1.5, month: 1, year: 2026 })).toBe(false);
  });

  it('accepts years 1000 to 3000 only', () => {
    expect(() => assertSupportedYear(1000)).not.toThrow();
    expect(() => assertSupportedYear(3000)).not.toThrow();
    expect(() => assertSupportedYear(999)).toThrow(RangeError);
    expect(() => assertSupportedYear(3001)).toThrow(RangeError);
    expect(() => assertSupportedYear(2026.5)).toThrow(RangeError);
  });
});

describe('date schemas', () => {
  it('validates solar dates', () => {
    expect(SolarDateSchema.safeParse({ day: 12, month: 5, year: 1990 }).success).toBe(true);
    expect(SolarDateSchema.safeParse({ day: 30, month: 2, year: 1990 }).success).toBe(false);
    expect(SolarDateSchema.safeParse({ day: 1, month: 1, year: 999 }).success).toBe(false);
  });

  it('validates lunar dates', () => {
    expect(
      LunarDateSchema.safeParse({ day: 30, month: 7, year: 1990, isLeap: false }).success,
    ).toBe(true);
    expect(
      LunarDateSchema.safeParse({ day: 31, month: 7, year: 1990, isLeap: false }).success,
    ).toBe(false);
    expect(
      LunarDateSchema.safeParse({ day: 1, month: 13, year: 1990, isLeap: false }).success,
    ).toBe(false);
    expect(LunarDateSchema.safeParse({ day: 1, month: 1, year: 1990 }).success).toBe(false);
  });
});
