# ADR 0006: Vietnamese lunar calendar computed for UTC+7

- Status: Accepted
- Date: 2026-11-13

## Context

Death anniversaries (giỗ) follow the Vietnamese lunar calendar, so the app converts lunar dates to solar dates every year and solar dates to lunar dates when a family only remembers the solar one (spec §9). The Vietnamese calendar is computed for UTC+7. Chinese-calendar libraries use UTC+8, and some years differ: Tết 1985 was on 21 January in Vietnam and on 20 February in China. Families also record ancestors from long before 1900, so a table covering a fixed range of years is not enough.

## Decision

**Hồ Ngọc Đức's rules on low-precision astronomy, in our own code.** A month starts on the local day of the new moon. Month 11 contains the winter solstice. In a span of 13 months from one month 11 to the next, the first month in which the sun crosses no multiple of 30° of longitude is the leap month. New moons and solar longitude come from the low-precision formulas in Jean Meeus' _Astronomical Algorithms_, as simplified by Hồ Ngọc Đức. His published code is licensed for personal, non-commercial use only, so the library is written from the formulas and rules, without his code.

**Plain dates and a fixed range.**

- Solar dates are `{ day, month, year }` in the proleptic Gregorian calendar, never a JS `Date`, so a browser's time zone cannot shift a day.
- Solar dates from Tết of lunar year 1000 (13/2/1000) to 31/12/3000 are accepted, and so are lunar dates whose solar date falls in that span (lunar years 1000–3000). Anything else throws `RangeError`: a solar date before that Tết, a lunar date after 31/12/3000, or a year outside 1000–3000.
- Each lunar year is computed once per calendar instance; all 2,001 years take about 30 ms.

**A correction table, checked against an ephemeris.** Over 1600–2400 the low-precision formulas disagree with `astronomy-engine`, a high-precision ephemeris, on 13 days:

| Correction | Day (UTC+7) | Event                      |
| ---------- | ----------- | -------------------------- |
| New moon   | 1779-10-10  | 00:00:08                   |
| New moon   | 2072-12-09  | 23:59:23                   |
| New moon   | 2085-10-19  | 00:00:16                   |
| New moon   | 2130-05-07  | 23:58:42                   |
| New moon   | 2150-05-26  | 23:59:52                   |
| New moon   | 2159-05-17  | 23:58:38                   |
| New moon   | 2199-01-26  | 23:58:18                   |
| New moon   | 2203-11-04  | 23:59:49                   |
| New moon   | 2240-02-23  | 23:58:31                   |
| New moon   | 2301-11-01  | 23:58:56                   |
| New moon   | 2351-06-24  | 23:55:09                   |
| New moon   | 2353-11-26  | 23:58:50                   |
| Solar term | 1938-09-24  | Autumn equinox at 00:00:01 |

All 13 are within five minutes of midnight. The correction table (`corrections.ts`) follows `astronomy-engine` for them, so the calendar is identical to the `astronomy-engine` one for every year 1600–2400. `differential.test.ts` checks this.

**`astronomy-engine` is test-only.** Shipping it would add about 42 KB gzip, about 20% of the app's JavaScript. It would not make old dates more correct (see the limits below), and the correction table already gives the same results for 1600–2400.

**Golden data.** Hồ Ngọc Đức's site is no longer online. The archived `amlich-ntt.js` (2014) holds precomputed tables for 1200–2199. Only decoded facts are kept (`golden-years.ts`: Tết, leap month and month lengths for 1968–2100); no code and no encoded table were copied. The library matches every year except 2054, 2077 and 2085: each has a new moon within about a minute of midnight where the table and `astronomy-engine` disagree, and the library follows `astronomy-engine`. Before 1968 the table follows the calendar Vietnam actually used, which was computed for UTC+8, so it is not a reference for this UTC+7 library there.

**Swappable.** Callers depend on the `LunarCalendar` interface. `HoNgocDucCalendar` takes a `SkySource`, so a calendar backed entirely by an ephemeris, or by an official almanac table, can replace it without touching callers.

## Consequences

- Lunar death dates are the usual way genealogies record them. An anniversary only converts a lunar date of the current year, a range verified against both the table (to 2100) and the ephemeris (to 2400).
- **Historical limits.**
  - North Vietnam computed its calendar for UTC+8 until 1967, and the South until the end of 1975.
  - Older almanacs followed rules that changed over the centuries.
  - This library applies today's rules to every year.
  - A solar date before 1976 converted to lunar can therefore differ from what the family's almanac said by a day or even a month. `conversionNotes` adds `beforeUnifiedCalendar` so the UI asks the family to confirm it, in the date input and the profile, never on the tree card.
- Between 1000 and 1600 and between 2400 and 3000 the formulas are not corrected. A new moon within minutes of midnight may land a day off there.
- **Very distant years.** Uncertainty in ΔT (Earth's slowing rotation) grows for distant years, and no source can settle a new moon within seconds of midnight in 2300.
