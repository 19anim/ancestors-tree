import type { LunarCalendar } from './calendar.ts';
import {
  assertSupportedYear,
  isValidSolarDate,
  LunarDateSchema,
  type LunarDate,
  type SolarDate,
} from './dates.ts';
import { lunarCalendar } from './ho-ngoc-duc.ts';

/** From this year on, the whole country computed the lunar calendar for UTC+7 (spec §9.1). */
export const UNIFIED_CALENDAR_YEAR = 1976;

export type AnniversaryKind = 'first' | 'second' | 'regular';

/** Why this year's anniversary differs from the recorded death date. The UI turns codes into text. */
export type AnniversaryNote =
  | { code: 'leapMonthAbsent'; month: number }
  | { code: 'leapMonthUsesRegular'; month: number }
  | { code: 'day30Shortened'; month: number };

/** Notes for a lunar date that was derived from a solar date. */
export type ConversionNote =
  { code: 'derivedFromSolar'; solar: SolarDate } | { code: 'beforeUnifiedCalendar'; year: number };

export interface Anniversary {
  /** The day actually observed this year; never in a leap month. */
  lunarDate: LunarDate;
  solarDate: SolarDate;
  kind: AnniversaryKind;
  notes: AnniversaryNote[];
}

const KIND_BY_AGE: Record<number, AnniversaryKind> = { 1: 'first', 2: 'second' };

/**
 * The death anniversary (giỗ) in a given lunar year (spec §9.2), or `null` in or before the
 * year of death. The recorded death date is only checked for shape, not against this calendar:
 * a family's almanac may hold a day 30 that this calendar gives 29 days.
 */
export function anniversaryFor(
  deathLunar: LunarDate,
  targetLunarYear: number,
  calendar: LunarCalendar = lunarCalendar,
): Anniversary | null {
  if (!LunarDateSchema.safeParse(deathLunar).success) {
    throw new RangeError(`Not a lunar date: ${JSON.stringify(deathLunar)}`);
  }
  assertSupportedYear(targetLunarYear);
  if (targetLunarYear <= deathLunar.year) return null;

  const notes: AnniversaryNote[] = [];
  const { month } = deathLunar;
  if (deathLunar.isLeap) {
    // Families observe a leap-month death in the regular month with the same number.
    notes.push({
      code:
        calendar.leapMonthOf(targetLunarYear) === month
          ? 'leapMonthUsesRegular'
          : 'leapMonthAbsent',
      month,
    });
  }

  const length = calendar.daysInLunarMonth(month, targetLunarYear, false);
  if (length === null)
    throw new Error(`Month ${month} is missing from lunar year ${targetLunarYear}`);
  let day = deathLunar.day;
  if (day > length) {
    day = length;
    notes.push({ code: 'day30Shortened', month });
  }

  const lunarDate: LunarDate = { day, month, year: targetLunarYear, isLeap: false };
  const solarDate = calendar.lunarToSolar(lunarDate);
  if (!solarDate)
    throw new Error(`Cannot convert ${day}/${month}/${targetLunarYear} to a solar date`);
  return {
    lunarDate,
    solarDate,
    kind: KIND_BY_AGE[targetLunarYear - deathLunar.year] ?? 'regular',
    notes,
  };
}

/** Notes for a lunar date that the app derived from a solar date the family entered (spec §9.1). */
export function conversionNotes(solar: SolarDate): ConversionNote[] {
  if (!isValidSolarDate(solar)) {
    throw new RangeError(`Not a real date: ${solar.day}/${solar.month}/${solar.year}`);
  }
  assertSupportedYear(solar.year);
  const notes: ConversionNote[] = [{ code: 'derivedFromSolar', solar }];
  if (solar.year < UNIFIED_CALENDAR_YEAR) {
    notes.push({ code: 'beforeUnifiedCalendar', year: solar.year });
  }
  return notes;
}
