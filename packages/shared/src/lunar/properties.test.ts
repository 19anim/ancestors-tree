import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { simplifiedSky } from './astronomy.ts';
import { fromDayNumber, toDayNumber } from './dates.ts';
import { lunarCalendar } from './ho-ngoc-duc.ts';

const FIRST_YEAR = 1800;
const LAST_YEAR = 2400;
const years = fc.integer({ min: FIRST_YEAR, max: LAST_YEAR });
const days = fc.integer({
  min: toDayNumber({ day: 1, month: 1, year: FIRST_YEAR }),
  max: toDayNumber({ day: 31, month: 12, year: LAST_YEAR }),
});

describe('lunar calendar invariants, 1800–2400', () => {
  it('has 12 or 13 months a year, each of 29 or 30 days, back to back', () => {
    fc.assert(
      fc.property(years, (year) => {
        const months = lunarCalendar.monthsOf(year);
        expect([12, 13]).toContain(months.length);
        for (const [i, month] of months.entries()) {
          expect([29, 30]).toContain(month.length);
          const next = months[i + 1] ?? lunarCalendar.monthsOf(year + 1)[0]!;
          expect(next.start).toBe(month.start + month.length);
        }
        expect(months.filter((m) => m.isLeap).length).toBe(months.length - 12);
      }),
    );
  });

  it('puts the leap month where the sun crosses no multiple of 30°', () => {
    fc.assert(
      fc.property(years, (year) => {
        const leap = lunarCalendar.monthsOf(year).find((m) => m.isLeap);
        if (leap) {
          expect(simplifiedSky.sunSector(leap.start)).toBe(
            simplifiedSky.sunSector(leap.start + leap.length),
          );
        }
      }),
    );
  });

  it('starts every year (Tết) between 21 January and 21 February', () => {
    for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
      const tet = fromDayNumber(lunarCalendar.monthsOf(year)[0]!.start);
      const monthDay = tet.month * 100 + tet.day;
      if (monthDay < 121 || monthDay > 221)
        throw new Error(`Tết ${year} falls on ${tet.day}/${tet.month}`);
    }
  });

  it('converts any day to lunar and back to the same day', () => {
    fc.assert(
      fc.property(days, (day) => {
        const solar = fromDayNumber(day);
        expect(lunarCalendar.lunarToSolar(lunarCalendar.solarToLunar(solar))).toEqual(solar);
      }),
      { numRuns: 2000 },
    );
  });

  it('moves one lunar day forward each solar day', () => {
    fc.assert(
      fc.property(days, (day) => {
        const today = lunarCalendar.solarToLunar(fromDayNumber(day));
        const tomorrow = lunarCalendar.solarToLunar(fromDayNumber(day + 1));
        if (tomorrow.day === 1) {
          expect(lunarCalendar.daysInLunarMonth(today.month, today.year, today.isLeap)).toBe(
            today.day,
          );
        } else {
          expect(tomorrow).toEqual({ ...today, day: today.day + 1 });
        }
      }),
      { numRuns: 2000 },
    );
  });
});
