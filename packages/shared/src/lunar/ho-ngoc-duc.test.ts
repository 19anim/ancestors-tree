import { describe, expect, it } from 'vitest';
import { fromDayNumber } from './dates.ts';
import { EPHEMERIS_OVERRIDES, GOLDEN_YEARS, type GoldenYear } from './golden-years.ts';
import { HoNgocDucCalendar, lunarCalendar } from './ho-ngoc-duc.ts';

const iso = ({ day, month, year }: { day: number; month: number; year: number }) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function signature(year: number): GoldenYear {
  const months = lunarCalendar.monthsOf(year);
  return [
    year,
    iso(fromDayNumber(months[0]!.start)),
    months.find((month) => month.isLeap)?.month ?? null,
    months.map((month) => (month.length === 30 ? 'L' : 'S')).join(''),
  ];
}

describe('HoNgocDucCalendar', () => {
  it('matches the published table for every lunar year 1968–2100', () => {
    const overridden = new Map(EPHEMERIS_OVERRIDES.map((row) => [row[0], row]));
    const mismatches = GOLDEN_YEARS.map((row) => overridden.get(row[0]) ?? row).filter(
      (expected) => JSON.stringify(signature(expected[0])) !== JSON.stringify(expected),
    );
    expect(mismatches).toEqual([]);
    expect(GOLDEN_YEARS).toHaveLength(133);
  });

  it('converts solar dates to lunar dates', () => {
    expect(lunarCalendar.solarToLunar({ day: 17, month: 2, year: 2026 })).toEqual({
      day: 1,
      month: 1,
      year: 2026,
      isLeap: false,
    });
    expect(lunarCalendar.solarToLunar({ day: 16, month: 2, year: 2026 })).toEqual({
      day: 29,
      month: 12,
      year: 2025,
      isLeap: false,
    });
    expect(lunarCalendar.solarToLunar({ day: 25, month: 7, year: 2025 })).toEqual({
      day: 1,
      month: 6,
      year: 2025,
      isLeap: true,
    });
  });

  it('keeps the Vietnamese Tết where it differs from the Chinese calendar', () => {
    expect(lunarCalendar.solarToLunar({ day: 21, month: 1, year: 1985 })).toEqual({
      day: 1,
      month: 1,
      year: 1985,
      isLeap: false,
    });
    expect(lunarCalendar.solarToLunar({ day: 20, month: 2, year: 1985 })).toEqual({
      day: 1,
      month: 2,
      year: 1985,
      isLeap: false,
    });
    expect(lunarCalendar.solarToLunar({ day: 29, month: 1, year: 1968 })).toEqual({
      day: 1,
      month: 1,
      year: 1968,
      isLeap: false,
    });
  });

  it('converts lunar dates to solar dates, or null when they do not exist', () => {
    expect(lunarCalendar.lunarToSolar({ day: 1, month: 1, year: 2026, isLeap: false })).toEqual({
      day: 17,
      month: 2,
      year: 2026,
    });
    expect(lunarCalendar.lunarToSolar({ day: 1, month: 6, year: 2025, isLeap: true })).toEqual({
      day: 25,
      month: 7,
      year: 2025,
    });
    expect(
      lunarCalendar.lunarToSolar({ day: 30, month: 12, year: 2025, isLeap: false }),
    ).toBeNull();
    expect(lunarCalendar.lunarToSolar({ day: 1, month: 5, year: 2025, isLeap: true })).toBeNull();
    expect(lunarCalendar.lunarToSolar({ day: 1, month: 13, year: 2025, isLeap: false })).toBeNull();
    expect(lunarCalendar.lunarToSolar({ day: 0, month: 1, year: 2025, isLeap: false })).toBeNull();
  });

  it('reports month lengths and leap months', () => {
    expect(lunarCalendar.daysInLunarMonth(12, 2025, false)).toBe(29);
    expect(lunarCalendar.daysInLunarMonth(1, 2025, false)).toBe(30);
    expect(lunarCalendar.daysInLunarMonth(6, 2025, true)).toBe(29);
    expect(lunarCalendar.daysInLunarMonth(6, 2026, true)).toBeNull();
    expect(lunarCalendar.leapMonthOf(2025)).toBe(6);
    expect(lunarCalendar.leapMonthOf(2026)).toBeNull();
    expect(lunarCalendar.leapMonthOf(2033)).toBe(11);
  });

  it('accepts years 1000 to 3000 and rejects invalid input', () => {
    expect(lunarCalendar.solarToLunar({ day: 1, month: 1, year: 1000 }).year).toBe(999);
    expect(
      lunarCalendar.lunarToSolar({ day: 1, month: 1, year: 3000, isLeap: false }),
    ).not.toBeNull();
    expect(() => lunarCalendar.solarToLunar({ day: 1, month: 1, year: 999 })).toThrow(RangeError);
    expect(() => lunarCalendar.solarToLunar({ day: 31, month: 2, year: 2026 })).toThrow(RangeError);
    expect(() =>
      lunarCalendar.lunarToSolar({ day: 1, month: 1, year: 3001, isLeap: false }),
    ).toThrow(RangeError);
    expect(() => lunarCalendar.monthsOf(999)).toThrow(RangeError);
    expect(() => lunarCalendar.leapMonthOf(3001)).toThrow(RangeError);
  });

  it('computes each lunar year once', () => {
    const calendar = new HoNgocDucCalendar();
    expect(calendar.monthsOf(2026)).toBe(calendar.monthsOf(2026));
  });
});
