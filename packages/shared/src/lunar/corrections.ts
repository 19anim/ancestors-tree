/**
 * Days where the simplified formulas in `astronomy.ts` disagree with astronomy-engine,
 * a high-precision ephemeris, over 1600–2400 (ADR 0006). With these corrections the
 * calendar is identical to the one astronomy-engine gives for every year 1600–2400;
 * `differential.test.ts` checks this.
 */

/** Lunation → day number of its new moon. Each new moon falls within 5 minutes of midnight (UTC+7). */
export const NEW_MOON_DAY_CORRECTIONS: ReadonlyMap<number, number> = new Map([
  [-1487, 2371109], // 1779-10-10 00:00:08
  [2139, 2478186], // 2072-12-09 23:59:23
  [2298, 2482883], // 2085-10-19 00:00:16
  [2849, 2499153], // 2130-05-07 23:58:42
  [3097, 2506477], // 2150-05-26 23:59:52
  [3208, 2509755], // 2159-05-17 23:58:38
  [3699, 2524254], // 2199-01-26 23:58:18
  [3758, 2525996], // 2203-11-04 23:59:49
  [4207, 2539256], // 2240-02-23 23:58:31
  [4970, 2561787], // 2301-11-01 23:58:56
  [5584, 2579919], // 2351-06-24 23:55:09
  [5614, 2580805], // 2353-11-26 23:58:50
]);

/** Day number → sun sector at the start of that day. */
export const SUN_SECTOR_CORRECTIONS: ReadonlyMap<number, number> = new Map([
  [2429166, 5], // 1938-09-24: the autumn equinox (180°) falls at 00:00:01
]);
