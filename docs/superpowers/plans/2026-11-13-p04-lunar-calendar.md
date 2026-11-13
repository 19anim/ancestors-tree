# P4 Lunar Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure, fully tested lunar calendar library in `packages/shared/src/lunar/`. It converts between solar and Vietnamese lunar dates (UTC+7), names Can Chi years and computes each year's death anniversary (giỗ) with the notes the UI will show.

**Architecture:**
- **Plain dates.** `SolarDate { day, month, year }` (proleptic Gregorian) and `LunarDate { day, month, year, isLeap }`. Never a JS `Date`, so no time zone can shift a day. Internally every day is a Julian Day Number ("day number").
- **Two layers.**
  - A *sky source* (`SkySource`) answers two astronomical questions: on which day the k-th new moon falls, and which 30° sector of solar longitude the sun is in at the start of a day.
  - The *calendar rules* (`lunarYearMonths`) turn those answers into lunar months.
- **The default sky** is the simplified Meeus formulas used by Hồ Ngọc Đức, plus a 13-entry correction table where they disagree with `astronomy-engine` between 1600 and 2400.
- **The calendar class.** `HoNgocDucCalendar` memoizes each lunar year. `anniversaryFor` and `conversionNotes` sit on top of the `LunarCalendar` interface.
- **No UI changes in P4.** The UI arrives in P6.

**Tech Stack:** TypeScript 6 (run natively by Node 24), Zod 4, Vitest 5, fast-check 4.10 (dev), astronomy-engine 2.1.19 (dev, tests only).

**Spec:** [`docs/superpowers/specs/2026-11-11-ancestors-tree-design.md`](../specs/2026-11-11-ancestors-tree-design.md) §5 (`DateInfo`), §9.1, §9.2; success criterion S3. Roadmap: [`2026-11-12-roadmap.md`](2026-11-12-roadmap.md), P4 row.

**Decisions made with the user for P4**
- **Library only.** No page, converter or header line in P4; the date input arrives in P6.
- **UTC+7 only.** The app always computes with Vietnam's calendar (UTC+7). Solar dates before 1976 get a warning, shown where the date is entered or viewed in the profile, never on the tree card. (North Vietnam switched to UTC+7 in 1968, the South at the end of 1975.)
- **Out of scope here.** The spec §9.2 row "only the year / incomplete date → no anniversary" belongs to P5/P6. A `LunarDate` is always complete, so the caller decides that a `DateInfo` without a full lunar date gets no anniversary. The `InfoHint` UI is P6.
- **The Hồ Ngọc Đức algorithm runs in the app.** `astronomy-engine` (~42 KB gzip, about +20% of the app's JavaScript) is test-only. The user asked about ancestors before 1900, which is why there are differential tests for 1600–1900 and a correction table.

**Findings from planning** (prototype at `.superpowers/sdd/p4data/`, gitignored)
- **Golden source.** Hồ Ngọc Đức's site is gone (404). The archived `amlich-ntt.js` (2014) holds precomputed tables for 1200–2199. Its code is licensed for personal, non-commercial use only, so **no code and no encoded table is copied**; only decoded facts (Tết, leap month, month lengths per year) are kept, in `packages/shared/src/lunar/golden-years.ts`. That file is committed with this plan.
- **The table follows UTC+8 before 1968.** It reproduces the calendar Vietnam actually used then, so the golden range is **1968–2100**.
- **The simplified formulas are not perfect.** Compared with `astronomy-engine` over 1600–2400, they put 12 new moons on the wrong day (every one within 5 minutes of local midnight) and one solar term on the wrong day (the 1938 autumn equinox, 1.5 seconds after midnight). With the 13-entry correction table, the calendar is identical to the `astronomy-engine` one for every year 1600–2400.
- **The table and astronomy-engine disagree in three years** (2054, 2077, 2085). Each has a new moon within a minute of midnight. The library follows `astronomy-engine` there, and the fixture lists those years in `EPHEMERIS_OVERRIDES`.
- **Tết falls between 21 January and 21 February for 1800–2400.** The first 21 February is in 2319, so the spec's "20 February" is corrected.
- **Speed.** Computing all 2,001 lunar years from 1000 to 3000 takes about 30 ms.

## Global Constraints

- All lunar code lives in `packages/shared/src/lunar/` and is imported as `@ancestors-tree/shared/lunar` (a new `exports` entry). Do not re-export it from `packages/shared/src/index.ts`.
- Pure functions only: no I/O, no `Date.now()`, no global mutable state except the per-instance memo inside `HoNgocDucCalendar`.
- Time zone is fixed: UTC+7 (`TIME_ZONE_HOURS = 7`).
- Supported years: **1000–3000** (`MIN_YEAR`, `MAX_YEAR`). Public functions throw `RangeError` for a year outside that range or for an invalid solar date (e.g. 31/2). `lunarToSolar` returns `null` (not an error) for a lunar date that does not exist.
- Solar dates are proleptic Gregorian for every year (no Julian calendar before 1582).
- `astronomy-engine` and `fast-check` are **devDependencies** of `packages/shared` and may only be imported from `*.test.ts` files.
- Anniversary and conversion notes are **codes with parameters**, never sentences: `leapMonthAbsent`, `leapMonthUsesRegular`, `day30Shortened`, `derivedFromSolar`, `beforeUnifiedCalendar`.
- Leap-month death dates always use the **regular** month with the same number; day 30 becomes day 29 when that month has 29 days; `kind` is `'first'` one lunar year after death, `'second'` two years after, otherwise `'regular'`; no anniversary (`null`) in or before the year of death.
- Can Chi names: Can `Giáp Ất Bính Đinh Mậu Kỷ Canh Tân Nhâm Quý`, Chi `Tý Sửu Dần Mão Thìn Tỵ Ngọ Mùi Thân Dậu Tuất Hợi`; 1924 → "Giáp Tý".
- `packages/shared/src/**` keeps ≥ 90% line coverage (root `vitest.config.ts`).
- Code, comments and docs in English; any spec change updates the EN and VI files in the same commit.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use `git commit -F <file>`.
- Run commands from the repository root with plain `pnpm`.
- Before each commit, format new and changed files with `pnpm exec prettier --write <files>`. The code below is not guaranteed to match Prettier's line breaks.

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/lunar/dates.ts` | `SolarDate`, `LunarDate`, Zod schemas, year range, day-number conversion |
| `packages/shared/src/lunar/calendar.ts` | `LunarMonth` and the `LunarCalendar` interface |
| `packages/shared/src/lunar/rules.ts` | `SkySource` and the calendar rules: `lunarYearMonths(sky, year)` |
| `packages/shared/src/lunar/astronomy.ts` | Simplified Meeus formulas and `simplifiedSky` (applies the corrections) |
| `packages/shared/src/lunar/corrections.ts` | The 13 corrections found against astronomy-engine |
| `packages/shared/src/lunar/ho-ngoc-duc.ts` | `HoNgocDucCalendar` (memoized) and the default `lunarCalendar` |
| `packages/shared/src/lunar/can-chi.ts` | `canChiYear` |
| `packages/shared/src/lunar/anniversary.ts` | `anniversaryFor`, `conversionNotes`, note types |
| `packages/shared/src/lunar/index.ts` | Public exports |
| `packages/shared/src/lunar/golden-years.ts` | Golden fixture 1968–2100 (already committed) |
| `*.test.ts` beside each file, plus `properties.test.ts` and `differential.test.ts` | Tests |
| `docs/adr/0006-vietnamese-lunar-calendar.md` | The decision record |

---

### Task 1: Dates, schemas and package wiring

**Files:**
- Create: `packages/shared/src/lunar/dates.ts`
- Create: `packages/shared/src/lunar/dates.test.ts`
- Create: `packages/shared/src/lunar/index.ts`
- Modify: `packages/shared/package.json` (exports, devDependencies)

**Interfaces:**
- Produces:
  - `MIN_YEAR = 1000`, `MAX_YEAR = 3000`
  - `type SolarDate = { day: number; month: number; year: number }`
  - `type LunarDate = { day: number; month: number; year: number; isLeap: boolean }`
  - `SolarDateSchema`, `LunarDateSchema`
  - `assertSupportedYear(year: number): void`, which throws `RangeError`
  - `daysInSolarMonth(month: number, year: number): number`
  - `isValidSolarDate(date: SolarDate): boolean`
  - `toDayNumber(date: SolarDate): number`
  - `fromDayNumber(dayNumber: number): SolarDate`

- [ ] **Step 1: Add the dev dependencies and the export**

Run:
```bash
pnpm --filter @ancestors-tree/shared add -D fast-check@^4.10.2 astronomy-engine@2.1.19
```
Expected: both appear under `devDependencies` in `packages/shared/package.json`, and `pnpm-lock.yaml` changes. If pnpm refuses `fast-check` because of the minimum release age, pin the newest version it accepts and note it in the report.

Edit `packages/shared/package.json` so `exports` reads:
```json
  "exports": {
    ".": "./src/index.ts",
    "./lunar": "./src/lunar/index.ts"
  },
```

- [ ] **Step 2: Write the failing test**

Create `packages/shared/src/lunar/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  assertSupportedYear,
  daysInSolarMonth,
  fromDayNumber,
  isValidSolarDate,
  LunarDateSchema,
  MAX_YEAR,
  MIN_YEAR,
  SolarDateSchema,
  toDayNumber,
} from './dates.ts';

