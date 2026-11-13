import type { LunarMonth } from './calendar.ts';
import { toDayNumber } from './dates.ts';

/**
 * The two astronomical facts the calendar rules need, already turned into local (UTC+7) days.
 * Lunation 0 is the new moon of 1 January 1900.
 */
export interface SkySource {
  /** Day number of the day that contains the given new moon. */
  newMoonDay(lunation: number): number;
  /** The 30° sector (0–11) of solar longitude the sun is in at the start of the day. */
  sunSector(dayNumber: number): number;
}

const SYNODIC_MONTH = 29.530588853;
/** Julian date of lunation 0, the new moon of 1 January 1900. */
const LUNATION_EPOCH = 2415021.076998695;

/** The lunation whose new moon is closest to the given day. */
export function lunationNear(dayNumber: number): number {
  return Math.round((dayNumber - LUNATION_EPOCH) / SYNODIC_MONTH);
}

/** The last lunation that starts (on average) before the given day. */
export function lunationBefore(dayNumber: number): number {
  return Math.floor((dayNumber - LUNATION_EPOCH) / SYNODIC_MONTH);
}

/** Sector 9 starts at 270° of solar longitude: the winter solstice. */
const WINTER_SOLSTICE_SECTOR = 9;

/** First day of month 11: the lunar month that contains the winter solstice of `year`. */
function month11Start(sky: SkySource, year: number): number {
  const lunation = lunationBefore(toDayNumber({ day: 31, month: 12, year }));
  const start = sky.newMoonDay(lunation);
  // If the sun is already past the solstice when this month begins, the solstice fell in the month before.
  return sky.sunSector(start) >= WINTER_SOLSTICE_SECTOR ? sky.newMoonDay(lunation - 1) : start;
}

function monthLength(days: number): 29 | 30 {
  if (days === 29 || days === 30) return days;
  throw new Error(`A lunar month cannot last ${days} days`);
}

/** The months from month 11 of `year` up to, not including, month 11 of `year + 1`. */
function monthsFromMonth11(sky: SkySource, year: number): LunarMonth[] {
  const from = month11Start(sky, year);
  const to = month11Start(sky, year + 1);
  const firstLunation = lunationNear(from);
  const count = to - from > 365 ? 13 : 12;
  const starts = Array.from({ length: count }, (_, i) => sky.newMoonDay(firstLunation + i));
  starts.push(to);

  // With 13 months, the first month without a major solar term (the sun crossing a multiple
  // of 30°) is the leap month. Month 11 always holds the solstice, so the search starts at 1.
  let leapIndex = -1;
  if (count === 13) {
    for (let i = 1; i < count; i += 1) {
      if (sky.sunSector(starts[i]!) === sky.sunSector(starts[i + 1]!)) {
        leapIndex = i;
        break;
      }
    }
    if (leapIndex === -1) throw new Error(`No leap month found after month 11 of ${year}`);
  }

  const months: LunarMonth[] = [];
  let month = 10; // the first month of the span is month 11
  for (let i = 0; i < count; i += 1) {
    const isLeap = i === leapIndex;
    if (!isLeap) month = (month % 12) + 1;
    months.push({
      month,
      isLeap,
      start: starts[i]!,
      length: monthLength(starts[i + 1]! - starts[i]!),
    });
  }
  return months;
}

/** Every month of a lunar year, from Tết (month 1) to the last day before the next Tết. */
export function lunarYearMonths(sky: SkySource, lunarYear: number): LunarMonth[] {
  const isMonth1 = (m: LunarMonth) => m.month === 1 && !m.isLeap;
  const before = monthsFromMonth11(sky, lunarYear - 1);
  const after = monthsFromMonth11(sky, lunarYear);
  return [
    ...before.slice(before.findIndex(isMonth1)),
    ...after.slice(0, after.findIndex(isMonth1)),
  ];
}
