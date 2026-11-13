import { z } from 'zod';

/** Years the lunar library accepts (spec §9.1). */
export const MIN_YEAR = 1000;
export const MAX_YEAR = 3000;

export function assertSupportedYear(year: number): void {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError(`Year ${year} is outside the supported range ${MIN_YEAR}–${MAX_YEAR}`);
  }
}

function isLeapSolarYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInSolarMonth(month: number, year: number): number {
  if (month === 2) return isLeapSolarYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

interface DayMonthYear {
  day: number;
  month: number;
  year: number;
}

/** True when the date exists in the (proleptic) Gregorian calendar. */
export function isValidSolarDate(date: DayMonthYear): boolean {
  const { day, month, year } = date;
  return (
    Number.isInteger(day) &&
    Number.isInteger(month) &&
    Number.isInteger(year) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInSolarMonth(month, year)
  );
}

const YearSchema = z.number().int().min(MIN_YEAR).max(MAX_YEAR);

/** A Gregorian date without a time or time zone, so no time zone can shift it by a day. */
export const SolarDateSchema = z
  .object({
    day: z.number().int().min(1).max(31),
    month: z.number().int().min(1).max(12),
    year: YearSchema,
  })
  .refine(isValidSolarDate, { message: 'Not a real date', path: ['day'] });

/** A Vietnamese lunar date; `isLeap` marks a leap month (tháng nhuận). */
export const LunarDateSchema = z.object({
  day: z.number().int().min(1).max(30),
  month: z.number().int().min(1).max(12),
  year: YearSchema,
  isLeap: z.boolean(),
});

export type SolarDate = z.infer<typeof SolarDateSchema>;
export type LunarDate = z.infer<typeof LunarDateSchema>;

/**
 * Julian Day Number of a date in the proleptic Gregorian calendar
 * (e.g. 1 January 2000 → 2451545). The library counts days with these numbers.
 */
export function toDayNumber({ day, month, year }: SolarDate): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

export function fromDayNumber(dayNumber: number): SolarDate {
  const a = dayNumber + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}
