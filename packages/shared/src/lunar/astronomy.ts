import { NEW_MOON_DAY_CORRECTIONS, SUN_SECTOR_CORRECTIONS } from './corrections.ts';
import type { SkySource } from './rules.ts';

/** Vietnam's calendar is computed for UTC+7 (spec §9.1). */
export const TIME_ZONE_HOURS = 7;

const RADIANS = Math.PI / 180;

/**
 * Julian date (UT) of the given new moon. The low-precision formula from Jean Meeus,
 * "Astronomical Algorithms", as simplified by Hồ Ngọc Đức; lunation 0 is 1 January 1900.
 */
export function newMoonJulianDate(lunation: number): number {
  const t = lunation / 1236.85; // Julian centuries since 1900 January 0.5
  const t2 = t * t;
  const t3 = t2 * t;
  const mean =
    2415020.75933 +
    29.53058868 * lunation +
    0.0001178 * t2 -
    0.000000155 * t3 +
    0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * RADIANS);
  const sunAnomaly =
    (359.2242 + 29.10535608 * lunation - 0.0000333 * t2 - 0.00000347 * t3) * RADIANS;
  const moonAnomaly =
    (306.0253 + 385.81691806 * lunation + 0.0107306 * t2 + 0.00001236 * t3) * RADIANS;
  const latitude = (21.2964 + 390.67050646 * lunation - 0.0016528 * t2 - 0.00000239 * t3) * RADIANS;
  const correction =
    (0.1734 - 0.000393 * t) * Math.sin(sunAnomaly) +
    0.0021 * Math.sin(2 * sunAnomaly) -
    0.4068 * Math.sin(moonAnomaly) +
    0.0161 * Math.sin(2 * moonAnomaly) -
    0.0004 * Math.sin(3 * moonAnomaly) +
    0.0104 * Math.sin(2 * latitude) -
    0.0051 * Math.sin(sunAnomaly + moonAnomaly) -
    0.0074 * Math.sin(sunAnomaly - moonAnomaly) +
    0.0004 * Math.sin(2 * latitude + sunAnomaly) -
    0.0004 * Math.sin(2 * latitude - sunAnomaly) -
    0.0006 * Math.sin(2 * latitude + moonAnomaly) +
    0.001 * Math.sin(2 * latitude - moonAnomaly) +
    0.0005 * Math.sin(2 * moonAnomaly + sunAnomaly);
  // ΔT: the difference between terrestrial time and UT, in days.
  const deltaT =
    t < -11
      ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3
      : -0.000278 + 0.000265 * t + 0.000262 * t2;
  return mean + correction - deltaT;
}

/** Apparent solar longitude in degrees (0–360) at the given Julian date (Meeus, low precision). */
export function sunLongitude(julianDate: number): number {
  const t = (julianDate - 2451545.0) / 36525; // Julian centuries since J2000.0
  const t2 = t * t;
  const anomaly = (357.5291 + 35999.0503 * t - 0.0001559 * t2 - 0.00000048 * t * t2) * RADIANS;
  const meanLongitude = 280.46645 + 36000.76983 * t + 0.0003032 * t2;
  const center =
    (1.9146 - 0.004817 * t - 0.000014 * t2) * Math.sin(anomaly) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * anomaly) +
    0.00029 * Math.sin(3 * anomaly);
  const degrees = (meanLongitude + center) % 360;
  return degrees < 0 ? degrees + 360 : degrees;
}

/** The simplified formulas in UTC+7, with the corrections found against astronomy-engine. */
export const simplifiedSky: SkySource = {
  newMoonDay(lunation) {
    return (
      NEW_MOON_DAY_CORRECTIONS.get(lunation) ??
      Math.floor(newMoonJulianDate(lunation) + 0.5 + TIME_ZONE_HOURS / 24)
    );
  },
  sunSector(dayNumber) {
    // Local midnight at the start of the day, as a Julian date in UT.
    const midnight = dayNumber - 0.5 - TIME_ZONE_HOURS / 24;
    return SUN_SECTOR_CORRECTIONS.get(dayNumber) ?? Math.floor(sunLongitude(midnight) / 30);
  },
};
