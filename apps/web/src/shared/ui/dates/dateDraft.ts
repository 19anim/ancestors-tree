import { isValidSolarDate, lunarCalendar, MAX_YEAR, MIN_YEAR } from '@ancestors-tree/shared/lunar';
import { completeDateInfo, type DateInfo } from '@ancestors-tree/shared/tree';

export type DateMode = 'solar' | 'lunar' | 'approx';

/** What the date fields hold while the user types: strings, so a half-typed value survives. */
export interface DateDraft {
  mode: DateMode;
  day: string;
  month: string;
  year: string;
  isLeap: boolean;
}

/** Lunar first: most families know the lunar dates of their elders (spec §9). */
export const EMPTY_DATE_DRAFT: DateDraft = {
  mode: 'lunar',
  day: '',
  month: '',
  year: '',
  isLeap: false,
};

export type DateDraftError =
  'incomplete' | 'yearOnly' | 'notANumber' | 'yearRange' | 'notADate' | 'leapMonthAbsent';

export type DraftResult =
  { ok: true; value: DateInfo | null } | { ok: false; error: DateDraftError };

const DIGITS = /^\d{1,4}$/;

function parsePart(text: string): number | null | 'nan' {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return DIGITS.test(trimmed) ? Number(trimmed) : 'nan';
}

function yearInRange(year: number): boolean {
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

/** The DateInfo a draft stands for (spec §5), or why it cannot be one. */
export function draftToDateInfo(draft: DateDraft): DraftResult {
  const year = parsePart(draft.year);
  if (draft.mode === 'approx') {
    if (year === null) return { ok: true, value: null };
    if (year === 'nan') return { ok: false, error: 'notANumber' };
    if (!yearInRange(year)) return { ok: false, error: 'yearRange' };
    return { ok: true, value: { source: 'approx', approxYear: year } };
  }

  const day = parsePart(draft.day);
  const month = parsePart(draft.month);
  if (day === null && month === null && year === null) return { ok: true, value: null };
  if (day === 'nan' || month === 'nan' || year === 'nan') return { ok: false, error: 'notANumber' };
  if (day === null && month === null) return { ok: false, error: 'yearOnly' };
  if (day === null || month === null || year === null) return { ok: false, error: 'incomplete' };
  if (!yearInRange(year)) return { ok: false, error: 'yearRange' };

  if (draft.mode === 'solar') {
    const solar = { day, month, year };
    if (!isValidSolarDate(solar)) return { ok: false, error: 'notADate' };
    return { ok: true, value: completeDateInfo({ source: 'solar', solar }) };
  }

  if (month < 1 || month > 12) return { ok: false, error: 'notADate' };
  if (draft.isLeap && lunarCalendar.leapMonthOf(year) !== month) {
    return { ok: false, error: 'leapMonthAbsent' };
  }
  const length = lunarCalendar.daysInLunarMonth(month, year, draft.isLeap);
  if (length === null || day < 1 || day > length) return { ok: false, error: 'notADate' };
  const lunar = { day, month, year, isLeap: draft.isLeap };
  return { ok: true, value: completeDateInfo({ source: 'lunar', lunar }) };
}

/** The fields for a stored date: the side the user entered (spec §5 keeps it as the truth). */
export function draftFromDateInfo(date: DateInfo | undefined): DateDraft {
  if (!date) return EMPTY_DATE_DRAFT;
  if (date.source === 'approx') {
    return { ...EMPTY_DATE_DRAFT, mode: 'approx', year: String(date.approxYear ?? '') };
  }
  if (date.source === 'solar' && date.solar) {
    const { day, month, year } = date.solar;
    return {
      mode: 'solar',
      day: String(day),
      month: String(month),
      year: String(year),
      isLeap: false,
    };
  }
  if (date.lunar) {
    const { day, month, year, isLeap } = date.lunar;
    return { mode: 'lunar', day: String(day), month: String(month), year: String(year), isLeap };
  }
  return EMPTY_DATE_DRAFT;
}

/** The leap month of the lunar year typed, or null (no full year yet, or no leap month). */
export function leapMonthOf(draft: DateDraft): number | null {
  const year = parsePart(draft.year);
  if (typeof year !== 'number' || !yearInRange(year)) return null;
  return lunarCalendar.leapMonthOf(year);
}
