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
  solarToLunar(date: SolarDate): LunarDate;
  /** `null` when that lunar date does not exist. */
  lunarToSolar(date: LunarDate): SolarDate | null;
  /** `null` when that month does not exist in that year. */
  daysInLunarMonth(month: number, year: number, isLeap: boolean): 29 | 30 | null;
  leapMonthOf(lunarYear: number): number | null;
}
