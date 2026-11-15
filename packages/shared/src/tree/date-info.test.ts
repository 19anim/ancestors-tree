import { describe, expect, it } from 'vitest';
import { lunarCalendar } from '../lunar/index.ts';
import { completeDateInfo, derivedLunar, derivedSolar, hasWrongDerivedSide } from './date-info.ts';
import { DateInfoSchema } from './schemas.ts';

const TET_2026 = { day: 17, month: 2, year: 2026 };
const TET_2026_LUNAR = { day: 1, month: 1, year: 2026, isLeap: false };

/** A regular month of lunar 2026 with 29 days, found through the calendar itself. */
function shortMonth2026(): number {
  for (let month = 1; month <= 12; month += 1) {
    if (lunarCalendar.daysInLunarMonth(month, 2026, false) === 29) return month;
  }
  throw new Error('Lunar 2026 has no 29-day month');
}

describe('completeDateInfo', () => {
  it('adds the lunar date to a solar date', () => {
    expect(derivedLunar(TET_2026)).toEqual(TET_2026_LUNAR);
    expect(completeDateInfo({ source: 'solar', solar: TET_2026 })).toEqual({
      source: 'solar',
      solar: TET_2026,
      lunar: TET_2026_LUNAR,
    });
  });

  it('adds the solar date to a lunar date', () => {
    expect(derivedSolar(TET_2026_LUNAR)).toEqual(TET_2026);
    expect(completeDateInfo({ source: 'lunar', lunar: TET_2026_LUNAR })).toEqual({
      source: 'lunar',
      lunar: TET_2026_LUNAR,
      solar: TET_2026,
    });
  });

  it('keeps a lunar day 30 that this calendar does not have, without a solar side', () => {
    const lunar = { day: 30, month: shortMonth2026(), year: 2026, isLeap: false };
    expect(derivedSolar(lunar)).toBeUndefined();
    expect(completeDateInfo({ source: 'lunar', lunar })).toEqual({ source: 'lunar', lunar });
  });

  it('drops sides that do not belong to an approximate year', () => {
    expect(completeDateInfo({ source: 'approx', approxYear: 1920, solar: TET_2026 })).toEqual({
      source: 'approx',
      approxYear: 1920,
    });
  });

  it('leaves the lunar side out before the calendar starts', () => {
    const solar = { day: 1, month: 1, year: 1000 };
    expect(derivedLunar(solar)).toBeUndefined();
    expect(completeDateInfo({ source: 'solar', solar })).toEqual({ source: 'solar', solar });
  });
});

describe('hasWrongDerivedSide', () => {
  it('accepts the entered side alone, or with its conversion', () => {
    expect(hasWrongDerivedSide({ source: 'solar', solar: TET_2026 })).toBe(false);
    expect(hasWrongDerivedSide({ source: 'solar', solar: TET_2026, lunar: TET_2026_LUNAR })).toBe(
      false,
    );
  });

  it('rejects another side that is not the conversion', () => {
    const wrong = { ...TET_2026_LUNAR, day: 2 };
    expect(hasWrongDerivedSide({ source: 'solar', solar: TET_2026, lunar: wrong })).toBe(true);
    expect(
      hasWrongDerivedSide({
        source: 'lunar',
        lunar: TET_2026_LUNAR,
        solar: { ...TET_2026, day: 18 },
      }),
    ).toBe(true);
    expect(hasWrongDerivedSide({ source: 'approx', approxYear: 1920, solar: TET_2026 })).toBe(true);
    expect(hasWrongDerivedSide({ source: 'solar', solar: TET_2026, approxYear: 2026 })).toBe(true);
  });

  it('is enforced by DateInfoSchema, so the server refuses it too', () => {
    const wrong = { source: 'solar', solar: TET_2026, lunar: { ...TET_2026_LUNAR, day: 2 } };
    expect(DateInfoSchema.safeParse(wrong).success).toBe(false);
    expect(
      DateInfoSchema.safeParse({ source: 'solar', solar: TET_2026, lunar: TET_2026_LUNAR }).success,
    ).toBe(true);
  });
});
