import { lunarCalendar } from '@ancestors-tree/shared/lunar';
import { describe, expect, it } from 'vitest';
import {
  draftFromDateInfo,
  draftToDateInfo,
  EMPTY_DATE_DRAFT,
  leapMonthOf,
  type DateDraft,
} from './dateDraft';

function draft(overrides: Partial<DateDraft>): DateDraft {
  return { ...EMPTY_DATE_DRAFT, ...overrides };
}

/** A year with a leap month, found through the calendar so the test does not hard-code one. */
function leapYear(): { year: number; month: number } {
  for (let year = 2020; year < 2040; year += 1) {
    const month = lunarCalendar.leapMonthOf(year);
    if (month !== null) return { year, month };
  }
  throw new Error('No leap year found');
}

describe('draftToDateInfo', () => {
  it('turns an empty draft into no date', () => {
    expect(draftToDateInfo(EMPTY_DATE_DRAFT)).toEqual({ ok: true, value: null });
    expect(draftToDateInfo(draft({ mode: 'solar' }))).toEqual({ ok: true, value: null });
  });

  it('completes a lunar date with its solar date', () => {
    expect(draftToDateInfo(draft({ mode: 'lunar', day: '1', month: '1', year: '2026' }))).toEqual({
      ok: true,
      value: {
        source: 'lunar',
        lunar: { day: 1, month: 1, year: 2026, isLeap: false },
        solar: { day: 17, month: 2, year: 2026 },
      },
    });
  });

  it('completes a solar date with its lunar date', () => {
    const result = draftToDateInfo(draft({ mode: 'solar', day: '17', month: '2', year: '2026' }));
    expect(result).toEqual({
      ok: true,
      value: {
        source: 'solar',
        solar: { day: 17, month: 2, year: 2026 },
        lunar: { day: 1, month: 1, year: 2026, isLeap: false },
      },
    });
  });

  it('keeps an approximate year alone', () => {
    expect(draftToDateInfo(draft({ mode: 'approx', year: ' 1920 ' }))).toEqual({
      ok: true,
      value: { source: 'approx', approxYear: 1920 },
    });
  });

  it('explains what is wrong', () => {
    expect(draftToDateInfo(draft({ mode: 'lunar', year: '1950' }))).toEqual({
      ok: false,
      error: 'yearOnly',
    });
    expect(draftToDateInfo(draft({ mode: 'solar', day: '3', year: '1950' }))).toEqual({
      ok: false,
      error: 'incomplete',
    });
    expect(draftToDateInfo(draft({ mode: 'solar', day: 'a', month: '2', year: '1950' }))).toEqual({
      ok: false,
      error: 'notANumber',
    });
    expect(draftToDateInfo(draft({ mode: 'approx', year: '999' }))).toEqual({
      ok: false,
      error: 'yearRange',
    });
    expect(draftToDateInfo(draft({ mode: 'solar', day: '30', month: '2', year: '2026' }))).toEqual({
      ok: false,
      error: 'notADate',
    });
    const { year, month } = leapYear();
    const otherMonth = month === 12 ? 1 : month + 1;
    expect(
      draftToDateInfo(
        draft({
          mode: 'lunar',
          day: '1',
          month: String(otherMonth),
          year: String(year),
          isLeap: true,
        }),
      ),
    ).toEqual({ ok: false, error: 'leapMonthAbsent' });
  });

  it('refuses a lunar day the month does not have', () => {
    let short: number | null = null;
    for (let month = 1; month <= 12 && short === null; month += 1) {
      if (lunarCalendar.daysInLunarMonth(month, 2026, false) === 29) short = month;
    }
    expect(
      draftToDateInfo(draft({ mode: 'lunar', day: '30', month: String(short), year: '2026' })),
    ).toEqual({ ok: false, error: 'notADate' });
  });
});

describe('draftFromDateInfo and leapMonthOf', () => {
  it('shows the side the user entered', () => {
    expect(
      draftFromDateInfo({ source: 'solar', solar: { day: 17, month: 2, year: 2026 } }),
    ).toEqual({ mode: 'solar', day: '17', month: '2', year: '2026', isLeap: false });
    expect(draftFromDateInfo({ source: 'approx', approxYear: 1920 })).toEqual({
      mode: 'approx',
      day: '',
      month: '',
      year: '1920',
      isLeap: false,
    });
    expect(draftFromDateInfo(undefined)).toEqual(EMPTY_DATE_DRAFT);
  });

  it('finds the leap month of the lunar year typed', () => {
    const { year, month } = leapYear();
    expect(leapMonthOf(draft({ mode: 'lunar', year: String(year) }))).toBe(month);
    expect(leapMonthOf(draft({ mode: 'lunar', year: '' }))).toBeNull();
  });
});
