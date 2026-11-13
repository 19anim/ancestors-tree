import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { simplifiedSky } from './astronomy.ts';
import { fromDayNumber, MAX_YEAR, MIN_YEAR, toDayNumber } from './dates.ts';
import { lunarCalendar } from './ho-ngoc-duc.ts';

const FIRST_YEAR = 1800;
const LAST_YEAR = 2400;
const years = fc.integer({ min: FIRST_YEAR, max: LAST_YEAR });
const days = fc.integer({
  min: toDayNumber({ day: 1, month: 1, year: FIRST_YEAR }),
  max: toDayNumber({ day: 31, month: 12, year: LAST_YEAR }),
});

describe('lunar calendar year structure, every year 1000–3000', () => {
  it('has 12 or 13 months a year, each of 29 or 30 days, back to back', () => {
    for (let year = MIN_YEAR; year < MAX_YEAR; year += 1) {
      const months = lunarCalendar.monthsOf(year);
      if (![12, 13].includes(months.length)) throw new Error(`${year} has ${months.length} months`);
      if (months.filter((m) => m.isLeap).length !== months.length - 12) {
        throw new Error(`${year} has the wrong number of leap months`);
      }
      for (const [i, month] of months.entries()) {
        const next = months[i + 1] ?? lunarCalendar.monthsOf(year + 1)[0]!;
        if (![29, 30].includes(month.length) || next.start !== month.start + month.length) {
          throw new Error(`Month ${month.month} of ${year} is not 29 or 30 days, back to back`);
        }
      }
    }
  });

  it('starts every year (Tết) between 21 January and 21 February', () => {
    for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
      const tet = fromDayNumber(lunarCalendar.monthsOf(year)[0]!.start);
      const monthDay = tet.month * 100 + tet.day;
      if (monthDay < 121 || monthDay > 221)
        throw new Error(`Tết ${year} falls on ${tet.day}/${tet.month}`);
    }
  });

  it('puts the leap month of 1403 after month 12', () => {
    expect(lunarCalendar.leapMonthOf(1403)).toBe(12);
    expect(lunarCalendar.monthsOf(1403).at(-1)).toMatchObject({ month: 12, isLeap: true });
  });
});

describe('lunar calendar invariants, 1800–2400', () => {
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
