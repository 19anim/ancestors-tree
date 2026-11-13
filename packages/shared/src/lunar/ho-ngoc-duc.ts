import { simplifiedSky } from './astronomy.ts';
import type { LunarCalendar, LunarMonth } from './calendar.ts';
import {
  assertSupportedYear,
  fromDayNumber,
  isValidSolarDate,
  MAX_YEAR,
  MIN_YEAR,
  toDayNumber,
  type LunarDate,
  type SolarDate,
} from './dates.ts';
import { lunarYearMonths, type SkySource } from './rules.ts';

/**
 * The Vietnamese lunar calendar computed with Hồ Ngọc Đức's rules for UTC+7 (spec §9.1).
 * Each lunar year is computed once per instance and then remembered.
 */
export class HoNgocDucCalendar implements LunarCalendar {
  readonly #sky: SkySource;
  readonly #years = new Map<number, readonly LunarMonth[]>();

  constructor(sky: SkySource = simplifiedSky) {
    this.#sky = sky;
  }

  /** Every month of a lunar year, in order, with the leap month after its regular month. */
  monthsOf(lunarYear: number): readonly LunarMonth[] {
    assertSupportedYear(lunarYear);
    return this.#monthsOf(lunarYear);
  }

  solarToLunar(date: SolarDate): LunarDate {
    if (!isValidSolarDate(date)) {
      throw new RangeError(`Not a real date: ${date.day}/${date.month}/${date.year}`);
    }
    assertSupportedYear(date.year);
    const day = toDayNumber(date);
    // A day before Tết belongs to the previous lunar year.
    const year = day >= this.#monthsOf(date.year)[0]!.start ? date.year : date.year - 1;
    if (year < MIN_YEAR) {
      throw new RangeError(
        `Before Tết of lunar year ${MIN_YEAR}: ${date.day}/${date.month}/${date.year}`,
      );
    }
    const month = this.#monthsOf(year).findLast((m) => m.start <= day)!;
    return { day: day - month.start + 1, month: month.month, year, isLeap: month.isLeap };
  }

  lunarToSolar(date: LunarDate): SolarDate | null {
    assertSupportedYear(date.year);
    const month = this.#find(date.month, date.year, date.isLeap);
    if (!month || !Number.isInteger(date.day) || date.day < 1 || date.day > month.length) {
      return null;
    }
    const solar = fromDayNumber(month.start + date.day - 1);
    if (solar.year > MAX_YEAR) {
      throw new RangeError(
        `After 31/12/${MAX_YEAR}: lunar ${date.day}/${date.month}/${date.year} is ${solar.day}/${solar.month}/${solar.year}`,
      );
    }
    return solar;
  }

  daysInLunarMonth(month: number, year: number, isLeap: boolean): 29 | 30 | null {
    assertSupportedYear(year);
    return this.#find(month, year, isLeap)?.length ?? null;
  }

  leapMonthOf(lunarYear: number): number | null {
    assertSupportedYear(lunarYear);
    return this.#monthsOf(lunarYear).find((m) => m.isLeap)?.month ?? null;
  }

  #find(month: number, year: number, isLeap: boolean): LunarMonth | undefined {
    return this.#monthsOf(year).find((m) => m.month === month && m.isLeap === isLeap);
  }

  #monthsOf(lunarYear: number): readonly LunarMonth[] {
    let months = this.#years.get(lunarYear);
    if (!months) {
      months = lunarYearMonths(this.#sky, lunarYear);
      this.#years.set(lunarYear, months);
    }
    return months;
  }
}

/** The calendar the app uses. */
export const lunarCalendar = new HoNgocDucCalendar();