describe('solar dates', () => {
  it('counts days like the Julian Day Number', () => {
    expect(toDayNumber({ day: 1, month: 1, year: 2000 })).toBe(2451545);
    expect(toDayNumber({ day: 1, month: 1, year: 1900 })).toBe(2415021);
    expect(fromDayNumber(2451545)).toEqual({ day: 1, month: 1, year: 2000 });
  });

  it('uses the Gregorian calendar for every year, even before 1582', () => {
    const date = { day: 4, month: 10, year: 1582 };
    expect(toDayNumber({ day: 5, month: 10, year: 1582 }) - toDayNumber(date)).toBe(1);
    expect(fromDayNumber(toDayNumber({ day: 1, month: 3, year: 1000 }))).toEqual({
      day: 1,
      month: 3,
      year: 1000,
    });
  });

  it('round-trips every day from 1000 to 3000', () => {
    const first = toDayNumber({ day: 1, month: 1, year: MIN_YEAR });
    const last = toDayNumber({ day: 31, month: 12, year: MAX_YEAR });
    for (let day = first; day <= last; day += 1) {
      if (toDayNumber(fromDayNumber(day)) !== day) throw new Error(`Day ${day} does not round-trip`);
    }
  });

  it('knows leap years and month lengths', () => {
    expect(daysInSolarMonth(2, 2000)).toBe(29);
    expect(daysInSolarMonth(2, 1900)).toBe(28);
    expect(daysInSolarMonth(2, 2024)).toBe(29);
    expect(daysInSolarMonth(4, 2026)).toBe(30);
    expect(daysInSolarMonth(12, 2026)).toBe(31);
  });

  it('rejects dates that do not exist', () => {
    expect(isValidSolarDate({ day: 29, month: 2, year: 2024 })).toBe(true);
    expect(isValidSolarDate({ day: 29, month: 2, year: 2026 })).toBe(false);
    expect(isValidSolarDate({ day: 31, month: 4, year: 2026 })).toBe(false);
    expect(isValidSolarDate({ day: 0, month: 1, year: 2026 })).toBe(false);
    expect(isValidSolarDate({ day: 1, month: 13, year: 2026 })).toBe(false);
    expect(isValidSolarDate({ day: 1.5, month: 1, year: 2026 })).toBe(false);
  });

  it('accepts years 1000 to 3000 only', () => {
    expect(() => assertSupportedYear(1000)).not.toThrow();
    expect(() => assertSupportedYear(3000)).not.toThrow();
    expect(() => assertSupportedYear(999)).toThrow(RangeError);
    expect(() => assertSupportedYear(3001)).toThrow(RangeError);
    expect(() => assertSupportedYear(2026.5)).toThrow(RangeError);
  });
});

