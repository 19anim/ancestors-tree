import type { LunarDate, SolarDate } from './dates.ts';

/** One lunar month. `start` is the day number (Julian Day Number) of its first day. */
export interface LunarMonth {
  readonly month: number;
  readonly isLeap: boolean;
  readonly start: number;
  readonly length: 29 | 30;
}

/** Callers depend on this interface, not on the algorithm behind it (spec §9.1). */
export interface LunarCalendar {
  /** Throws `RangeError` for a solar date before Tết of lunar year 1000. */
  solarToLunar(date: SolarDate): LunarDate;
  /**
   * `null` when that lunar date does not exist. Throws `RangeError` when it falls after
   * 31 December of solar year 3000.
   */
  lunarToSolar(date: LunarDate): SolarDate | null;
  /** `null` when that month does not exist in that year. */
  daysInLunarMonth(month: number, year: number, isLeap: boolean): 29 | 30 | null;
  leapMonthOf(lunarYear: number): number | null;
}
