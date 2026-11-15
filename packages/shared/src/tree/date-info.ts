import type { LunarDate, SolarDate } from '../lunar/dates.ts';
import { lunarCalendar } from '../lunar/ho-ngoc-duc.ts';

/** The shape of a DateInfo (spec §5), without its schema, so this file has no cycle with it. */
export interface DateSides {
  source: 'solar' | 'lunar' | 'approx';
  solar?: SolarDate;
  lunar?: LunarDate;
  approxYear?: number;
}

/** A conversion outside the calendar's years throws RangeError: there is no other side then. */
function outsideCalendar<T>(convert: () => T): T | undefined {
  try {
    return convert();
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

export function derivedLunar(solar: SolarDate): LunarDate | undefined {
  return outsideCalendar(() => lunarCalendar.solarToLunar(solar));
}

/** Undefined also for a lunar date this calendar does not have (a day 30 in a 29-day month). */
export function derivedSolar(lunar: LunarDate): SolarDate | undefined {
  return outsideCalendar(() => lunarCalendar.lunarToSolar(lunar)) ?? undefined;
}

/**
 * The side the user entered plus the side converted from it, and nothing else (spec §5). An
 * entered side that is missing gives the source alone; DateInfoSchema reports that one.
 */
export function completeDateInfo<T extends DateSides>(date: T): T {
  if (date.source === 'approx') {
    return (
      date.approxYear === undefined
        ? { source: 'approx' }
        : { source: 'approx', approxYear: date.approxYear }
    ) as T;
  }
  if (date.source === 'solar') {
    if (date.solar === undefined) return { source: 'solar' } as T;
    const lunar = derivedLunar(date.solar);
    return (
      lunar === undefined
        ? { source: 'solar', solar: date.solar }
        : { source: 'solar', solar: date.solar, lunar }
    ) as T;
  }
  if (date.lunar === undefined) return { source: 'lunar' } as T;
  const solar = derivedSolar(date.lunar);
  return (
    solar === undefined
      ? { source: 'lunar', lunar: date.lunar }
      : { source: 'lunar', lunar: date.lunar, solar }
  ) as T;
}

function sameSolar(a: SolarDate, b: SolarDate): boolean {
  return a.day === b.day && a.month === b.month && a.year === b.year;
}

function sameLunar(a: LunarDate, b: LunarDate): boolean {
  return a.day === b.day && a.month === b.month && a.year === b.year && a.isLeap === b.isLeap;
}

/** True when the date holds a side that is not the entered side or its conversion. */
export function hasWrongDerivedSide(date: DateSides): boolean {
  const complete = completeDateInfo(date);
  const solarOk =
    date.solar === undefined ||
    (complete.solar !== undefined && sameSolar(date.solar, complete.solar));
  const lunarOk =
    date.lunar === undefined ||
    (complete.lunar !== undefined && sameLunar(date.lunar, complete.lunar));
  const approxOk = date.approxYear === undefined || date.source === 'approx';
  return !(solarOk && lunarOk && approxOk);
}