describe('date schemas', () => {
  it('validates solar dates', () => {
    expect(SolarDateSchema.safeParse({ day: 12, month: 5, year: 1990 }).success).toBe(true);
    expect(SolarDateSchema.safeParse({ day: 30, month: 2, year: 1990 }).success).toBe(false);
    expect(SolarDateSchema.safeParse({ day: 1, month: 1, year: 999 }).success).toBe(false);
  });

  it('validates lunar dates', () => {
    expect(
      LunarDateSchema.safeParse({ day: 30, month: 7, year: 1990, isLeap: false }).success,
    ).toBe(true);
    expect(LunarDateSchema.safeParse({ day: 31, month: 7, year: 1990, isLeap: false }).success).toBe(
      false,
    );
    expect(LunarDateSchema.safeParse({ day: 1, month: 13, year: 1990, isLeap: false }).success).toBe(
      false,
    );
    expect(LunarDateSchema.safeParse({ day: 1, month: 1, year: 1990 }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run packages/shared/src/lunar/dates.test.ts`
Expected: FAIL with "Cannot find module './dates.ts'" (or similar).

- [ ] **Step 4: Write the implementation**

Create `packages/shared/src/lunar/dates.ts`:
```ts
import { z } from 'zod';

/** Years the lunar library accepts (spec §9.1). */
export const MIN_YEAR = 1000;
export const MAX_YEAR = 3000;

export function assertSupportedYear(year: number): void {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError(`Year ${year} is outside the supported range ${MIN_YEAR}–${MAX_YEAR}`);
  }
}

function isLeapSolarYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInSolarMonth(month: number, year: number): number {
  if (month === 2) return isLeapSolarYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

interface DayMonthYear {
  day: number;
  month: number;
  year: number;
}

/** True when the date exists in the (proleptic) Gregorian calendar. */
export function isValidSolarDate(date: DayMonthYear): boolean {
  const { day, month, year } = date;
  return (
    Number.isInteger(day) &&
    Number.isInteger(month) &&
    Number.isInteger(year) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInSolarMonth(month, year)
  );
}

const YearSchema = z.number().int().min(MIN_YEAR).max(MAX_YEAR);

/** A Gregorian date without a time or time zone, so no time zone can shift it by a day. */
export const SolarDateSchema = z
  .object({
    day: z.number().int().min(1).max(31),
    month: z.number().int().min(1).max(12),
    year: YearSchema,
  })
  .refine(isValidSolarDate, { message: 'Not a real date', path: ['day'] });

/** A Vietnamese lunar date; `isLeap` marks a leap month (tháng nhuận). */
export const LunarDateSchema = z.object({
  day: z.number().int().min(1).max(30),
  month: z.number().int().min(1).max(12),
  year: YearSchema,
  isLeap: z.boolean(),
});

export type SolarDate = z.infer<typeof SolarDateSchema>;
export type LunarDate = z.infer<typeof LunarDateSchema>;

/**
 * Julian Day Number of a date in the proleptic Gregorian calendar
 * (e.g. 1 January 2000 → 2451545). The library counts days with these numbers.
 */
export function toDayNumber({ day, month, year }: SolarDate): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

export function fromDayNumber(dayNumber: number): SolarDate {
  const a = dayNumber + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}
```

Create `packages/shared/src/lunar/index.ts`:
```ts
export {
  assertSupportedYear,
  daysInSolarMonth,
  isValidSolarDate,
  LunarDateSchema,
  MAX_YEAR,
  MIN_YEAR,
  SolarDateSchema,
  type LunarDate,
  type SolarDate,
} from './dates.ts';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/shared/src/lunar/dates.test.ts`
Expected: PASS (8 tests).

Run: `pnpm --filter @ancestors-tree/shared typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

Write the message to `.superpowers/sdd/p4-task-1-commit.txt`:
```
feat(shared): plain solar and lunar dates for the lunar library

SolarDate and LunarDate are plain { day, month, year } values with Zod
schemas, so no time zone can shift a day. Years 1000-3000 are supported;
day numbers follow the proleptic Gregorian calendar. Adds fast-check and
astronomy-engine as test-only dependencies and the
@ancestors-tree/shared/lunar entry point.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Run:
```bash
git add packages/shared/package.json pnpm-lock.yaml packages/shared/src/lunar/dates.ts packages/shared/src/lunar/dates.test.ts packages/shared/src/lunar/index.ts
git commit -F .superpowers/sdd/p4-task-1-commit.txt
```

---

### Task 2: The calendar: sky, rules, corrections and `HoNgocDucCalendar`

**Files:**
- Create: `packages/shared/src/lunar/calendar.ts`
- Create: `packages/shared/src/lunar/rules.ts`
- Create: `packages/shared/src/lunar/astronomy.ts`
- Create: `packages/shared/src/lunar/corrections.ts`
- Create: `packages/shared/src/lunar/ho-ngoc-duc.ts`
- Create: `packages/shared/src/lunar/ho-ngoc-duc.test.ts`
- Modify: `packages/shared/src/lunar/index.ts`
- Read only: `packages/shared/src/lunar/golden-years.ts` (committed with this plan)

**Interfaces:**
- Consumes: `SolarDate`, `LunarDate`, `assertSupportedYear`, `isValidSolarDate`, `toDayNumber`, `fromDayNumber` from `./dates.ts` (Task 1).
- Produces:
  - `interface LunarMonth { readonly month: number; readonly isLeap: boolean; readonly start: number; readonly length: 29 | 30 }`. `start` is the day number of day 1.
  - `interface LunarCalendar`:
    - `solarToLunar(date: SolarDate): LunarDate`
    - `lunarToSolar(date: LunarDate): SolarDate | null`
    - `daysInLunarMonth(month: number, year: number, isLeap: boolean): 29 | 30 | null`
    - `leapMonthOf(lunarYear: number): number | null`
  - `interface SkySource { newMoonDay(lunation: number): number; sunSector(dayNumber: number): number }`
  - `lunarYearMonths(sky: SkySource, lunarYear: number): LunarMonth[]`
  - `lunationNear(dayNumber: number): number`, `lunationBefore(dayNumber: number): number`
  - `TIME_ZONE_HOURS = 7`, `newMoonJulianDate(lunation: number): number`, `sunLongitude(julianDate: number): number`, `simplifiedSky: SkySource`
  - `class HoNgocDucCalendar implements LunarCalendar` with `constructor(sky: SkySource = simplifiedSky)` and `monthsOf(lunarYear: number): readonly LunarMonth[]`
  - `const lunarCalendar: HoNgocDucCalendar`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/lunar/ho-ngoc-duc.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fromDayNumber } from './dates.ts';
import { EPHEMERIS_OVERRIDES, GOLDEN_YEARS, type GoldenYear } from './golden-years.ts';
import { HoNgocDucCalendar, lunarCalendar } from './ho-ngoc-duc.ts';

const iso = ({ day, month, year }: { day: number; month: number; year: number }) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function signature(year: number): GoldenYear {
  const months = lunarCalendar.monthsOf(year);
  return [
    year,
    iso(fromDayNumber(months[0]!.start)),
    months.find((month) => month.isLeap)?.month ?? null,
    months.map((month) => (month.length === 30 ? 'L' : 'S')).join(''),
  ];
}

describe('HoNgocDucCalendar', () => {
  it('matches the published table for every lunar year 1968–2100', () => {
    const overridden = new Map(EPHEMERIS_OVERRIDES.map((row) => [row[0], row]));
    const mismatches = GOLDEN_YEARS.map((row) => overridden.get(row[0]) ?? row).filter(
      (expected) => JSON.stringify(signature(expected[0])) !== JSON.stringify(expected),
    );
    expect(mismatches).toEqual([]);
    expect(GOLDEN_YEARS).toHaveLength(133);
  });

  it('converts solar dates to lunar dates', () => {
    expect(lunarCalendar.solarToLunar({ day: 17, month: 2, year: 2026 })).toEqual({
      day: 1,
      month: 1,
      year: 2026,
      isLeap: false,
    });
    expect(lunarCalendar.solarToLunar({ day: 16, month: 2, year: 2026 })).toEqual({
      day: 29,
      month: 12,
      year: 2025,
      isLeap: false,
    });
    expect(lunarCalendar.solarToLunar({ day: 25, month: 7, year: 2025 })).toEqual({
      day: 1,
      month: 6,
      year: 2025,
      isLeap: true,
    });
  });

  it('keeps the Vietnamese Tết where it differs from the Chinese calendar', () => {
    expect(lunarCalendar.solarToLunar({ day: 21, month: 1, year: 1985 })).toEqual({
      day: 1,
      month: 1,
      year: 1985,
      isLeap: false,
    });
    expect(lunarCalendar.solarToLunar({ day: 20, month: 2, year: 1985 })).toEqual({
      day: 1,
      month: 2,
      year: 1985,
      isLeap: false,
    });
    expect(lunarCalendar.solarToLunar({ day: 29, month: 1, year: 1968 })).toEqual({
      day: 1,
      month: 1,
      year: 1968,
      isLeap: false,
    });
  });

  it('converts lunar dates to solar dates, or null when they do not exist', () => {
    expect(lunarCalendar.lunarToSolar({ day: 1, month: 1, year: 2026, isLeap: false })).toEqual({
      day: 17,
      month: 2,
      year: 2026,
    });
    expect(lunarCalendar.lunarToSolar({ day: 1, month: 6, year: 2025, isLeap: true })).toEqual({
      day: 25,
      month: 7,
      year: 2025,
    });
    expect(lunarCalendar.lunarToSolar({ day: 30, month: 12, year: 2025, isLeap: false })).toBeNull();
    expect(lunarCalendar.lunarToSolar({ day: 1, month: 5, year: 2025, isLeap: true })).toBeNull();
    expect(lunarCalendar.lunarToSolar({ day: 1, month: 13, year: 2025, isLeap: false })).toBeNull();
    expect(lunarCalendar.lunarToSolar({ day: 0, month: 1, year: 2025, isLeap: false })).toBeNull();
  });

  it('reports month lengths and leap months', () => {
    expect(lunarCalendar.daysInLunarMonth(12, 2025, false)).toBe(29);
    expect(lunarCalendar.daysInLunarMonth(1, 2025, false)).toBe(30);
    expect(lunarCalendar.daysInLunarMonth(6, 2025, true)).toBe(29);
    expect(lunarCalendar.daysInLunarMonth(6, 2026, true)).toBeNull();
    expect(lunarCalendar.leapMonthOf(2025)).toBe(6);
    expect(lunarCalendar.leapMonthOf(2026)).toBeNull();
    expect(lunarCalendar.leapMonthOf(2033)).toBe(11);
  });

  it('accepts years 1000 to 3000 and rejects invalid input', () => {
    // Final review changed this: solarToLunar({1,1,1000}) now throws RangeError (before Tết of lunar 1000).
    expect(lunarCalendar.solarToLunar({ day: 1, month: 1, year: 1000 }).year).toBe(999);
    expect(lunarCalendar.lunarToSolar({ day: 1, month: 1, year: 3000, isLeap: false })).not.toBeNull();
    expect(() => lunarCalendar.solarToLunar({ day: 1, month: 1, year: 999 })).toThrow(RangeError);
    expect(() => lunarCalendar.solarToLunar({ day: 31, month: 2, year: 2026 })).toThrow(RangeError);
    expect(() =>
      lunarCalendar.lunarToSolar({ day: 1, month: 1, year: 3001, isLeap: false }),
    ).toThrow(RangeError);
    expect(() => lunarCalendar.monthsOf(999)).toThrow(RangeError);
    expect(() => lunarCalendar.leapMonthOf(3001)).toThrow(RangeError);
  });

  it('computes each lunar year once', () => {
    const calendar = new HoNgocDucCalendar();
    expect(calendar.monthsOf(2026)).toBe(calendar.monthsOf(2026));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/shared/src/lunar/ho-ngoc-duc.test.ts`
Expected: FAIL with "Cannot find module './ho-ngoc-duc.ts'" (or similar).

- [ ] **Step 3: Write the types and the calendar rules**

Create `packages/shared/src/lunar/calendar.ts`:
```ts
import type { LunarDate, SolarDate } from './dates.ts';

/** One lunar month. `start` is the day number (Julian Day Number) of its first day. */
export interface LunarMonth {
  readonly month: number;
  readonly isLeap: boolean;
  readonly start: number;
  readonly length: 29 | 30;
}

/** Callers depend on this interface, not on the algorithm behind it (spec §9.1). */
export interface LunarCalendar {
  solarToLunar(date: SolarDate): LunarDate;
  /** `null` when that lunar date does not exist. */
  lunarToSolar(date: LunarDate): SolarDate | null;
  /** `null` when that month does not exist in that year. */
  daysInLunarMonth(month: number, year: number, isLeap: boolean): 29 | 30 | null;
  leapMonthOf(lunarYear: number): number | null;
}
```

Create `packages/shared/src/lunar/rules.ts`:
```ts
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
    months.push({ month, isLeap, start: starts[i]!, length: monthLength(starts[i + 1]! - starts[i]!) });
  }
  return months;
}

/** Every month of a lunar year, from Tết (month 1) to the last day before the next Tết. */
export function lunarYearMonths(sky: SkySource, lunarYear: number): LunarMonth[] {
  const isMonth1 = (m: LunarMonth) => m.month === 1 && !m.isLeap;
  const before = monthsFromMonth11(sky, lunarYear - 1);
  const after = monthsFromMonth11(sky, lunarYear);
  return [...before.slice(before.findIndex(isMonth1)), ...after.slice(0, after.findIndex(isMonth1))];
}
```

- [ ] **Step 4: Write the astronomy and the corrections**

Create `packages/shared/src/lunar/corrections.ts`:
```ts
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
```

Create `packages/shared/src/lunar/astronomy.ts`:
```ts
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
  const sunAnomaly = (359.2242 + 29.10535608 * lunation - 0.0000333 * t2 - 0.00000347 * t3) * RADIANS;
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
```

- [ ] **Step 5: Write the calendar class**

Create `packages/shared/src/lunar/ho-ngoc-duc.ts`:
```ts
import { simplifiedSky } from './astronomy.ts';
import type { LunarCalendar, LunarMonth } from './calendar.ts';
import {
  assertSupportedYear,
  fromDayNumber,
  isValidSolarDate,
  toDayNumber,
  type LunarDate,
  type SolarDate,
} from './dates.ts';
import { lunarYearMonths, type SkySource } from './rules.ts';

/**
 * The Vietnamese lunar calendar computed with Hồ Ngọc Đức's rules for UTC+7 (spec §9.1).
 * Each lunar year is computed once per instance and then remembered.
 */
export class HoNgocDucCalendar implements LunarCalendar {
  readonly #sky: SkySource;
  readonly #years = new Map<number, readonly LunarMonth[]>();

  constructor(sky: SkySource = simplifiedSky) {
    this.#sky = sky;
  }

  /** Every month of a lunar year, in order, with the leap month after its regular month. */
  monthsOf(lunarYear: number): readonly LunarMonth[] {
    assertSupportedYear(lunarYear);
    return this.#monthsOf(lunarYear);
  }

  solarToLunar(date: SolarDate): LunarDate {
    if (!isValidSolarDate(date)) {
      throw new RangeError(`Not a real date: ${date.day}/${date.month}/${date.year}`);
    }
    assertSupportedYear(date.year);
    const day = toDayNumber(date);
    // A day before Tết belongs to the previous lunar year.
    const year = day >= this.#monthsOf(date.year)[0]!.start ? date.year : date.year - 1;
    const month = this.#monthsOf(year).findLast((m) => m.start <= day)!;
    return { day: day - month.start + 1, month: month.month, year, isLeap: month.isLeap };
  }

  lunarToSolar(date: LunarDate): SolarDate | null {
    assertSupportedYear(date.year);
    const month = this.#find(date.month, date.year, date.isLeap);
    if (!month || !Number.isInteger(date.day) || date.day < 1 || date.day > month.length) {
      return null;
    }
    return fromDayNumber(month.start + date.day - 1);
  }

  daysInLunarMonth(month: number, year: number, isLeap: boolean): 29 | 30 | null {
    assertSupportedYear(year);
    return this.#find(month, year, isLeap)?.length ?? null;
  }

  leapMonthOf(lunarYear: number): number | null {
    assertSupportedYear(lunarYear);
    return this.#monthsOf(lunarYear).find((m) => m.isLeap)?.month ?? null;
  }

  #find(month: number, year: number, isLeap: boolean): LunarMonth | undefined {
    return this.#monthsOf(year).find((m) => m.month === month && m.isLeap === isLeap);
  }

  #monthsOf(lunarYear: number): readonly LunarMonth[] {
    let months = this.#years.get(lunarYear);
    if (!months) {
      months = lunarYearMonths(this.#sky, lunarYear);
      this.#years.set(lunarYear, months);
    }
    return months;
  }
}

/** The calendar the app uses. */
export const lunarCalendar = new HoNgocDucCalendar();
```

Add to `packages/shared/src/lunar/index.ts`:
```ts
export type { LunarCalendar, LunarMonth } from './calendar.ts';
export { HoNgocDucCalendar, lunarCalendar } from './ho-ngoc-duc.ts';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run packages/shared/src/lunar`
Expected: PASS (all tests in `dates.test.ts` and `ho-ngoc-duc.test.ts`).

If the golden test reports mismatches, do not edit the fixture or the expected values. Check the formulas against Step 4 character by character, then report the mismatching rows.

Run: `pnpm --filter @ancestors-tree/shared typecheck && pnpm lint && pnpm format:check`
Expected: no errors.

- [ ] **Step 7: Commit**

Write to `.superpowers/sdd/p4-task-2-commit.txt`:
```
feat(shared): Vietnamese lunar calendar for UTC+7

HoNgocDucCalendar applies Hồ Ngọc Đức's calendar rules to the simplified
Meeus formulas, with 13 corrections where they disagree with
astronomy-engine. It converts both ways, reports month lengths and leap
months, and remembers each lunar year. Matches the published table for
1968-2100 except three near-midnight years that follow astronomy-engine.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Run:
```bash
git add packages/shared/src/lunar
git commit -F .superpowers/sdd/p4-task-2-commit.txt
```

---

### Task 3: Property-based and differential tests, ADR 0006

**Files:**
- Create: `packages/shared/src/lunar/properties.test.ts`
- Create: `packages/shared/src/lunar/differential.test.ts`
- Create: `docs/adr/0006-vietnamese-lunar-calendar.md`

**Interfaces:**
- Consumes:
  - `lunarCalendar`, `HoNgocDucCalendar` from `./ho-ngoc-duc.ts`
  - `lunarYearMonths`, `type SkySource` from `./rules.ts`
  - `simplifiedSky`, `newMoonJulianDate`, `TIME_ZONE_HOURS` from `./astronomy.ts`
  - `toDayNumber`, `fromDayNumber` from `./dates.ts`
- Produces: tests and the ADR only.

- [ ] **Step 1: Write the property-based tests**

Create `packages/shared/src/lunar/properties.test.ts`:
```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { simplifiedSky } from './astronomy.ts';
import { fromDayNumber, toDayNumber } from './dates.ts';
import { lunarCalendar } from './ho-ngoc-duc.ts';

const FIRST_YEAR = 1800;
const LAST_YEAR = 2400;
const years = fc.integer({ min: FIRST_YEAR, max: LAST_YEAR });
const days = fc.integer({
  min: toDayNumber({ day: 1, month: 1, year: FIRST_YEAR }),
  max: toDayNumber({ day: 31, month: 12, year: LAST_YEAR }),
});

describe('lunar calendar invariants, 1800–2400', () => {
  it('has 12 or 13 months a year, each of 29 or 30 days, back to back', () => {
    fc.assert(
      fc.property(years, (year) => {
        const months = lunarCalendar.monthsOf(year);
        expect([12, 13]).toContain(months.length);
        for (const [i, month] of months.entries()) {
          expect([29, 30]).toContain(month.length);
          const next = months[i + 1] ?? lunarCalendar.monthsOf(year + 1)[0]!;
          expect(next.start).toBe(month.start + month.length);
        }
        expect(months.filter((m) => m.isLeap).length).toBe(months.length - 12);
      }),
    );
  });

  it('puts the leap month where the sun crosses no multiple of 30°', () => {
    fc.assert(
      fc.property(years, (year) => {
        const leap = lunarCalendar.monthsOf(year).find((m) => m.isLeap);
        if (leap) {
          expect(simplifiedSky.sunSector(leap.start)).toBe(
            simplifiedSky.sunSector(leap.start + leap.length),
          );
        }
      }),
    );
  });

  it('starts every year (Tết) between 21 January and 21 February', () => {
    for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
      const tet = fromDayNumber(lunarCalendar.monthsOf(year)[0]!.start);
      const monthDay = tet.month * 100 + tet.day;
      if (monthDay < 121 || monthDay > 221) throw new Error(`Tết ${year} falls on ${tet.day}/${tet.month}`);
    }
  });

  it('converts any day to lunar and back to the same day', () => {
    fc.assert(
      fc.property(days, (day) => {
        const solar = fromDayNumber(day);
        expect(lunarCalendar.lunarToSolar(lunarCalendar.solarToLunar(solar))).toEqual(solar);
      }),
      { numRuns: 2000 },
    );
  });

  it('moves one lunar day forward each solar day', () => {
    fc.assert(
      fc.property(days, (day) => {
        const today = lunarCalendar.solarToLunar(fromDayNumber(day));
        const tomorrow = lunarCalendar.solarToLunar(fromDayNumber(day + 1));
        if (tomorrow.day === 1) {
          expect(lunarCalendar.daysInLunarMonth(today.month, today.year, today.isLeap)).toBe(today.day);
        } else {
          expect(tomorrow).toEqual({ ...today, day: today.day + 1 });
        }
      }),
      { numRuns: 2000 },
    );
  });
});
```

- [ ] **Step 2: Write the differential test**

Create `packages/shared/src/lunar/differential.test.ts`:
```ts
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
```

- [ ] **Step 3: Run the new tests**

Run: `pnpm vitest run packages/shared/src/lunar/properties.test.ts packages/shared/src/lunar/differential.test.ts`
Expected: PASS. The differential file takes a few seconds.

Then check that the test detects a regression. Temporarily comment out one line of `NEW_MOON_DAY_CORRECTIONS` (for example `[2139, 2478186]`) and run the differential test again. Expected: it fails, with lunation `2139` in the first list and year `2072` in the second. Restore the line and run it again (PASS). Do not commit the temporary change.

- [ ] **Step 4: Write ADR 0006**

Create `docs/adr/0006-vietnamese-lunar-calendar.md`:
```markdown
# ADR 0006: Vietnamese lunar calendar computed for UTC+7

- Status: Accepted
- Date: 2026-11-13

## Context

Death anniversaries (giỗ) follow the Vietnamese lunar calendar, so the app converts lunar dates to solar dates every year and solar dates to lunar dates when a family only remembers the solar one (spec §9). The Vietnamese calendar is computed for UTC+7. Chinese-calendar libraries use UTC+8, and some years differ: Tết 1985 was on 21 January in Vietnam and on 20 February in China. Families also record ancestors from long before 1900, so a table covering a fixed range of years is not enough.

## Decision

**Hồ Ngọc Đức's rules on low-precision astronomy, in our own code.** A month starts on the local day of the new moon. Month 11 contains the winter solstice. In a span of 13 months from one month 11 to the next, the first month in which the sun crosses no multiple of 30° of longitude is the leap month. New moons and solar longitude come from the low-precision formulas in Jean Meeus' *Astronomical Algorithms*, as simplified by Hồ Ngọc Đức. His published code is licensed for personal, non-commercial use only, so the library is written from the formulas and rules, without his code.

**Plain dates and a fixed range.**
- Solar dates are `{ day, month, year }` in the proleptic Gregorian calendar, never a JS `Date`, so a browser's time zone cannot shift a day.
- Years 1000–3000 are accepted, and anything else throws `RangeError`.
- Each lunar year is computed once per calendar instance; all 2,001 years take about 30 ms.

**A correction table, checked against an ephemeris.** Over 1600–2400 the low-precision formulas disagree with `astronomy-engine`, a high-precision ephemeris, on 13 days:

| Correction | Day (UTC+7) | Event |
|---|---|---|
| New moon | 1779-10-10 | 00:00:08 |
| New moon | 2072-12-09 | 23:59:23 |
| New moon | 2085-10-19 | 00:00:16 |
| New moon | 2130-05-07 | 23:58:42 |
| New moon | 2150-05-26 | 23:59:52 |
| New moon | 2159-05-17 | 23:58:38 |
| New moon | 2199-01-26 | 23:58:18 |
| New moon | 2203-11-04 | 23:59:49 |
| New moon | 2240-02-23 | 23:58:31 |
| New moon | 2301-11-01 | 23:58:56 |
| New moon | 2351-06-24 | 23:55:09 |
| New moon | 2353-11-26 | 23:58:50 |
| Solar term | 1938-09-24 | Autumn equinox at 00:00:01 |

All 13 are within five minutes of midnight. The correction table (`corrections.ts`) follows `astronomy-engine` for them, so the calendar is identical to the `astronomy-engine` one for every year 1600–2400. `differential.test.ts` checks this.

**`astronomy-engine` is test-only.** Shipping it would add about 42 KB gzip, about 20% of the app's JavaScript. It would not make old dates more correct (see the limits below), and the correction table already gives the same results for 1600–2400.

**Golden data.** Hồ Ngọc Đức's site is no longer online. The archived `amlich-ntt.js` (2014) holds precomputed tables for 1200–2199. Only decoded facts are kept (`golden-years.ts`: Tết, leap month and month lengths for 1968–2100); no code and no encoded table were copied. The library matches every year except 2054, 2077 and 2085: each has a new moon within a minute of midnight where the table and `astronomy-engine` disagree, and the library follows `astronomy-engine`. Before 1968 the table follows the calendar Vietnam actually used, which was computed for UTC+8, so it is not a reference for this UTC+7 library there.

**Swappable.** Callers depend on the `LunarCalendar` interface. `HoNgocDucCalendar` takes a `SkySource`, so a calendar backed entirely by an ephemeris, or by an official almanac table, can replace it without touching callers.

## Consequences

- Lunar death dates, the usual way genealogies record them, are converted only for the current years, where the calendar has been checked against the table and the ephemeris.
- **Historical limits.**
  - North Vietnam computed its calendar for UTC+8 until 1967, and the South until the end of 1975.
  - Older almanacs followed rules that changed over the centuries.
  - This library applies today's rules to every year.
  - A solar date before 1976 converted to lunar can therefore differ from what the family's almanac said by a day or even a month. `conversionNotes` adds `beforeUnifiedCalendar` so the UI asks the family to confirm it, in the date input and the profile, never on the tree card.
- Between 1000 and 1600 and between 2400 and 3000 the formulas are not corrected. A new moon within minutes of midnight may land a day off there.
- **Very distant years.** Uncertainty in ΔT (Earth's slowing rotation) grows for distant years, and no source can settle a new moon within seconds of midnight in 2300.
```

- [ ] **Step 5: Run the whole check**

Run: `pnpm check`
Expected: exit code 0. Shared coverage stays ≥ 90%.

- [ ] **Step 6: Commit**

Write to `.superpowers/sdd/p4-task-3-commit.txt`:
```
test(shared): property and differential tests for the lunar calendar

fast-check covers 1800-2400: month and year lengths, leap months
without a major solar term, Tết between 21 January and 21 February,
round trips and day-by-day steps. A differential test compares every
new moon and every lunar year 1600-2400 with astronomy-engine. ADR 0006
records the algorithm, the corrections, the golden data and the limits.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Run:
```bash
git add packages/shared/src/lunar/properties.test.ts packages/shared/src/lunar/differential.test.ts docs/adr/0006-vietnamese-lunar-calendar.md
git commit -F .superpowers/sdd/p4-task-3-commit.txt
```

---

### Task 4: Can Chi, anniversaries and conversion notes

**Files:**
- Create: `packages/shared/src/lunar/can-chi.ts`
- Create: `packages/shared/src/lunar/can-chi.test.ts`
- Create: `packages/shared/src/lunar/anniversary.ts`
- Create: `packages/shared/src/lunar/anniversary.test.ts`
- Modify: `packages/shared/src/lunar/index.ts`
- Modify: `docs/superpowers/plans/2026-11-12-roadmap.md` (mark P4 done)

**Interfaces:**
- Consumes:
  - `LunarCalendar` from `./calendar.ts`
  - `lunarCalendar` from `./ho-ngoc-duc.ts`
  - `assertSupportedYear`, `isValidSolarDate`, `LunarDateSchema`, `LunarDate`, `SolarDate` from `./dates.ts`
- Produces:
  - `canChiYear(lunarYear: number): string`
  - `type AnniversaryKind = 'first' | 'second' | 'regular'`
  - `type AnniversaryNote`, a union of:
    - `{ code: 'leapMonthAbsent'; month: number }`
    - `{ code: 'leapMonthUsesRegular'; month: number }`
    - `{ code: 'day30Shortened'; month: number }`
  - `type ConversionNote`, a union of:
    - `{ code: 'derivedFromSolar'; solar: SolarDate }`
    - `{ code: 'beforeUnifiedCalendar'; year: number }`
  - `interface Anniversary { lunarDate: LunarDate; solarDate: SolarDate; kind: AnniversaryKind; notes: AnniversaryNote[] }`
  - `UNIFIED_CALENDAR_YEAR = 1976`
  - `anniversaryFor(deathLunar: LunarDate, targetLunarYear: number, calendar?: LunarCalendar): Anniversary | null`
  - `conversionNotes(solar: SolarDate): ConversionNote[]`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/lunar/can-chi.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { canChiYear } from './can-chi.ts';

describe('canChiYear', () => {
  it('names the year in the sixty-year cycle', () => {
    expect(canChiYear(1924)).toBe('Giáp Tý');
    expect(canChiYear(1985)).toBe('Ất Sửu');
    expect(canChiYear(1968)).toBe('Mậu Thân');
    expect(canChiYear(2025)).toBe('Ất Tỵ');
    expect(canChiYear(2026)).toBe('Bính Ngọ');
    expect(canChiYear(1983)).toBe('Quý Hợi');
    expect(canChiYear(1984)).toBe('Giáp Tý');
  });

  it('repeats every 60 years and rejects years outside 1000–3000', () => {
    expect(canChiYear(1000)).toBe(canChiYear(1060));
    expect(() => canChiYear(999)).toThrow(RangeError);
  });
});
```

Create `packages/shared/src/lunar/anniversary.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { anniversaryFor, conversionNotes } from './anniversary.ts';
import type { LunarCalendar } from './calendar.ts';

describe('anniversaryFor', () => {
  it('names the first and second anniversaries, then regular ones', () => {
    const death = { day: 12, month: 3, year: 2023, isLeap: false };
    expect(anniversaryFor(death, 2024)).toEqual({
      lunarDate: { day: 12, month: 3, year: 2024, isLeap: false },
      solarDate: { day: 20, month: 4, year: 2024 },
      kind: 'first',
      notes: [],
    });
    expect(anniversaryFor(death, 2025)).toMatchObject({
      solarDate: { day: 9, month: 4, year: 2025 },
      kind: 'second',
    });
    expect(anniversaryFor(death, 2026)).toMatchObject({
      solarDate: { day: 28, month: 4, year: 2026 },
      kind: 'regular',
    });
  });

  it('has no anniversary in or before the year of death', () => {
    const death = { day: 12, month: 3, year: 2023, isLeap: false };
    expect(anniversaryFor(death, 2023)).toBeNull();
    expect(anniversaryFor(death, 2022)).toBeNull();
  });

  it('uses the regular month when this year has no such leap month', () => {
    expect(anniversaryFor({ day: 10, month: 4, year: 2020, isLeap: true }, 2021)).toEqual({
      lunarDate: { day: 10, month: 4, year: 2021, isLeap: false },
      solarDate: { day: 21, month: 5, year: 2021 },
      kind: 'first',
      notes: [{ code: 'leapMonthAbsent', month: 4 }],
    });
  });

  it('still uses the regular month when this year has the same leap month', () => {
    expect(anniversaryFor({ day: 15, month: 2, year: 2004, isLeap: true }, 2023)).toEqual({
      lunarDate: { day: 15, month: 2, year: 2023, isLeap: false },
      solarDate: { day: 6, month: 3, year: 2023 },
      kind: 'regular',
      notes: [{ code: 'leapMonthUsesRegular', month: 2 }],
    });
  });

  it('moves day 30 to day 29 when this year the month is short', () => {
    expect(anniversaryFor({ day: 30, month: 7, year: 1990, isLeap: false }, 1991)).toEqual({
      lunarDate: { day: 29, month: 7, year: 1991, isLeap: false },
      solarDate: { day: 7, month: 9, year: 1991 },
      kind: 'first',
      notes: [{ code: 'day30Shortened', month: 7 }],
    });
    expect(anniversaryFor({ day: 30, month: 7, year: 1990, isLeap: false }, 2025)).toEqual({
      lunarDate: { day: 30, month: 7, year: 2025, isLeap: false },
      solarDate: { day: 21, month: 9, year: 2025 },
      kind: 'regular',
      notes: [],
    });
  });

  it('accepts a recorded death date even if this calendar has no such day', () => {
    // 30/12/2025 does not exist here (month 12 has 29 days), but an old almanac may say so.
    expect(anniversaryFor({ day: 30, month: 12, year: 2025, isLeap: false }, 2026)).toMatchObject({
      kind: 'first',
    });
  });

  it('rejects impossible dates and years outside 1000–3000', () => {
    expect(() => anniversaryFor({ day: 1, month: 13, year: 2023, isLeap: false }, 2024)).toThrow(
      RangeError,
    );
    expect(() => anniversaryFor({ day: 31, month: 1, year: 2023, isLeap: false }, 2024)).toThrow(
      RangeError,
    );
    expect(() => anniversaryFor({ day: 1, month: 1, year: 2023, isLeap: false }, 3001)).toThrow(
      RangeError,
    );
  });

  it('works with any LunarCalendar', () => {
    const calendar: LunarCalendar = {
      solarToLunar: () => ({ day: 1, month: 1, year: 2000, isLeap: false }),
      lunarToSolar: (date) => ({ day: date.day, month: date.month, year: date.year }),
      daysInLunarMonth: () => 29,
      leapMonthOf: () => null,
    };
    expect(anniversaryFor({ day: 30, month: 5, year: 2000, isLeap: false }, 2010, calendar)).toEqual(
      {
        lunarDate: { day: 29, month: 5, year: 2010, isLeap: false },
        solarDate: { day: 29, month: 5, year: 2010 },
        kind: 'regular',
        notes: [{ code: 'day30Shortened', month: 5 }],
      },
    );
  });
});

describe('conversionNotes', () => {
  it('asks the family to confirm a lunar date derived from a solar one', () => {
    expect(conversionNotes({ day: 12, month: 5, year: 1990 })).toEqual([
      { code: 'derivedFromSolar', solar: { day: 12, month: 5, year: 1990 } },
    ]);
  });

  it('adds a warning before 1976, when the calendar was not yet computed for UTC+7 everywhere', () => {
    expect(conversionNotes({ day: 12, month: 5, year: 1960 })).toEqual([
      { code: 'derivedFromSolar', solar: { day: 12, month: 5, year: 1960 } },
      { code: 'beforeUnifiedCalendar', year: 1960 },
    ]);
    expect(conversionNotes({ day: 1, month: 1, year: 1976 })).toHaveLength(1);
    expect(conversionNotes({ day: 31, month: 12, year: 1975 })).toHaveLength(2);
  });

  it('rejects invalid dates', () => {
    expect(() => conversionNotes({ day: 31, month: 2, year: 1990 })).toThrow(RangeError);
    expect(() => conversionNotes({ day: 1, month: 1, year: 999 })).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/shared/src/lunar/can-chi.test.ts packages/shared/src/lunar/anniversary.test.ts`
Expected: FAIL with "Cannot find module" for `./can-chi.ts` and `./anniversary.ts`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/lunar/can-chi.ts`:
```ts
import { assertSupportedYear } from './dates.ts';

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'] as const;
const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'] as const;

/** The sexagenary (Can Chi) name of a lunar year: 1924 → "Giáp Tý". */
export function canChiYear(lunarYear: number): string {
  assertSupportedYear(lunarYear);
  return `${CAN[(lunarYear + 6) % 10]!} ${CHI[(lunarYear + 8) % 12]!}`;
}
```

Create `packages/shared/src/lunar/anniversary.ts`:
```ts
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
  | { code: 'derivedFromSolar'; solar: SolarDate }
  | { code: 'beforeUnifiedCalendar'; year: number };

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
      code: calendar.leapMonthOf(targetLunarYear) === month ? 'leapMonthUsesRegular' : 'leapMonthAbsent',
      month,
    });
  }

  const length = calendar.daysInLunarMonth(month, targetLunarYear, false);
  if (length === null) throw new Error(`Month ${month} is missing from lunar year ${targetLunarYear}`);
  let day = deathLunar.day;
  if (day > length) {
    day = length;
    notes.push({ code: 'day30Shortened', month });
  }

  const lunarDate: LunarDate = { day, month, year: targetLunarYear, isLeap: false };
  const solarDate = calendar.lunarToSolar(lunarDate);
  if (!solarDate) throw new Error(`Cannot convert ${day}/${month}/${targetLunarYear} to a solar date`);
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
```

Add to `packages/shared/src/lunar/index.ts`:
```ts
export {
  anniversaryFor,
  conversionNotes,
  UNIFIED_CALENDAR_YEAR,
  type Anniversary,
  type AnniversaryKind,
  type AnniversaryNote,
  type ConversionNote,
} from './anniversary.ts';
export { canChiYear } from './can-chi.ts';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/shared/src/lunar`
Expected: PASS, all lunar test files.

- [ ] **Step 5: Mark P4 in the roadmap**

In `docs/superpowers/plans/2026-11-12-roadmap.md`, change the start of the P4 row's second cell from `**Lunar calendar** — ` to `**Lunar calendar** ([plan](2026-11-13-p04-lunar-calendar.md)) — `, and change `packages/shared/lunar` in that row to `packages/shared/src/lunar`.

- [ ] **Step 6: Run the whole check**

Run: `pnpm check`
Expected: exit code 0.

- [ ] **Step 7: Commit**

Write to `.superpowers/sdd/p4-task-4-commit.txt`:
```
feat(shared): Can Chi years and death anniversaries

canChiYear names the year in the sixty-year cycle. anniversaryFor gives
the observed lunar and solar date, first/second/regular and note codes
(leap month, day 30), or null in or before the year of death.
conversionNotes flags lunar dates derived from solar ones, with a
warning before 1976.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Run:
```bash
git add packages/shared/src/lunar docs/superpowers/plans/2026-11-12-roadmap.md
git commit -F .superpowers/sdd/p4-task-4-commit.txt
```
