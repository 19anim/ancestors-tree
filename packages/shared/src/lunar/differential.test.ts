import * as Astronomy from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { newMoonJulianDate, simplifiedSky, TIME_ZONE_HOURS } from './astronomy.ts';
import { toDayNumber } from './dates.ts';
import { lunarYearMonths, lunationBefore, type SkySource } from './rules.ts';

const FIRST_YEAR = 1600;
const LAST_YEAR = 2400;
const UNIX_EPOCH_JULIAN_DATE = 2440587.5;
const MS_PER_DAY = 86_400_000;

const toTime = (julianDate: number) =>
  Astronomy.MakeTime(new Date((julianDate - UNIX_EPOCH_JULIAN_DATE) * MS_PER_DAY));
const toJulianDate = (date: Date) => date.getTime() / MS_PER_DAY + UNIX_EPOCH_JULIAN_DATE;

/** The same questions answered by astronomy-engine, an independent high-precision ephemeris. */
const ephemerisSky: SkySource = {
  newMoonDay(lunation) {
    const found = Astronomy.SearchMoonPhase(0, toTime(newMoonJulianDate(lunation) - 2), 4);
    if (!found) throw new Error(`No new moon found for lunation ${lunation}`);
    return Math.floor(toJulianDate(found.date) + 0.5 + TIME_ZONE_HOURS / 24);
  },
  sunSector(dayNumber) {
    const midnight = dayNumber - 0.5 - TIME_ZONE_HOURS / 24;
    return Math.floor(Astronomy.SunPosition(toTime(midnight)).elon / 30);
  },
};

describe('against astronomy-engine, 1600–2400', () => {
  it('puts every new moon on the same day', { timeout: 60_000 }, () => {
    const first = lunationBefore(toDayNumber({ day: 1, month: 1, year: FIRST_YEAR }));
    const last = lunationBefore(toDayNumber({ day: 31, month: 12, year: LAST_YEAR }));
    const differences: number[] = [];
    for (let lunation = first; lunation <= last; lunation += 1) {
      if (simplifiedSky.newMoonDay(lunation) !== ephemerisSky.newMoonDay(lunation)) {
        differences.push(lunation);
      }
    }
    expect(differences).toEqual([]);
  });

  it('builds the same lunar years', { timeout: 60_000 }, () => {
    const differences: number[] = [];
    for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
      const ours = JSON.stringify(lunarYearMonths(simplifiedSky, year));
      if (ours !== JSON.stringify(lunarYearMonths(ephemerisSky, year))) differences.push(year);
    }
    expect(differences).toEqual([]);
  });
});
