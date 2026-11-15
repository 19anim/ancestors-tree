# P6b Profile and Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A profile panel that everyone can open from a card and editors can edit, with lunar/solar dates, date marks on the cards, "Add parent", a right-click card menu and arrow keys between relatives.

**Architecture:**
- The open person lives in the URL (`?person=<id>`). `ProfilePanel` reads it and shows the person in read mode, or in edit mode for editors. Saving sends one `updatePerson` with only the fields changed since the form opened.
- Dates are typed as a `DateDraft` (strings, so half-typed values survive). Pure functions turn a draft into a `DateInfo`, which carries the entered side plus the derived side.
- The shared `DateInfoSchema` rejects a derived side that does not match the conversion, so the server enforces it too.
- The panel's actions, the card's right-click menu and the add forms all share one `usePersonActions` list.

**Tech Stack:** React 19, react-router 8 (`useSearchParams`, `useBlocker`), Zustand, React Hook Form with the Zod 4 resolver, i18next, Tailwind, `radix-ui` (ContextMenu), `@xyflow/react` 12, Vitest with Testing Library, and Playwright.

## Global Constraints

- **Spec.** The specs are `docs/superpowers/specs/2026-11-11-ancestors-tree-design.md` (EN) and `.vi.md` (VI): §5, §7.6, §7.8, §8 and §13.3. Any design change updates both files in the same commit.
- **Locales.** UI text lives in `apps/web/src/locales/vi.json` and `en.json`, and both files must have identical key sets (the `locales` test checks this). Vietnamese must read naturally.
- **Language.** Code, comments and docs are in English.
- **Icons.** Use Lucide icons with `strokeWidth={1.75}` and `aria-hidden="true"`.
- **Buttons.** Every button has an accessible name that contains its visible text (WCAG 2.5.3). A button that can hold focus while busy or unavailable uses `aria-disabled` plus a click guard, never `disabled` (see `ServerStatus.tsx`).
- **Focus.** Focus is never lost. When a panel or dialog closes, focus returns to what opened it, or to the person's card (WCAG 2.4.3). A focused card is never left off screen (WCAG 2.4.11).
- **Unsent edits.** They are never lost silently: they are kept, the app asks before an action that would lose them, and it tells the user when they are lost anyway. Unsaved profile-form changes follow the same rule.
- **Edits are ops.** Every edit goes through `useTreeStore().apply(op)`, so it is optimistic, queued, rebased and undoable. One user action is one op (a `batch` when needed), and so one undo step.
- **Parsed values.** Profile ops are built from the Zod-parsed form values (trimmed strings, parsed dates), never from raw input.
- **Dates.** A date is a plain `{ day, month, year }`, never a JS `Date`. The lunar library is `@ancestors-tree/shared/lunar` (`lunarCalendar`, `canChiYear`, `anniversaryFor`), and years run from 1000 to 3000.
- **Tests.**
  - Write the test first, see it fail, then write the code.
  - A test must be able to fail.
  - Prefer queries by role or label, in Vietnamese, the app's default language in tests.
  - The e2e tests use no fixed sleeps.
  - No credential-shaped fixtures.
- **Commits.** Commit with a message file and `git commit -F`. Every commit ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use `rtk` before git commands and plain `pnpm` for scripts. Never read `apps/api/.env`.

## File map

| File | Responsibility | Task |
|---|---|---|
| `packages/shared/src/tree/date-info.ts` (new) | `completeDateInfo`, `hasWrongDerivedSide`, `derivedLunar`, `derivedSolar` | 1 |
| `packages/shared/src/tree/schemas.ts` | `DateInfoSchema` checks the derived side; `CLEARABLE_PERSON_FIELDS` is derived from the schema | 1 |
| `apps/web/src/features/tree/format.ts` | "~1920", spoken years, anniversary and birthday of a person, in-law subtitle, card label | 2 |
| `apps/web/src/features/tree/PersonCard.tsx` | Date marks, the in-law tooltip, and (Task 4) the open button | 2, 4, 8 |
| `apps/web/src/shared/ui/dates/dateDraft.ts` (new) | `DateDraft` ⇄ `DateInfo`, field errors, conversion preview | 3 |
| `apps/web/src/shared/ui/dates/DualDateInput.tsx` (new) | The Lunar / Solar / Year only input | 3 |
| `apps/web/src/features/tree/profileParams.ts` (new) | `useOpenPerson()`: the `?person=` search parameter | 4 |
| `apps/web/src/features/tree/usePersonActions.ts` (new) | Which actions a person has, for the panel and the menu | 4, 7 |
| `apps/web/src/features/tree/ProfilePanel.tsx` (new) | The side panel / bottom sheet: read mode and actions | 4, 6 |
| `apps/web/src/features/tree/ProfileDetails.tsx` (new) | The read-mode list of facts | 4 |
| `apps/web/src/features/tree/CardMenu.tsx` (new) | The right-click menu on a card | 5 |
| `apps/web/src/features/tree/profileForm.ts` (new) | Form schema, form values ⇄ person, `personChanges` | 6 |
| `apps/web/src/features/tree/ProfileForm.tsx` (new) | Edit mode | 6 |
| `apps/web/src/features/tree/profileDraft.ts` (new) | Unsaved-form flag read by the guard | 6 |
| `apps/web/src/features/tree/UnsentChangesGuard.tsx` | Also asks before an unsaved profile form is lost | 6 |
| `apps/web/src/features/tree/ops.ts` | `addParentOp`, `parentSlot` | 7 |
| `apps/web/src/features/tree/relativeNav.ts` (new) | Which card an arrow key moves to | 8 |
| `e2e/profile.spec.ts` (new), `e2e/support.ts` | End-to-end flows | 9 |
| docs (ADR 0009, roadmap, spec EN/VI) | Records the decisions | 10 |

`PersonActionsDialog.tsx` and `treeActions.ts` are deleted in Task 4.

---

### Task 1: Dates that agree, and clearable fields from the schema

Spec §5. A `DateInfo` stores what the user entered and the other calendar converted from it. Today the schema accepts any other side. From now on it must equal the conversion. `CLEARABLE_PERSON_FIELDS` is also derived from `PersonChangesSchema`, so it cannot drift from the schema (P5 ledger T1).

**Files:**
- Create: `packages/shared/src/tree/date-info.ts`
- Modify: `packages/shared/src/tree/schemas.ts` (`DateInfoSchema`, `CLEARABLE_PERSON_FIELDS`)
- Modify: `packages/shared/src/tree/index.ts` (exports)
- Test: `packages/shared/src/tree/date-info.test.ts` (new), `packages/shared/src/tree/schemas.test.ts`

**Interfaces:**
- Consumes: `lunarCalendar` (`../lunar/ho-ngoc-duc.ts`), `LunarDate`, `SolarDate` (`../lunar/dates.ts`).
- Produces (`@ancestors-tree/shared/tree`):
  - `interface DateSides { source: 'solar' | 'lunar' | 'approx'; solar?: SolarDate; lunar?: LunarDate; approxYear?: number }`;
  - `derivedLunar(solar: SolarDate): LunarDate | undefined`;
  - `derivedSolar(lunar: LunarDate): SolarDate | undefined`;
  - `completeDateInfo<T extends DateSides>(date: T): T`, which returns the entered side plus the derived side, and nothing else;
  - `hasWrongDerivedSide(date: DateSides): boolean`;
  - `type ClearablePersonField`, with `CLEARABLE_PERSON_FIELDS: readonly ClearablePersonField[]`.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/tree/date-info.test.ts`:

```ts
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
    expect(
      completeDateInfo({ source: 'approx', approxYear: 1920, solar: TET_2026 }),
    ).toEqual({ source: 'approx', approxYear: 1920 });
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
    expect(
      hasWrongDerivedSide({ source: 'solar', solar: TET_2026, lunar: TET_2026_LUNAR }),
    ).toBe(false);
  });

  it('rejects another side that is not the conversion', () => {
    const wrong = { ...TET_2026_LUNAR, day: 2 };
    expect(hasWrongDerivedSide({ source: 'solar', solar: TET_2026, lunar: wrong })).toBe(true);
    expect(
      hasWrongDerivedSide({ source: 'lunar', lunar: TET_2026_LUNAR, solar: { ...TET_2026, day: 18 } }),
    ).toBe(true);
    expect(hasWrongDerivedSide({ source: 'approx', approxYear: 1920, solar: TET_2026 })).toBe(true);
    expect(hasWrongDerivedSide({ source: 'solar', solar: TET_2026, approxYear: 2026 })).toBe(true);
  });

  it('is enforced by DateInfoSchema, so the server refuses it too', () => {
    const wrong = { source: 'solar', solar: TET_2026, lunar: { ...TET_2026_LUNAR, day: 2 } };
    expect(DateInfoSchema.safeParse(wrong).success).toBe(false);
    expect(
      DateInfoSchema.safeParse({ source: 'solar', solar: TET_2026, lunar: TET_2026_LUNAR })
        .success,
    ).toBe(true);
  });
});
```

Append to `packages/shared/src/tree/schemas.test.ts`. Add the imports `CLEARABLE_PERSON_FIELDS` and `PersonChangesSchema` from `./schemas.ts` if they are not already imported.

```ts
describe('CLEARABLE_PERSON_FIELDS', () => {
  it('lists exactly the fields updatePerson may clear with null', () => {
    expect([...CLEARABLE_PERSON_FIELDS].sort()).toEqual(
      ['bio', 'birth', 'birthFamily', 'branch', 'burialPlace', 'siblingOrder'].sort(),
    );
    for (const field of CLEARABLE_PERSON_FIELDS) {
      expect(PersonChangesSchema.safeParse({ [field]: null }).success).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm vitest run packages/shared/src/tree/date-info.test.ts packages/shared/src/tree/schemas.test.ts`
Expected: FAIL. `./date-info.ts` does not exist. The `CLEARABLE_PERSON_FIELDS` test passes already: it pins today's list before the refactor, which is intended.

- [ ] **Step 3: Write `date-info.ts`**

Create `packages/shared/src/tree/date-info.ts`:

```ts
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
    return (date.approxYear === undefined
      ? { source: 'approx' }
      : { source: 'approx', approxYear: date.approxYear }) as T;
  }
  if (date.source === 'solar') {
    if (date.solar === undefined) return { source: 'solar' } as T;
    const lunar = derivedLunar(date.solar);
    return (lunar === undefined
      ? { source: 'solar', solar: date.solar }
      : { source: 'solar', solar: date.solar, lunar }) as T;
  }
  if (date.lunar === undefined) return { source: 'lunar' } as T;
  const solar = derivedSolar(date.lunar);
  return (solar === undefined
    ? { source: 'lunar', lunar: date.lunar }
    : { source: 'lunar', lunar: date.lunar, solar }) as T;
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
```

- [ ] **Step 4: Use it in the schema, and derive the clearable fields**

In `packages/shared/src/tree/schemas.ts`, add `import { hasWrongDerivedSide } from './date-info.ts';` and append a second refine to `DateInfoSchema`, after the existing one:

```ts
  )
  .refine((date) => !hasWrongDerivedSide(date), {
    message: 'The other calendar must be the conversion of the date entered',
    path: ['source'],
  });
```

Replace the `CLEARABLE_PERSON_FIELDS` constant (keep it after `PersonChangesSchema`; move it below if needed) with:

```ts
/** Person fields that `updatePerson` may clear: the ones PersonChangesSchema accepts as null. */
export type ClearablePersonField = {
  [Key in keyof PersonChanges]-?: null extends PersonChanges[Key] ? Key : never;
}[keyof PersonChanges];

export const CLEARABLE_PERSON_FIELDS = (
  Object.keys(PersonChangesSchema.shape) as (keyof PersonChanges)[]
).filter((field) =>
  PersonChangesSchema.shape[field].safeParse(null).success,
) as readonly ClearablePersonField[];
```

`PersonChanges` is declared near the end of the file. A type is hoisted, but `PersonChangesSchema` is not, so the constant must come after `PersonChangesSchema`.

In `packages/shared/src/tree/index.ts`, add `type ClearablePersonField` to the `./schemas.ts` export list, and add:

```ts
export {
  completeDateInfo,
  derivedLunar,
  derivedSolar,
  hasWrongDerivedSide,
  type DateSides,
} from './date-info.ts';
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm vitest run packages/shared/src/tree apps/api/src/tree`
Expected: PASS. `apps/api/src/tree/dto.ts` loops over `CLEARABLE_PERSON_FIELDS`. With the new element type it still typechecks, because every listed field is optional on `Person`.

- [ ] **Step 6: Mutation check**

Comment out the new refine in `DateInfoSchema`, and see the "is enforced by DateInfoSchema" test fail. Then restore the refine.

- [ ] **Step 7: Run the whole check, then commit**

Run: `pnpm check` (allow 10 minutes). Expected: exit 0.

Commit message:

```
feat(shared): dates whose other calendar matches, clearable fields from the schema

- completeDateInfo adds the converted side to what the user entered;
  DateInfoSchema refuses another side that is not that conversion
- CLEARABLE_PERSON_FIELDS is derived from PersonChangesSchema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 2: Date marks on the cards, "~1920", and the in-law hint

Spec §13.3 and §8.
- The line under the name shows "Giỗ 15/10 ÂL" for a deceased person whose lunar death date is known, either entered or derived from a full solar date.
- Otherwise the line shows the life years, with "~1920" for an approximate year. Screen readers hear "khoảng năm 1920".
- A living person whose solar day and month of birth are known gets the birthday sticker.
- An in-law card adds the birth-family subtitle to its accessible name and shows it as a tooltip on hover or focus.

**Files:**
- Modify: `apps/web/src/features/tree/format.ts`
- Modify: `apps/web/src/features/tree/PersonCard.tsx`, `apps/web/src/features/tree/PersonNode.tsx`
- Modify: `apps/web/src/features/tree/UnlinkedTray.tsx` (spoken years in its label)
- Modify: `apps/web/src/locales/vi.json`, `apps/web/src/locales/en.json`
- Test: `apps/web/src/features/tree/format.test.ts`, `apps/web/src/features/tree/TreeBoard.test.tsx`

**Interfaces:**
- Consumes: `completeDateInfo` (Task 1).
- Produces (`features/tree/format.ts`):
  - `yearOf(date?: DateInfo): string | undefined`. It now returns "~1931" for an approximate year.
  - `lifeYears(person: Person): string | undefined`, the visible text, which uses `yearOf`.
  - `lifeYearsSpoken(t: TFunction, person: Person): string | undefined`, the same text with "khoảng năm 1931".
  - `deathAnniversaryOf(person: Person): { day: number; month: number } | undefined`.
  - `birthdayOf(person: Person): { day: number; month: number } | undefined`.
  - `dayMonth(date: { day: number; month: number }): string`, which gives "15/10".
  - `birthFamilySubtitle(t: TFunction, person: Person): string | undefined`.
  - `cardLabel(t: TFunction, person: Person, generation: number, inLaw?: boolean): string`. **The signature changes.** Update its callers.

- [ ] **Step 1: Add the locale keys**

`vi.json`. Merge these keys into the existing `tree.card` object and add a new `tree.inLaw` object:

```json
"card": {
  "approxYear": "khoảng năm {{year}}",
  "inLawLabel": "{{label}}, {{family}}"
},
"inLaw": {
  "sonOfFather": "Con trai ông {{name}}",
  "daughterOfFather": "Con gái ông {{name}}",
  "sonOfMother": "Con trai bà {{name}}",
  "daughterOfMother": "Con gái bà {{name}}",
  "surname": "Họ {{surname}}",
  "separator": " · "
}
```

`en.json`, at the same places:

```json
"card": {
  "approxYear": "around {{year}}",
  "inLawLabel": "{{label}}, {{family}}"
},
"inLaw": {
  "sonOfFather": "Son of Mr. {{name}}",
  "daughterOfFather": "Daughter of Mr. {{name}}",
  "sonOfMother": "Son of Mrs. {{name}}",
  "daughterOfMother": "Daughter of Mrs. {{name}}",
  "surname": "{{surname}} family",
  "separator": " · "
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/web/src/features/tree/format.test.ts`:
- update the import to `import { birthdayOf, birthFamilySubtitle, cardLabel, dayMonth, deathAnniversaryOf, lifeYears, lifeYearsSpoken, rejectionMessage, yearOf } from './format';`;
- change the `yearOf` expectation for an approximate year to `'~1900'`;
- change the `lifeYears` expectations to `'~1931'`, `'~1931–~2004'`, `'~1931–?'` and `'?–~2004'`;
- then append:

```ts
describe('date marks', () => {
  const lunarDeath = { source: 'lunar', lunar: { day: 15, month: 10, year: 1990, isLeap: false } } as const;
  const solarDeath = { source: 'solar', solar: { day: 17, month: 2, year: 2026 } } as const;

  it('gives the lunar death day for the anniversary, entered or derived', () => {
    expect(
      deathAnniversaryOf(fixturePerson(ID, 'A', { death: { isDeceased: true, date: lunarDeath } })),
    ).toEqual({ day: 15, month: 10 });
    // 17 February 2026 is Tết: lunar 1/1.
    expect(
      deathAnniversaryOf(fixturePerson(ID, 'A', { death: { isDeceased: true, date: solarDeath } })),
    ).toEqual({ day: 1, month: 1 });
    expect(
      deathAnniversaryOf(
        fixturePerson(ID, 'A', { death: { isDeceased: true, date: { source: 'approx', approxYear: 1990 } } }),
      ),
    ).toBeUndefined();
    expect(deathAnniversaryOf(fixturePerson(ID, 'A'))).toBeUndefined();
  });

  it('gives a birthday only to the living with a known solar day', () => {
    const born = { source: 'lunar', lunar: { day: 1, month: 1, year: 2026, isLeap: false } } as const;
    expect(birthdayOf(fixturePerson(ID, 'A', { birth: born }))).toEqual({ day: 17, month: 2 });
    expect(
      birthdayOf(fixturePerson(ID, 'A', { birth: born, death: { isDeceased: true } })),
    ).toBeUndefined();
    expect(
      birthdayOf(fixturePerson(ID, 'A', { birth: { source: 'approx', approxYear: 1990 } })),
    ).toBeUndefined();
    expect(dayMonth({ day: 5, month: 9 })).toBe('5/9');
  });

  it('reads an approximate year as words', () => {
    const born = { source: 'approx', approxYear: 1931 } as const;
    expect(lifeYearsSpoken(i18n.t, fixturePerson(ID, 'A', { birth: born }))).toBe(
      'khoảng năm 1931',
    );
    expect(
      lifeYearsSpoken(
        i18n.t,
        fixturePerson(ID, 'A', {
          birth: { source: 'solar', solar: { day: 1, month: 2, year: 1931 } },
          death: { isDeceased: true },
        }),
      ),
    ).toBe('1931–?');
  });
});

describe('in-law subtitle and card label', () => {
  it('names the father first, then the mother, then the surname, with the hometown', () => {
    const wife = fixturePerson(ID, 'Lê Thị Hoa', {
      gender: 'female',
      birthFamily: { fatherName: 'Lê Văn Ba', hometown: 'Hà Nam' },
    });
    expect(birthFamilySubtitle(i18n.t, wife)).toBe('Con gái ông Lê Văn Ba · Hà Nam');
    expect(
      birthFamilySubtitle(i18n.t, fixturePerson(ID, 'A', { birthFamily: { motherName: 'Đỗ Thị Tư' } })),
    ).toBe('Con trai bà Đỗ Thị Tư');
    expect(
      birthFamilySubtitle(i18n.t, fixturePerson(ID, 'A', { birthFamily: { surname: 'Trần' } })),
    ).toBe('Họ Trần');
    expect(birthFamilySubtitle(i18n.t, fixturePerson(ID, 'A'))).toBeUndefined();
  });

  it('adds the subtitle to an in-law card only', () => {
    const wife = fixturePerson(ID, 'Lê Thị Hoa', {
      gender: 'female',
      birthFamily: { fatherName: 'Lê Văn Ba' },
    });
    expect(cardLabel(i18n.t, wife, 2, true)).toBe(
      'Lê Thị Hoa, đời thứ 2, Con gái ông Lê Văn Ba',
    );
    expect(cardLabel(i18n.t, wife, 2, false)).toBe('Lê Thị Hoa, đời thứ 2');
  });
});
```

In `apps/web/src/features/tree/TreeBoard.test.tsx`, add a test that renders the board with a deceased person who has a lunar death date and a living person with a solar birth date. Use the file's existing render helper and fixtures style:

```ts
it('shows the anniversary line and the birthday sticker', async () => {
  const tree = {
    ...FAMILY,
    persons: FAMILY.persons.map((person) =>
      person.id === GRANDPA
        ? {
            ...person,
            death: {
              isDeceased: true,
              date: { source: 'lunar', lunar: { day: 15, month: 10, year: 2004, isLeap: false } },
            },
          }
        : person.id === SON
          ? { ...person, birth: { source: 'solar', solar: { day: 21, month: 11, year: 1990 } } }
          : person,
    ),
  } satisfies TreeResponse;
  // Render the board with `tree`, as the other tests in this file do.
  expect(await screen.findByText('Ngày giỗ 15/10 âm lịch')).toBeInTheDocument();
  expect(screen.getByText('Sinh nhật 21/11')).toBeInTheDocument();
});
```

Find the file's own helper for rendering a given tree (it seeds the store or mocks `GET /tree` with `treeRoutes(tree)`), and use it in place of the comment. Import `GRANDPA`, `SON`, `FAMILY` from `./fixtures` and `type TreeResponse` from `@ancestors-tree/shared` if they are missing.

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm vitest run apps/web/src/features/tree/format.test.ts apps/web/src/features/tree/TreeBoard.test.tsx`
Expected: FAIL, because the new functions do not exist, approximate years show without "~", and the board shows no date marks.

- [ ] **Step 4: Implement `format.ts`**

In `apps/web/src/features/tree/format.ts`, add `completeDateInfo` to the `@ancestors-tree/shared/tree` import, and replace `yearOf`, `lifeYears` and `cardLabel` with:

```ts
interface YearPart {
  year: number;
  approx: boolean;
}

function yearPart(date: DateInfo | undefined): YearPart | undefined {
  if (!date) return undefined;
  if (date.source === 'approx') {
    return date.approxYear === undefined ? undefined : { year: date.approxYear, approx: true };
  }
  const year = date.source === 'solar' ? date.solar?.year : date.lunar?.year;
  return year === undefined ? undefined : { year, approx: false };
}

/** The year on the side the user entered; "~1920" when only an approximate year is known. */
export function yearOf(date: DateInfo | undefined): string | undefined {
  const part = yearPart(date);
  if (part === undefined) return undefined;
  return part.approx ? `~${part.year}` : String(part.year);
}

function joinYears(
  person: Person,
  show: (part: YearPart) => string,
): string | undefined {
  const bornPart = yearPart(person.birth);
  const diedPart = person.death.isDeceased ? yearPart(person.death.date) : undefined;
  const born = bornPart === undefined ? undefined : show(bornPart);
  const died = diedPart === undefined ? undefined : show(diedPart);
  if (born !== undefined && died !== undefined) return `${born}–${died}`;
  if (born !== undefined) return person.death.isDeceased ? `${born}–?` : born;
  if (died !== undefined) return `?–${died}`;
  return undefined;
}

/** "1931–2004", "~1931–2004", "1962" for the living, "1931–?" or "?–2004" when one is unknown. */
export function lifeYears(person: Person): string | undefined {
  return joinYears(person, (part) => (part.approx ? `~${part.year}` : String(part.year)));
}

/** The life years for screen readers: "~1931" is read as "khoảng năm 1931". */
export function lifeYearsSpoken(t: TFunction, person: Person): string | undefined {
  return joinYears(person, (part) =>
    part.approx ? t('tree.card.approxYear', { year: part.year }) : String(part.year),
  );
}

export function dayMonth(date: { day: number; month: number }): string {
  return `${date.day}/${date.month}`;
}

/** The lunar day and month of death, entered or derived from a full solar date (spec §13.3). */
export function deathAnniversaryOf(person: Person): { day: number; month: number } | undefined {
  const date = person.death.isDeceased ? person.death.date : undefined;
  if (!date || date.source === 'approx') return undefined;
  const lunar = completeDateInfo(date).lunar;
  return lunar === undefined ? undefined : { day: lunar.day, month: lunar.month };
}

/** The solar day and month of birth of a living person, entered or derived (spec §13.3). */
export function birthdayOf(person: Person): { day: number; month: number } | undefined {
  if (person.death.isDeceased || !person.birth || person.birth.source === 'approx') return undefined;
  const solar = completeDateInfo(person.birth).solar;
  return solar === undefined ? undefined : { day: solar.day, month: solar.month };
}

/** "Con gái ông Trần Văn X · Hà Nam" from the birth family (spec §8); undefined when empty. */
export function birthFamilySubtitle(t: TFunction, person: Person): string | undefined {
  const family = person.birthFamily;
  if (!family) return undefined;
  const female = person.gender === 'female';
  const parent = family.fatherName
    ? t(female ? 'tree.inLaw.daughterOfFather' : 'tree.inLaw.sonOfFather', {
        name: family.fatherName,
      })
    : family.motherName
      ? t(female ? 'tree.inLaw.daughterOfMother' : 'tree.inLaw.sonOfMother', {
          name: family.motherName,
        })
      : family.surname
        ? t('tree.inLaw.surname', { surname: family.surname })
        : undefined;
  const parts = [parent, family.hometown].filter((part): part is string => Boolean(part));
  return parts.length === 0 ? undefined : parts.join(t('tree.inLaw.separator'));
}

/** The card's accessible name: name, life years and generation (spec §7.8), plus an in-law's family. */
export function cardLabel(
  t: TFunction,
  person: Person,
  generation: number,
  inLaw = false,
): string {
  const years = lifeYearsSpoken(t, person);
  const name = person.fullName;
  const label =
    years === undefined
      ? t('tree.card.labelNoYears', { name, generation })
      : t('tree.card.label', { name, years, generation });
  const family = inLaw ? birthFamilySubtitle(t, person) : undefined;
  return family === undefined ? label : t('tree.card.inLawLabel', { label, family });
}
```

`i18next` escapes interpolated values for HTML by default. If the project's i18n setup does not already set `interpolation.escapeValue: false` (check `apps/web/src/shared/i18n`), names with "&" will show escaped. Keep whatever the project already does; React escapes text itself.

- [ ] **Step 5: Show the marks and the tooltip on the card**

`apps/web/src/features/tree/PersonNode.tsx`: pass `inLaw={data.tape === 'in-law'}` to `PersonCard`.

`apps/web/src/features/tree/PersonCard.tsx`:
- add `inLaw: boolean` to `PersonCardProps`;
- import `DateMark` from `../../shared/ui`, `useId` from `react`, and `birthdayOf`, `birthFamilySubtitle`, `cardLabel`, `dayMonth`, `deathAnniversaryOf` and `lifeYears` from `./format`;
- then render:

```tsx
export function PersonCard({ person, tape, generation, inLaw }: PersonCardProps) {
  const { t } = useTranslation();
  const openActions = useContext(TreeActionsContext);
  const tooltipId = useId();
  const anniversary = deathAnniversaryOf(person);
  const birthday = birthdayOf(person);
  const family = inLaw ? birthFamilySubtitle(t, person) : undefined;
  return (
    <div className="group relative" style={POINTER_EVENTS}>
      <Polaroid
        name={person.fullName}
        label={cardLabel(t, person, generation, inLaw)}
        lifeYears={lifeYears(person)}
        tape={tape}
        tilt={tiltFor(person.id)}
        dateLine={
          anniversary ? (
            <DateMark
              kind="death-anniversary"
              label={t('scrapbook.deathAnniversaryLabel', { date: dayMonth(anniversary) })}
            >
              {t('scrapbook.deathAnniversary', { date: dayMonth(anniversary) })}
            </DateMark>
          ) : undefined
        }
        marks={
          birthday ? (
            <DateMark kind="birthday" label={t('scrapbook.birthday', { date: dayMonth(birthday) })}>
              {dayMonth(birthday)}
            </DateMark>
          ) : undefined
        }
      />
      {family !== undefined ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute top-full left-1/2 z-10 mt-1 hidden -translate-x-1/2 rounded-control bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper group-focus-within:block group-hover:block"
        >
          {family}
        </span>
      ) : null}
      {/* The actions button stays as it is in this task; Task 4 replaces it. */}
    </div>
  );
}
```

Keep the existing actions button JSX where the comment is. Do not copy the comment. Also add `aria-describedby={family !== undefined ? tooltipId : undefined}` to that button, so focusing it reads the tooltip.

`apps/web/src/features/tree/UnlinkedTray.tsx`: build the label with `lifeYearsSpoken(t, person)` in place of `years` inside `t('scrapbook.personLabel', …)`, and keep `lifeYears={years}` for the visible text.

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm vitest run apps/web/src/features/tree apps/web/src/locales`
Expected: PASS. Tests elsewhere that spelled out the fixture's labels with plain approximate years now need the new label. For example, "Nguyễn Văn Tư, 1931–2004, đời thứ 1" becomes "Nguyễn Văn Tư, khoảng năm 1931–khoảng năm 2004, đời thứ 1". Update those expectations, because the new label is the spec's behaviour. Find them with `rtk grep "1931–2004" apps/web/src`.

- [ ] **Step 7: Mutation check**

In `deathAnniversaryOf`, return `undefined` for a `solar` source, and see the derived-anniversary test fail. Then restore the code.

- [ ] **Step 8: Run the whole check, then commit**

Run: `pnpm check` (allow 10 minutes). Expected: exit 0.

```
feat(web): anniversary and birthday marks, "~1920", and the in-law hint on cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 3: `DualDateInput`

Spec §7.6. The input has three modes: Lunar, Solar and Year only. Each mode has day, month and year fields. The input shows the converted date in the other calendar and the Can Chi year. In Lunar mode, "Tháng nhuận" (leap month) can be ticked only when that year's leap month is the chosen month. Errors show at the field.

The value the input holds is a `DateDraft` of strings, so half-typed input survives re-renders. Pure functions turn a draft into a `DateInfo` or a field error, and the profile form (Task 6) validates with them.

**Files:**
- Create: `apps/web/src/shared/ui/dates/dateDraft.ts`
- Create: `apps/web/src/shared/ui/dates/DualDateInput.tsx`
- Modify: `apps/web/src/shared/ui/index.ts` (exports)
- Modify: `apps/web/src/locales/vi.json`, `apps/web/src/locales/en.json` (`dates.*`)
- Test: `apps/web/src/shared/ui/dates/dateDraft.test.ts` (new), `apps/web/src/shared/ui/dates/DualDateInput.test.tsx` (new)

**Interfaces:**
- Consumes: `completeDateInfo` and `type DateInfo` (`@ancestors-tree/shared/tree`, Task 1); `lunarCalendar`, `canChiYear`, `MIN_YEAR`, `MAX_YEAR` and `isValidSolarDate` (`@ancestors-tree/shared/lunar`).
- Produces (`apps/web/src/shared/ui/dates/dateDraft.ts`, re-exported from `shared/ui`):
  - `type DateMode = 'solar' | 'lunar' | 'approx'`;
  - `interface DateDraft { mode: DateMode; day: string; month: string; year: string; isLeap: boolean }`;
  - `EMPTY_DATE_DRAFT: DateDraft` (`mode: 'lunar'`, all fields empty, `isLeap: false`);
  - `type DateDraftError = 'incomplete' | 'yearOnly' | 'notANumber' | 'yearRange' | 'notADate' | 'leapMonthAbsent'`;
  - `type DraftResult = { ok: true; value: DateInfo | null } | { ok: false; error: DateDraftError }`;
  - `draftToDateInfo(draft: DateDraft): DraftResult` (an empty draft gives `{ ok: true, value: null }`);
  - `draftFromDateInfo(date: DateInfo | undefined): DateDraft`;
  - `leapMonthOf(draft: DateDraft): number | null` (the leap month of the draft's lunar year, or `null`).
- Produces (`DualDateInput.tsx`): `DualDateInput({ legend, value, onChange, error, onBlur }: { legend: string; value: DateDraft; onChange: (next: DateDraft) => void; error?: string; onBlur?: () => void })`.
- Produces (locales): `dates.errors.<DateDraftError>`, used by Task 6 to show the error.

- [ ] **Step 1: Add the locale keys**

`vi.json`, as a new top-level `dates` object:

```json
"dates": {
  "lunar": "Âm lịch",
  "solar": "Dương lịch",
  "approx": "Chỉ biết năm",
  "mode": "Loại ngày",
  "day": "Ngày",
  "month": "Tháng",
  "year": "Năm",
  "leap": "Tháng nhuận",
  "leapHint": "Năm {{year}} nhuận tháng {{month}}.",
  "noLeapHint": "Năm {{year}} không có tháng nhuận.",
  "toSolar": "= {{date}} dương lịch",
  "toLunar": "= {{date}} âm lịch",
  "leapMonth": "{{day}}/{{month}} nhuận/{{year}}",
  "canChi": "năm {{name}}",
  "clear": "Xoá ngày",
  "errors": {
    "incomplete": "Nhập đủ ngày, tháng và năm.",
    "yearOnly": "Chỉ biết năm? Hãy chọn “Chỉ biết năm”.",
    "notANumber": "Chỉ nhập số.",
    "yearRange": "Năm phải từ 1000 đến 3000.",
    "notADate": "Ngày này không có trong lịch.",
    "leapMonthAbsent": "Năm này không có tháng nhuận đó."
  }
}
```

`en.json`:

```json
"dates": {
  "lunar": "Lunar",
  "solar": "Solar",
  "approx": "Year only",
  "mode": "Calendar",
  "day": "Day",
  "month": "Month",
  "year": "Year",
  "leap": "Leap month",
  "leapHint": "Year {{year}} has a leap month {{month}}.",
  "noLeapHint": "Year {{year}} has no leap month.",
  "toSolar": "= {{date}} solar",
  "toLunar": "= {{date}} lunar",
  "leapMonth": "{{day}}/leap {{month}}/{{year}}",
  "canChi": "year of {{name}}",
  "clear": "Clear the date",
  "errors": {
    "incomplete": "Enter the day, month and year.",
    "yearOnly": "Only the year? Choose “Year only”.",
    "notANumber": "Numbers only.",
    "yearRange": "The year must be between 1000 and 3000.",
    "notADate": "This day is not in the calendar.",
    "leapMonthAbsent": "That year has no such leap month."
  }
}
```

- [ ] **Step 2: Write the failing tests for the draft functions**

Create `apps/web/src/shared/ui/dates/dateDraft.test.ts`:

```ts
import { lunarCalendar } from '@ancestors-tree/shared/lunar';
import { describe, expect, it } from 'vitest';
import { draftFromDateInfo, draftToDateInfo, EMPTY_DATE_DRAFT, leapMonthOf, type DateDraft } from './dateDraft';

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
    expect(draftToDateInfo(draft({ mode: 'lunar', year: '1950' }))).toEqual({ ok: false, error: 'yearOnly' });
    expect(draftToDateInfo(draft({ mode: 'solar', day: '3', year: '1950' }))).toEqual({
      ok: false,
      error: 'incomplete',
    });
    expect(draftToDateInfo(draft({ mode: 'solar', day: 'a', month: '2', year: '1950' }))).toEqual({
      ok: false,
      error: 'notANumber',
    });
    expect(draftToDateInfo(draft({ mode: 'approx', year: '999' }))).toEqual({ ok: false, error: 'yearRange' });
    expect(draftToDateInfo(draft({ mode: 'solar', day: '30', month: '2', year: '2026' }))).toEqual({
      ok: false,
      error: 'notADate',
    });
    const { year, month } = leapYear();
    const otherMonth = month === 12 ? 1 : month + 1;
    expect(
      draftToDateInfo(draft({ mode: 'lunar', day: '1', month: String(otherMonth), year: String(year), isLeap: true })),
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
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm vitest run apps/web/src/shared/ui/dates/dateDraft.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 4: Write `dateDraft.ts`**

```ts
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
export const EMPTY_DATE_DRAFT: DateDraft = { mode: 'lunar', day: '', month: '', year: '', isLeap: false };

export type DateDraftError =
  | 'incomplete'
  | 'yearOnly'
  | 'notANumber'
  | 'yearRange'
  | 'notADate'
  | 'leapMonthAbsent';

export type DraftResult =
  | { ok: true; value: DateInfo | null }
  | { ok: false; error: DateDraftError };

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
    return { mode: 'solar', day: String(day), month: String(month), year: String(year), isLeap: false };
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
```

Make sure `@ancestors-tree/shared/lunar` exports `isValidSolarDate`, `lunarCalendar`, `MIN_YEAR` and `MAX_YEAR`; `packages/shared/src/lunar/index.ts` already does. Also check that the web app already imports from `@ancestors-tree/shared/lunar`. If not, add the path the same way `@ancestors-tree/shared/tree` is wired (Vite alias and tsconfig paths).

- [ ] **Step 5: Write the failing component test**

Create `apps/web/src/shared/ui/dates/DualDateInput.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { DualDateInput } from './DualDateInput';
import { EMPTY_DATE_DRAFT, type DateDraft } from './dateDraft';

function Harness({ initial = EMPTY_DATE_DRAFT }: { initial?: DateDraft }) {
  const [value, setValue] = useState(initial);
  return <DualDateInput legend="Ngày mất" value={value} onChange={setValue} />;
}

describe('DualDateInput', () => {
  it('shows the other calendar and the Can Chi year as the user types', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const group = screen.getByRole('group', { name: 'Ngày mất' });
    expect(screen.getByRole('radio', { name: 'Âm lịch' })).toBeChecked();
    await user.type(screen.getByLabelText('Ngày'), '1');
    await user.type(screen.getByLabelText('Tháng'), '1');
    await user.type(screen.getByLabelText('Năm'), '2026');
    expect(group).toHaveTextContent('= 17/2/2026 dương lịch');
    expect(group).toHaveTextContent('năm Bính Ngọ');
  });

  it('hides day and month for a year only', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('radio', { name: 'Chỉ biết năm' }));
    expect(screen.queryByLabelText('Ngày')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Năm')).toBeInTheDocument();
  });

  it('offers the leap month only when the year has that leap month', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const leap = screen.getByRole('checkbox', { name: 'Tháng nhuận' });
    expect(leap).toHaveAttribute('aria-disabled', 'true');
    await user.click(leap);
    expect(leap).not.toBeChecked();
  });

  it('clears the date', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness initial={{ mode: 'solar', day: '1', month: '2', year: '1990', isLeap: false }} />,
    );
    await user.click(screen.getByRole('button', { name: 'Xoá ngày' }));
    expect(screen.getByLabelText('Năm')).toHaveValue('');
  });

  it('shows the error it is given at the fields', () => {
    renderWithProviders(
      <DualDateInput legend="Ngày sinh" value={EMPTY_DATE_DRAFT} onChange={() => undefined} error="Chỉ nhập số." />,
    );
    expect(screen.getByLabelText('Ngày')).toHaveAccessibleDescription('Chỉ nhập số.');
  });
});
```

`17 February 2026` is lunar 1/1/2026, the year of Bính Ngọ (2026 → Bính Ngọ).

- [ ] **Step 6: Run the test to see it fail**

Run: `pnpm vitest run apps/web/src/shared/ui/dates/DualDateInput.test.tsx`
Expected: FAIL, because the component does not exist.

- [ ] **Step 7: Write `DualDateInput.tsx`**

```tsx
import { canChiYear } from '@ancestors-tree/shared/lunar';
import { X } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import { draftToDateInfo, EMPTY_DATE_DRAFT, leapMonthOf, type DateDraft, type DateMode } from './dateDraft';

interface DualDateInputProps {
  legend: string;
  value: DateDraft;
  onChange: (next: DateDraft) => void;
  /** Already translated; shown under the fields and linked to them. */
  error?: string;
  onBlur?: () => void;
}

const MODES: DateMode[] = ['lunar', 'solar', 'approx'];
const FIELD = 'h-10 w-full rounded-control border border-line-strong bg-surface px-2 text-base text-ink aria-invalid:border-stamp';

/** Lunar / Solar / Year only (spec §7.6): one side is typed, the other is shown converted. */
export function DualDateInput({ legend, value, onChange, error, onBlur }: DualDateInputProps) {
  const { t } = useTranslation();
  const id = useId();
  const errorId = `${id}-error`;
  const previewId = `${id}-preview`;
  const set = (patch: Partial<DateDraft>) => onChange({ ...value, ...patch });
  const result = draftToDateInfo(value);
  const date = result.ok ? result.value : null;
  const leapMonth = value.mode === 'lunar' ? leapMonthOf(value) : null;
  const month = Number(value.month.trim());
  const leapAllowed = leapMonth !== null && leapMonth === month;

  let preview: string | null = null;
  if (date?.source === 'lunar' && date.lunar) {
    const solar = date.solar;
    const parts = [
      solar ? t('dates.toSolar', { date: `${solar.day}/${solar.month}/${solar.year}` }) : null,
      t('dates.canChi', { name: canChiYear(date.lunar.year) }),
    ];
    preview = parts.filter(Boolean).join(' · ');
  } else if (date?.source === 'solar' && date.solar) {
    const lunar = date.lunar;
    const parts = [
      lunar
        ? t('dates.toLunar', {
            date: lunar.isLeap
              ? t('dates.leapMonth', { day: lunar.day, month: lunar.month, year: lunar.year })
              : `${lunar.day}/${lunar.month}/${lunar.year}`,
          })
        : null,
      lunar ? t('dates.canChi', { name: canChiYear(lunar.year) }) : null,
    ];
    preview = parts.filter(Boolean).join(' · ') || null;
  }

  const describedBy = [error ? errorId : null, preview ? previewId : null].filter(Boolean).join(' ') || undefined;
  const field = (name: 'day' | 'month' | 'year', label: string, width: string) => (
    <label className={`flex flex-col gap-1 text-sm font-medium text-ink ${width}`}>
      {label}
      <input
        inputMode="numeric"
        autoComplete="off"
        className={FIELD}
        value={value[name]}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => set({ [name]: event.target.value })}
        onBlur={onBlur}
      />
    </label>
  );

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-ink">{legend}</legend>
      <div role="radiogroup" aria-label={t('dates.mode')} className="flex flex-wrap gap-4">
        {MODES.map((mode) => (
          <label key={mode} className="flex items-center gap-2">
            <input
              type="radio"
              name={`${id}-mode`}
              className="size-4"
              checked={value.mode === mode}
              onChange={() => set({ mode, isLeap: mode === 'lunar' ? value.isLeap : false })}
            />
            {t(`dates.${mode}`)}
          </label>
        ))}
      </div>
      <div className="flex items-end gap-2">
        {value.mode === 'approx' ? null : field('day', t('dates.day'), 'w-16')}
        {value.mode === 'approx' ? null : field('month', t('dates.month'), 'w-16')}
        {field('year', t('dates.year'), 'w-24')}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('dates.clear')}
          title={t('dates.clear')}
          onClick={() => onChange({ ...EMPTY_DATE_DRAFT, mode: value.mode })}
        >
          <X aria-hidden="true" strokeWidth={1.75} className="size-4" />
        </Button>
      </div>
      {value.mode === 'lunar' ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 aria-disabled:opacity-50"
            checked={value.isLeap && leapAllowed}
            aria-disabled={leapAllowed ? undefined : true}
            onChange={() => {
              if (leapAllowed) set({ isLeap: !value.isLeap });
            }}
          />
          {t('dates.leap')}
          {leapMonth !== null ? (
            <span className="text-ink-muted">{t('dates.leapHint', { year: value.year.trim(), month: leapMonth })}</span>
          ) : null}
        </label>
      ) : null}
      {preview ? (
        <p id={previewId} className="text-sm text-ink-muted">
          {preview}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-stamp">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
```

A checkbox with `aria-disabled` stays focusable, and its click does nothing. When the month changes away from the leap month, `isLeap` stays true in the draft but shows unchecked. `draftToDateInfo` then reports `leapMonthAbsent`. Clear it instead: in `set`, when `patch.month` or `patch.year` changes the leap month so that it no longer matches, also set `isLeap: false`.

```ts
const set = (patch: Partial<DateDraft>) => {
  const next = { ...value, ...patch };
  if (next.isLeap && leapMonthOf(next) !== Number(next.month.trim())) next.isLeap = false;
  onChange(next);
};
```

Use this version of `set`.

Export `DualDateInput`, `draftToDateInfo`, `draftFromDateInfo`, `EMPTY_DATE_DRAFT`, `leapMonthOf` and the types `DateDraft`, `DateMode`, `DateDraftError` and `DraftResult` from `apps/web/src/shared/ui/index.ts`.

- [ ] **Step 8: Run the tests to see them pass**

Run: `pnpm vitest run apps/web/src/shared/ui/dates apps/web/src/locales`
Expected: PASS.

- [ ] **Step 9: Mutation check**

In `draftToDateInfo`, drop the `daysInLunarMonth` check, and see the "refuses a lunar day" test fail. Then restore the check.

- [ ] **Step 10: Run the whole check, then commit**

Run: `pnpm check` (allow 10 minutes). Expected: exit 0.

```
feat(web): DualDateInput for lunar, solar and year-only dates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 4: The profile panel, read mode and actions

Spec §7.6 and §7.8.
- **Opening.** Clicking a card, or pressing Enter on it, opens the profile panel. The card itself becomes the button, and its accessible name stays the card label.
- **The URL.** The open person is in the URL as `?person=<id>`.
  - Opening adds a history entry, so Back closes the panel. Switching to another person replaces that entry.
  - A reload keeps the panel open, and so does a shared link.
- **Closing.** Esc or the close button closes the panel and returns focus to the card.
- **Content.** Everyone sees the read-mode facts. Editors also see the actions, which replace P5's "Actions for X" dialog.
- **A person who disappears.** If the open person is deleted, or the link names nobody, the panel closes and a status line says so. When you delete the person yourself, it closes silently.

**Files:**
- Create: `apps/web/src/features/tree/profileParams.ts`
- Create: `apps/web/src/features/tree/usePersonActions.ts`
- Create: `apps/web/src/features/tree/ProfilePanel.tsx`
- Create: `apps/web/src/features/tree/ProfileDetails.tsx`
- Modify: `apps/web/src/features/tree/format.ts` (`dateText`, `thisYearsAnniversary`)
- Modify: `apps/web/src/features/tree/PersonCard.tsx`, `apps/web/src/features/tree/UnlinkedTray.tsx`, `apps/web/src/features/tree/TreePage.tsx`, `apps/web/src/features/tree/TreeDialogs.tsx`
- Delete: `apps/web/src/features/tree/PersonActionsDialog.tsx`, `apps/web/src/features/tree/treeActions.ts`
- Modify: `apps/web/src/locales/vi.json`, `apps/web/src/locales/en.json`
- Test: `apps/web/src/features/tree/ProfilePanel.test.tsx` (new), `apps/web/src/features/tree/format.test.ts`; update `TreeBoard.test.tsx` and `TreeEditing.test.tsx`

**Interfaces:**
- Consumes: `cardLabel`, `lifeYears`, `birthFamilySubtitle` (Task 2); `completeDateInfo`, `derivedLunar` (Task 1); `anniversaryFor`, `canChiYear` (`@ancestors-tree/shared/lunar`).
- Produces (`profileParams.ts`):
  - `PERSON_PARAM = 'person'`;
  - `personParam(search: string): string | null`;
  - `useProfileParam(): { personId: string | null; openPerson: (id: string) => void; closeProfile: () => void }`, where `openPerson` and `closeProfile` are stable;
  - `OpenPersonContext: Context<((id: string) => void) | null>`;
  - `personCardButton(id: string): HTMLElement | null`, which finds `[data-person-open="<id>"]`.
- Produces (`usePersonActions.ts`):
  - `type PersonActionId = 'addChild' | 'addSpouse' | 'addParent' | 'setProgenitor' | 'delete'`;
  - `availableActions(tree: TreeState, personId: string, isOwner: boolean): PersonActionId[]` (Task 7 adds `addParent`);
  - `ACTION_ICONS: Record<PersonActionId, LucideIcon>`;
  - `actionLabelKey(action: PersonActionId): string`;
  - `interface PersonActionsApi { actionsFor: (personId: string) => PersonActionId[]; run: (personId: string, action: PersonActionId) => void }`;
  - `PersonActionsContext: Context<PersonActionsApi | null>`, which is null for viewers.
- Produces (`format.ts`):
  - `dateText(t: TFunction, date: DateInfo): string`;
  - `thisYearsAnniversary(person: Person, today: SolarDate): Anniversary | null`.
- Produces (`TreeDialogs.tsx`): the `TreeDialog` kinds become `'first' | 'child' | 'spouse' | 'delete'` (Task 7 adds `'parent'`), and a new prop `onPersonDeleted: (personId: string) => void`.

- [ ] **Step 1: Add the locale keys**

`vi.json`, into `tree`:
- add `"addParent": "Thêm cha/mẹ"` to `tree.actions`;
- delete `tree.actions.description` and `tree.card.actions`;
- add these new objects:

```json
"profile": {
  "close": "Đóng hồ sơ",
  "edit": "Sửa",
  "actions": "Thao tác",
  "aliases": "Tên gọi khác",
  "gender": "Giới tính",
  "birth": "Ngày sinh",
  "death": "Ngày mất",
  "living": "Còn sống",
  "deceasedNoDate": "Đã mất, chưa rõ ngày",
  "anniversary": "Giỗ năm nay",
  "anniversaryValue": "{{lunar}} âm lịch, tức {{solar}} dương lịch",
  "anniversaryFirst": "giỗ đầu",
  "anniversarySecond": "giỗ hết",
  "burialPlace": "Nơi an táng",
  "siblingOrder": "Thứ tự trong anh chị em",
  "branch": "Chi, nhánh",
  "adopted": "Con nuôi",
  "yes": "Có",
  "bio": "Tiểu sử",
  "birthFamily": "Gia đình gốc",
  "surname": "Họ",
  "fatherName": "Tên cha",
  "motherName": "Tên mẹ",
  "hometown": "Quê quán",
  "note": "Ghi chú",
  "missing": "{{name}} không còn trong cây nên hồ sơ đã đóng.",
  "missingUnnamed": "Không tìm thấy người này trong cây nên hồ sơ đã đóng."
},
"date": {
  "solar": "{{date}} dương lịch",
  "lunar": "{{date}} âm lịch",
  "lunarLeap": "{{day}}/{{month}} nhuận/{{year}} âm lịch",
  "approx": "khoảng năm {{year}}",
  "withOther": "{{entered}} (= {{other}})",
  "canChi": "{{text}} · năm {{name}}"
}
```

`en.json`, at the same places:
- add `"addParent": "Add parent"`;
- delete the same two keys;
- add:

```json
"profile": {
  "close": "Close the profile",
  "edit": "Edit",
  "actions": "Actions",
  "aliases": "Other names",
  "gender": "Gender",
  "birth": "Born",
  "death": "Died",
  "living": "Living",
  "deceasedNoDate": "Deceased, date unknown",
  "anniversary": "This year's death anniversary",
  "anniversaryValue": "{{lunar}} lunar, that is {{solar}} solar",
  "anniversaryFirst": "first anniversary",
  "anniversarySecond": "second anniversary",
  "burialPlace": "Burial place",
  "siblingOrder": "Order among siblings",
  "branch": "Branch",
  "adopted": "Adopted",
  "yes": "Yes",
  "bio": "Biography",
  "birthFamily": "Birth family",
  "surname": "Surname",
  "fatherName": "Father's name",
  "motherName": "Mother's name",
  "hometown": "Hometown",
  "note": "Note",
  "missing": "{{name}} is no longer in the tree, so the profile closed.",
  "missingUnnamed": "This person is not in the tree, so the profile closed."
},
"date": {
  "solar": "{{date}} solar",
  "lunar": "{{date}} lunar",
  "lunarLeap": "{{day}}/leap {{month}}/{{year}} lunar",
  "approx": "around {{year}}",
  "withOther": "{{entered}} (= {{other}})",
  "canChi": "{{text}} · year of {{name}}"
}
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/web/src/features/tree/format.test.ts`. Import `dateText` and `thisYearsAnniversary`.

```ts
describe('dates in the profile', () => {
  it('shows the entered side first, the other side, and the Can Chi year', () => {
    expect(
      dateText(i18n.t, {
        source: 'lunar',
        lunar: { day: 1, month: 1, year: 2026, isLeap: false },
        solar: { day: 17, month: 2, year: 2026 },
      }),
    ).toBe('1/1/2026 âm lịch (= 17/2/2026 dương lịch) · năm Bính Ngọ');
    expect(dateText(i18n.t, { source: 'solar', solar: { day: 17, month: 2, year: 2026 } })).toBe(
      '17/2/2026 dương lịch (= 1/1/2026 âm lịch) · năm Bính Ngọ',
    );
    expect(dateText(i18n.t, { source: 'approx', approxYear: 1920 })).toBe('khoảng năm 1920');
  });

  it("gives this lunar year's anniversary of a death", () => {
    const person = fixturePerson(ID, 'A', {
      death: {
        isDeceased: true,
        date: { source: 'lunar', lunar: { day: 1, month: 1, year: 2020, isLeap: false } },
      },
    });
    // 1 March 2026 is in lunar year 2026, whose 1/1 is 17 February 2026.
    expect(thisYearsAnniversary(person, { day: 1, month: 3, year: 2026 })?.solarDate).toEqual({
      day: 17,
      month: 2,
      year: 2026,
    });
    expect(thisYearsAnniversary(fixturePerson(ID, 'B'), { day: 1, month: 3, year: 2026 })).toBeNull();
  });
});
```

Create `apps/web/src/features/tree/ProfilePanel.test.tsx`:

```tsx
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN, CLAN_ID, FAMILY, GRANDPA, ME, SON, treeRoutes } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

const cardOf = (name: string) => screen.findByRole('button', { name: new RegExp(`^${name},`) });

describe('the profile panel', () => {
  it('opens from a card, shows the facts, and closes back to the card', async () => {
    mockApi(treeRoutes(FAMILY, { ...CLAN, role: 'viewer' }));
    const user = userEvent.setup();
    renderRoute(`/clans/${CLAN_ID}/tree`);
    await user.click(await cardOf('Nguyễn Văn Nam'));
    const panel = screen.getByRole('complementary', { name: 'Nguyễn Văn Nam' });
    expect(within(panel).getByText('Giới tính')).toBeInTheDocument();
    // A viewer reads only.
    expect(within(panel).queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Thêm con' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Nguyễn Văn Nam' })).not.toBeInTheDocument();
    expect(await cardOf('Nguyễn Văn Nam')).toHaveFocus();
  });

  it('opens from the link, and gives editors the actions', async () => {
    mockApi(treeRoutes(FAMILY));
    renderRoute(`/clans/${CLAN_ID}/tree?person=${GRANDPA}`);
    const panel = await screen.findByRole('complementary', { name: 'Nguyễn Văn Tư' });
    expect(within(panel).getByRole('button', { name: 'Thêm con' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Thêm vợ/chồng' })).toBeInTheDocument();
    // "Make progenitor" is only for someone who is not the progenitor.
    expect(within(panel).queryByRole('button', { name: 'Chọn làm thuỷ tổ' })).not.toBeInTheDocument();
  });

  it('closes with a notice when the person is no longer in the tree', async () => {
    mockApi(treeRoutes(FAMILY));
    renderRoute(`/clans/${CLAN_ID}/tree?person=${SON}`);
    await screen.findByRole('complementary', { name: 'Nguyễn Văn Nam' });
    act(() => {
      useTreeStore.setState((state) => {
        const { [SON]: _gone, ...persons } = state.tree.persons;
        return { tree: { ...state.tree, persons } };
      });
    });
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Nguyễn Văn Nam' })).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText('Nguyễn Văn Nam không còn trong cây nên hồ sơ đã đóng.'),
    ).toBeInTheDocument();
  });

  it('says so when the link names nobody', async () => {
    mockApi(treeRoutes(FAMILY));
    renderRoute(`/clans/${CLAN_ID}/tree?person=64b7f0c2a1b2c3d4e5f6ffff`);
    expect(
      await screen.findByText('Không tìm thấy người này trong cây nên hồ sơ đã đóng.'),
    ).toBeInTheDocument();
  });
});
```

The test that removes SON edits the store directly. That is fine here, because only the panel's reaction is under test. If `useTreeStore.setState` with a partial `tree` breaks the store's derived fields, use the store's own remote-entry path instead, the way `undo` tests apply a `remoteEntry(seq, deletePersonOp(SON))`.

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm vitest run apps/web/src/features/tree/ProfilePanel.test.tsx apps/web/src/features/tree/format.test.ts`
Expected: FAIL. The functions and the panel do not exist, and the card is not yet a button.

- [ ] **Step 4: Write the `format.ts` additions**

Add to `apps/web/src/features/tree/format.ts`. Import `anniversaryFor`, `canChiYear`, `type Anniversary`, `type LunarDate` and `type SolarDate` from `@ancestors-tree/shared/lunar`, and `derivedLunar` from `@ancestors-tree/shared/tree`.

```ts
function dmy(date: { day: number; month: number; year: number }): string {
  return `${date.day}/${date.month}/${date.year}`;
}

function lunarText(t: TFunction, lunar: LunarDate): string {
  return lunar.isLeap
    ? t('tree.date.lunarLeap', { day: lunar.day, month: lunar.month, year: lunar.year })
    : t('tree.date.lunar', { date: dmy(lunar) });
}

/** "1/1/2026 âm lịch (= 17/2/2026 dương lịch) · năm Bính Ngọ": the entered side first (spec §7.6). */
export function dateText(t: TFunction, date: DateInfo): string {
  if (date.source === 'approx') return t('tree.date.approx', { year: date.approxYear });
  const full = completeDateInfo(date);
  const solar = full.solar ? t('tree.date.solar', { date: dmy(full.solar) }) : undefined;
  const lunar = full.lunar ? lunarText(t, full.lunar) : undefined;
  const [entered, other] = date.source === 'solar' ? [solar, lunar] : [lunar, solar];
  const text = other === undefined ? (entered ?? '') : t('tree.date.withOther', { entered, other });
  return full.lunar ? t('tree.date.canChi', { text, name: canChiYear(full.lunar.year) }) : text;
}

/** This lunar year's anniversary of the death (spec §9.2), or null when there is none yet. */
export function thisYearsAnniversary(person: Person, today: SolarDate): Anniversary | null {
  const date = person.death.isDeceased ? person.death.date : undefined;
  if (!date || date.source === 'approx') return null;
  const deathLunar = completeDateInfo(date).lunar;
  const lunarToday = derivedLunar(today);
  if (!deathLunar || !lunarToday) return null;
  try {
    return anniversaryFor(deathLunar, lunarToday.year);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
```

- [ ] **Step 5: Write `profileParams.ts`**

```ts
import { createContext, useCallback, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router';

/** The search parameter that holds the open profile (spec §7.6). */
export const PERSON_PARAM = 'person';

/** Opens a person's profile from a card; set by the tree page, so cards need no router hooks. */
export const OpenPersonContext = createContext<((id: string) => void) | null>(null);

/** A person's card button, on the board or in the tray: where focus returns. */
export function personCardButton(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-person-open="${id}"]`);
}

export function personParam(search: string): string | null {
  return new URLSearchParams(search).get(PERSON_PARAM);
}

function openedHere(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'profileOpenedHere' in state;
}

function withPerson(location: Location, id: string | null) {
  const params = new URLSearchParams(location.search);
  if (id === null) params.delete(PERSON_PARAM);
  else params.set(PERSON_PARAM, id);
  const query = params.toString();
  return { pathname: location.pathname, search: query === '' ? '' : `?${query}`, hash: location.hash };
}

/**
 * The open profile. Opening pushes a history entry (so Back closes the panel), switching person
 * replaces it, and closing goes back when this tab opened it, else drops the parameter.
 */
export function useProfileParam() {
  const location = useLocation();
  const navigate = useNavigate();
  // The latest location, so the callbacks stay stable for the cards that receive them.
  const latest = useRef(location);
  useLayoutEffect(() => {
    latest.current = location;
  }, [location]);

  const openPerson = useCallback(
    (id: string) => {
      const current = latest.current;
      const open = personParam(current.search);
      if (open === id) return;
      if (open === null) {
        void navigate(withPerson(current, id), { state: { profileOpenedHere: true } });
      } else {
        void navigate(withPerson(current, id), { replace: true, state: current.state });
      }
    },
    [navigate],
  );

  const closeProfile = useCallback(() => {
    const current = latest.current;
    if (personParam(current.search) === null) return;
    if (openedHere(current.state)) void navigate(-1);
    else void navigate(withPerson(current, null), { replace: true });
  }, [navigate]);

  return { personId: personParam(location.search), openPerson, closeProfile };
}
```

- [ ] **Step 6: Write `usePersonActions.ts`**

```ts
import type { TreeState } from '@ancestors-tree/shared/tree';
import { Baby, Crown, HeartPlus, Trash2, UserRoundPlus, type LucideIcon } from 'lucide-react';
import { createContext } from 'react';

export type PersonActionId = 'addChild' | 'addSpouse' | 'addParent' | 'setProgenitor' | 'delete';

/** What an editor can do to a person (spec §7.6), in the order the panel and the menu list them. */
export function availableActions(
  tree: TreeState,
  personId: string,
  isOwner: boolean,
): PersonActionId[] {
  if (!tree.persons[personId]) return [];
  const actions: PersonActionId[] = ['addChild', 'addSpouse'];
  if (isOwner && tree.progenitorId !== personId) actions.push('setProgenitor');
  actions.push('delete');
  return actions;
}

export const ACTION_ICONS: Record<PersonActionId, LucideIcon> = {
  addChild: Baby,
  addSpouse: HeartPlus,
  addParent: UserRoundPlus,
  setProgenitor: Crown,
  delete: Trash2,
};

export function actionLabelKey(action: PersonActionId): string {
  return `tree.actions.${action}`;
}

export interface PersonActionsApi {
  /** Read when a menu opens, from the latest tree. */
  actionsFor: (personId: string) => PersonActionId[];
  run: (personId: string, action: PersonActionId) => void;
}

/** Null for viewers: no menu, no actions. Stable, so cards do not re-render with the page. */
export const PersonActionsContext = createContext<PersonActionsApi | null>(null);
```

If the installed `lucide-react` has no `UserRoundPlus`, use `UserPlus`.

- [ ] **Step 7: Write `ProfileDetails.tsx`**

```tsx
import type { Person } from '@ancestors-tree/shared/tree';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { dateText, thisYearsAnniversary } from './format';

const FAMILY_FIELDS = ['surname', 'fatherName', 'motherName', 'hometown', 'note'] as const;

function todaySolar() {
  const now = new Date();
  return { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() };
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-ink-muted">{term}</dt>
      <dd className="text-base whitespace-pre-line text-ink">{children}</dd>
    </div>
  );
}

/** The read-mode facts (spec §7.6); an in-law's birth family comes first. */
export function ProfileDetails({ person, inLaw }: { person: Person; inLaw: boolean }) {
  const { t } = useTranslation();
  const family = person.birthFamily;
  const familyFields = inLaw && family ? FAMILY_FIELDS.filter((key) => family[key]) : [];
  const anniversary = thisYearsAnniversary(person, todaySolar());
  const anniversaryText = anniversary
    ? [
        t('tree.profile.anniversaryValue', {
          lunar: `${anniversary.lunarDate.day}/${anniversary.lunarDate.month}`,
          solar: `${anniversary.solarDate.day}/${anniversary.solarDate.month}/${anniversary.solarDate.year}`,
        }),
        anniversary.kind === 'first' ? t('tree.profile.anniversaryFirst') : null,
        anniversary.kind === 'second' ? t('tree.profile.anniversarySecond') : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <dl className="flex flex-col gap-3">
      {family && familyFields.length > 0 ? (
        <Fact term={t('tree.profile.birthFamily')}>
          <dl className="flex flex-col gap-1">
            {familyFields.map((key) => (
              <Fact key={key} term={t(`tree.profile.${key}`)}>
                {family[key]}
              </Fact>
            ))}
          </dl>
        </Fact>
      ) : null}
      {person.aliases.length > 0 ? (
        <Fact term={t('tree.profile.aliases')}>{person.aliases.join(', ')}</Fact>
      ) : null}
      <Fact term={t('tree.profile.gender')}>
        {t(person.gender === 'female' ? 'tree.form.female' : 'tree.form.male')}
      </Fact>
      {person.birth ? <Fact term={t('tree.profile.birth')}>{dateText(t, person.birth)}</Fact> : null}
      <Fact term={t('tree.profile.death')}>
        {!person.death.isDeceased
          ? t('tree.profile.living')
          : person.death.date
            ? dateText(t, person.death.date)
            : t('tree.profile.deceasedNoDate')}
      </Fact>
      {anniversaryText ? <Fact term={t('tree.profile.anniversary')}>{anniversaryText}</Fact> : null}
      {person.burialPlace ? (
        <Fact term={t('tree.profile.burialPlace')}>{person.burialPlace}</Fact>
      ) : null}
      {person.siblingOrder !== undefined ? (
        <Fact term={t('tree.profile.siblingOrder')}>{person.siblingOrder}</Fact>
      ) : null}
      {person.branch ? <Fact term={t('tree.profile.branch')}>{person.branch}</Fact> : null}
      {person.isAdopted ? <Fact term={t('tree.profile.adopted')}>{t('tree.profile.yes')}</Fact> : null}
      {person.bio ? <Fact term={t('tree.profile.bio')}>{person.bio}</Fact> : null}
    </dl>
  );
}
```

`Anniversary` has the fields `lunarDate`, `solarDate` and `kind` (`'first' | 'second' | 'regular'`). Check the names in `packages/shared/src/lunar/anniversary.ts`, and use them as they are named there.

- [ ] **Step 8: Write `ProfilePanel.tsx`**

```tsx
import { classifyLineage } from '@ancestors-tree/shared/tree';
import { X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui';
import { ProfileDetails } from './ProfileDetails';
import { useTreeStore } from './store';
import {
  ACTION_ICONS,
  actionLabelKey,
  availableActions,
  type PersonActionsApi,
} from './usePersonActions';

interface ProfilePanelProps {
  personId: string;
  isOwner: boolean;
  /** Null for viewers. */
  actions: PersonActionsApi | null;
  onClose: () => void;
  /** The person is not in the loaded tree: the page closes the panel and says so. */
  onMissing: (name: string | undefined) => void;
}

const ICON = { 'aria-hidden': true, className: 'size-4', strokeWidth: 1.75 } as const;

/** The profile (spec §7.6): a side panel on wide screens, a bottom sheet on small ones. */
export function ProfilePanel({ personId, isOwner, actions, onClose, onMissing }: ProfilePanelProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const tree = useTreeStore((state) => state.tree);
  const status = useTreeStore((state) => state.status);
  const person = tree.persons[personId];
  const lastName = useRef<string | undefined>(person?.fullName);
  const inLaw = useMemo(
    () => (person ? classifyLineage(tree).get(person.id) === 'in-law' : false),
    [person, tree],
  );

  useEffect(() => {
    if (person) lastName.current = person.fullName;
    else if (status === 'ready') onMissing(lastName.current);
  }, [onMissing, person, status]);

  // Focus moves into the panel when it opens, so a screen reader says whose profile it is.
  const shown = person !== undefined;
  useEffect(() => {
    if (shown) heading.current?.focus();
  }, [shown]);

  if (!person) return null;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onClose();
  };
  const actionIds = actions ? availableActions(tree, person.id, isOwner) : [];

  return (
    <aside
      aria-labelledby={headingId}
      onKeyDown={onKeyDown}
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[75vh] flex-col gap-4 overflow-y-auto rounded-t-control border-t border-line bg-paper p-4 shadow-lg md:inset-x-auto md:top-0 md:right-0 md:max-h-none md:w-[400px] md:rounded-none md:border-t-0 md:border-l"
    >
      <div className="flex items-start justify-between gap-2">
        <h2
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="text-xl font-bold text-ink focus:outline-none"
        >
          {person.fullName}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('tree.profile.close')}
          title={t('tree.profile.close')}
          onClick={onClose}
        >
          <X aria-hidden="true" strokeWidth={1.75} className="size-5" />
        </Button>
      </div>
      {actions && actionIds.length > 0 ? (
        <section aria-label={t('tree.profile.actions')} className="flex flex-wrap gap-2">
          {actionIds.map((action) => {
            const Icon = ACTION_ICONS[action];
            return (
              <Button
                key={action}
                variant={action === 'delete' ? 'danger' : 'secondary'}
                onClick={() => actions.run(person.id, action)}
              >
                <Icon {...ICON} />
                {t(actionLabelKey(action))}
              </Button>
            );
          })}
        </section>
      ) : null}
      <ProfileDetails person={person} inLaw={inLaw} />
    </aside>
  );
}
```

The token classes (`bg-paper`, `border-line`, `rounded-control`, `text-ink-muted`) are the ones the other tree components use. Check `apps/web/src/shared/ui/tokens.css` before adding any new class. If the `Dialog` overlay uses a z-index below 30, raise the dialog's rather than lowering the panel's, so a dialog opened from the panel covers it.

- [ ] **Step 9: Make the card and the tray open the profile**

`PersonCard.tsx`:
- replace the `TreeActionsContext` import and its use with `OpenPersonContext` (from `./profileParams`);
- drop the "…" actions button and the `Ellipsis` and `Button` imports;
- wrap the Polaroid in the open button.

The tooltip and `inLaw` from Task 2 stay.

```tsx
export function PersonCard({ person, tape, generation, inLaw }: PersonCardProps) {
  const { t } = useTranslation();
  const openPerson = useContext(OpenPersonContext);
  const tooltipId = useId();
  const anniversary = deathAnniversaryOf(person);
  const birthday = birthdayOf(person);
  const family = inLaw ? birthFamilySubtitle(t, person) : undefined;
  const label = cardLabel(t, person, generation, inLaw);
  return (
    <div className="group relative" style={POINTER_EVENTS}>
      <button
        type="button"
        // nodrag/nopan: React Flow leaves clicks on the card alone.
        className="nodrag nopan block rounded-control text-left"
        aria-label={label}
        aria-describedby={family !== undefined ? tooltipId : undefined}
        // Focus returns here when the profile or a dialog closes (TreePage, TreeDialogs).
        data-person-open={person.id}
        onClick={() => openPerson?.(person.id)}
      >
        <Polaroid
          aria-hidden="true"
          name={person.fullName}
          label={label}
          lifeYears={lifeYears(person)}
          tape={tape}
          tilt={tiltFor(person.id)}
          dateLine={
            anniversary ? (
              <DateMark
                kind="death-anniversary"
                label={t('scrapbook.deathAnniversaryLabel', { date: dayMonth(anniversary) })}
              >
                {t('scrapbook.deathAnniversary', { date: dayMonth(anniversary) })}
              </DateMark>
            ) : undefined
          }
          marks={
            birthday ? (
              <DateMark kind="birthday" label={t('scrapbook.birthday', { date: dayMonth(birthday) })}>
                {dayMonth(birthday)}
              </DateMark>
            ) : undefined
          }
        />
      </button>
      {family !== undefined ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute top-full left-1/2 z-10 mt-1 hidden -translate-x-1/2 rounded-control bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper group-focus-within:block group-hover:block"
        >
          {family}
        </span>
      ) : null}
    </div>
  );
}
```

The button needs a visible focus ring (WCAG 2.4.7). Copy the `focus-visible:` classes that `Button.tsx` uses. With `aria-hidden` on the Polaroid, the button's own `aria-label` is the card's only name, and the Polaroid's `aria-label` is ignored.

`aria-hidden` also hides the date marks' screen-reader text inside the Polaroid, so the button must say them itself. Add a description span next to the tooltip, `<span id={marksId} className="sr-only">{marks}</span>`. Build `marks` by joining the anniversary label (`scrapbook.deathAnniversaryLabel`) and the birthday label (`scrapbook.birthday`) that exist, with ", ". Render the span only when `marks` is not empty. The button's `aria-describedby` then lists `marksId` and `tooltipId`, each only when present, joined with a space.

Task 2's board test ("shows the anniversary line and the birthday sticker") now finds each label twice: once inside the hidden Polaroid and once in the description. Change it to assert `expect(card).toHaveAccessibleDescription(...)` on the card buttons of Tư and Nam.

`UnlinkedTray.tsx`: in the same way, replace the actions button with an open button wrapped around the label-LOD Polaroid. Use `OpenPersonContext`, `data-person-open={person.id}`, `aria-label` set to the tray's label (Task 2), the same focus classes, and `aria-hidden="true"` on the Polaroid. The tray is for everyone, so it no longer depends on the role.

- [ ] **Step 10: Wire the page and the dialogs**

In `TreeDialogs.tsx`:
- remove the `'actions'` kind, its `case`, and the `PersonActionsDialog` and `setProgenitorOp` imports;
- replace `actionsButtonOf` with `personCardButton` from `./profileParams`;
- update the comment of `returnFocus`: "Handed on to the next dialog (actions, then add a child)" becomes "Handed on to another dialog";
- add the `onPersonDeleted: (personId: string) => void` prop. The `delete` case becomes:

```tsx
    case 'delete':
      return (
        <DeletePersonDialog
          person={person}
          onConfirm={() => {
            const result = apply(deletePersonOp(person.id));
            if (result.ok) onPersonDeleted(person.id);
            return result;
          }}
          onClose={close}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      );
```

Reset a dialog whose person is gone. This fixes the P5 ledger T12 carry-over: a stale dialog state stopped the next opener from being recorded. Hooks cannot follow the early returns, so put this effect right after `const close = …`:

```tsx
  const missing =
    dialog !== null && dialog.kind !== 'first' && tree.persons[dialog.personId] === undefined;
  useEffect(() => {
    if (missing) onDialogChange(null);
  }, [missing, onDialogChange]);
```

Delete `PersonActionsDialog.tsx` and `treeActions.ts`.

In `TreePage.tsx`, keep today's error and loading branches; they return after all the hooks below. The rest becomes:

```tsx
export function TreePage() {
  const { t } = useTranslation();
  const clan = useOutletContext<Clan>();
  const view = useClanTree(clan.id);
  const isEmpty = useTreeStore((state) => Object.keys(state.tree.persons).length === 0);
  const { dialog, changeDialog, firstPersonAdded, returnFocus } = useTreeDialog();
  const { personId, openPerson, closeProfile } = useProfileParam();
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  // A person this page deleted: their panel closes without a notice.
  const removedHere = useRef<string | null>(null);
  const canEdit = hasRoleAtLeast(clan.role, 'editor');
  const isOwner = clan.role === 'owner';

  const actions = useMemo<PersonActionsApi | null>(() => {
    if (!canEdit) return null;
    return {
      actionsFor: (id) => availableActions(useTreeStore.getState().tree, id, isOwner),
      run: (id, action) => {
        setActionError(null);
        if (action === 'setProgenitor') {
          const result = useTreeStore.getState().apply(setProgenitorOp(id));
          if (!result.ok) setActionError(applyFailureMessage(t, result.reason));
        } else if (action === 'addChild') changeDialog({ kind: 'child', personId: id });
        else if (action === 'addSpouse') changeDialog({ kind: 'spouse', personId: id });
        else if (action === 'delete') changeDialog({ kind: 'delete', personId: id });
      },
    };
  }, [canEdit, changeDialog, isOwner, t]);

  const onMissing = useCallback(
    (name: string | undefined) => {
      const silent = removedHere.current !== null && removedHere.current === personId;
      removedHere.current = null;
      if (!silent) {
        setNotice(
          name === undefined ? t('tree.profile.missingUnnamed') : t('tree.profile.missing', { name }),
        );
      }
      closeProfile();
    },
    [closeProfile, personId, t],
  );

  // The panel closed with focus inside it (Esc, the close button, Back): back to the card.
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const was = previous.current;
    previous.current = personId;
    if (personId !== null) setNotice('');
    if (was === null || personId !== null) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    (personCardButton(was) ?? document.querySelector<HTMLElement>('main'))?.focus();
  }, [personId]);

  // ...today's error and loading returns...
  return (
    <OpenPersonContext value={openPerson}>
      <PersonActionsContext value={actions}>
        <div className={personId === null ? 'flex flex-col gap-4' : 'flex flex-col gap-4 md:pr-[416px]'}>
          <TreeToolbar canEdit={canEdit} />
          <p role="status" className="font-medium text-ink empty:hidden">
            {notice}
          </p>
          {actionError ? (
            <p role="alert" className="font-medium text-stamp">
              {actionError}
            </p>
          ) : null}
          {isEmpty ? (
            <EmptyTree onAddFirst={canEdit ? () => changeDialog({ kind: 'first' }) : undefined} />
          ) : (
            <>
              <TreeBoard label={t('tree.board.label', { name: clan.name })} />
              <UnlinkedTray />
            </>
          )}
        </div>
        {personId !== null ? (
          <ProfilePanel
            key={personId}
            personId={personId}
            isOwner={isOwner}
            actions={actions}
            onClose={closeProfile}
            onMissing={onMissing}
          />
        ) : null}
        {canEdit ? (
          <TreeDialogs
            dialog={dialog}
            isOwner={isOwner}
            onDialogChange={changeDialog}
            onFirstPersonAdded={firstPersonAdded}
            onPersonDeleted={(id) => {
              removedHere.current = id;
            }}
            onCloseAutoFocus={returnFocus}
          />
        ) : null}
      </PersonActionsContext>
    </OpenPersonContext>
  );
}
```

`empty:hidden` keeps the status region in the DOM while it is empty, so a later message is announced, but it takes no space. The panel calls `onMissing` only once the tree is `ready`, so a profile link waits for the tree to load. The right padding while the panel is open keeps the board's right edge, with its zoom buttons, out from under the panel.

- [ ] **Step 11: Update the existing tests**

The actions button is gone, so tests find people by their card.
- In `TreeBoard.test.tsx` and `TreeEditing.test.tsx`, replace `getByRole('button', { name: 'Thao tác với X' })` with the card's own name, `getByRole('button', { name: /^X,/ })`.
- Replace the `TreeActionsContext` wrappers with `<OpenPersonContext value={vi.fn()}>`.
- The P6a test that checked the "…" button's focus reveal now focuses the card button instead.
- `TreeEditing.test.tsx`'s `openActions(user, name)` helper clicks the card, then returns `screen.getByRole('complementary', { name })`. Its callers click "Thêm con" and the other actions inside the panel, as they did in the dialog.
- The viewer test expects no "Thêm con" button after opening a panel, rather than no "Thao tác với" buttons.
- A test that expected the actions dialog to close after "Chọn làm thuỷ tổ" now expects that button to disappear from the panel, because the person has become the progenitor.

- [ ] **Step 12: Run the tests to see them pass**

Run: `pnpm vitest run apps/web/src/features/tree apps/web/src/locales`
Expected: PASS.

- [ ] **Step 13: Mutation check**

In `ProfilePanel`, remove the `onMissing` call, and see the "closes with a notice" test fail. Then restore it.

- [ ] **Step 14: Run the whole check, then commit**

Run: `pnpm check` (allow 10 minutes). Expected: exit 0. The e2e helpers change in Task 9, so the e2e specs that click "Thao tác với …" fail until then; do not run `pnpm e2e` in this task.

```
feat(web): the profile panel, opened from a card and kept in the URL

- read mode for everyone; the actions for editors replace the actions dialog
- the panel closes with a notice when its person leaves the tree
- a dialog whose person is gone resets, so the next opener is recorded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 5: The right-click card menu

Spec §7.6. On a pointer device, right-clicking a card opens a menu with the same actions as the panel. The menu key and Shift+F10 open it too, because the browser fires `contextmenu` for them. Viewers get the browser's own menu.

**Files:**
- Create: `apps/web/src/features/tree/CardMenu.tsx`
- Modify: `apps/web/src/features/tree/PersonCard.tsx`
- Test: `apps/web/src/features/tree/CardMenu.test.tsx` (new)

**Interfaces:**
- Consumes: `PersonActionsContext`, `ACTION_ICONS`, `actionLabelKey`, `type PersonActionId` (Task 4).
- Produces: `CardMenu({ personId, children }: { personId: string; children: ReactElement })`. Without a `PersonActionsContext` it renders `children` alone.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { CardMenu } from './CardMenu';
import { PersonActionsContext, type PersonActionsApi } from './usePersonActions';

function renderMenu(api: PersonActionsApi | null) {
  return renderWithProviders(
    <PersonActionsContext value={api}>
      <CardMenu personId="p1">
        <button type="button">Nguyễn Văn Nam, đời thứ 2</button>
      </CardMenu>
    </PersonActionsContext>,
  );
}

describe('CardMenu', () => {
  it('lists the actions on right-click and runs the one chosen', async () => {
    const run = vi.fn();
    renderMenu({ actionsFor: () => ['addChild', 'addSpouse', 'delete'], run });
    fireEvent.contextMenu(screen.getByRole('button', { name: /Nguyễn Văn Nam/ }));
    const menu = await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Thêm con',
      'Thêm vợ/chồng',
      'Xoá người này',
    ]);
    await userEvent.setup().click(screen.getByRole('menuitem', { name: 'Thêm con' }));
    expect(run).toHaveBeenCalledWith('p1', 'addChild');
    expect(menu).not.toBeInTheDocument();
  });

  it('adds no menu for viewers', () => {
    renderMenu(null);
    fireEvent.contextMenu(screen.getByRole('button', { name: /Nguyễn Văn Nam/ }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `pnpm vitest run apps/web/src/features/tree/CardMenu.test.tsx`
Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Write `CardMenu.tsx`**

```tsx
import { ContextMenu } from 'radix-ui';
import { useContext, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ACTION_ICONS,
  actionLabelKey,
  PersonActionsContext,
  type PersonActionId,
} from './usePersonActions';

const ITEM =
  'flex cursor-default items-center gap-2 rounded-control px-3 py-2 text-base outline-none select-none';

/** The right-click menu of a card (spec §7.6): the panel's actions, read when it opens. */
export function CardMenu({ personId, children }: { personId: string; children: ReactElement }) {
  const { t } = useTranslation();
  const api = useContext(PersonActionsContext);
  const [items, setItems] = useState<PersonActionId[]>([]);
  if (api === null) return children;
  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        if (open) setItems(api.actionsFor(personId));
      }}
    >
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-48 rounded-control border border-line bg-paper p-1 shadow-lg">
          {items.map((action) => {
            const Icon = ACTION_ICONS[action];
            return (
              <ContextMenu.Item
                key={action}
                className={`${ITEM} ${action === 'delete' ? 'text-stamp' : 'text-ink'}`}
                onSelect={() => api.run(personId, action)}
              >
                <Icon aria-hidden="true" strokeWidth={1.75} className="size-4" />
                {t(actionLabelKey(action))}
              </ContextMenu.Item>
            );
          })}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
```

Add a highlighted-item background with `data-highlighted:`. Use the hover background of `Button`'s `ghost` variant in `Button.tsx`, so the highlight keeps the project's contrast.

- [ ] **Step 4: Use it on the card**

In `PersonCard.tsx`, wrap the open `<button>` in `<CardMenu personId={person.id}>…</CardMenu>`. Leave the tray buttons alone: the spec puts the menu on the board's cards.

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm vitest run apps/web/src/features/tree`
Expected: PASS.

- [ ] **Step 6: Mutation check**

Make `onSelect` do nothing, and see the first test fail. Then restore it.

- [ ] **Step 7: Run the whole check, then commit**

Run: `pnpm check`. Expected: exit 0.

```
feat(web): right-click a card for its actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 6: Edit mode

Spec §7.6.
- **Opening.** Editors press **Sửa** in the panel to get the form.
- **What the form covers.** Every person field. The birth-family fields appear for in-laws only. Birth and death use `DualDateInput`.
- **Save.** Save sends **one** `updatePerson` with only the fields changed since the form opened. The changes are built from the Zod-parsed values, and an emptied optional field is sent as `null`. If nothing changed, the form just closes.
- **Cancel.** Cancel drops the form.
- **Leaving with unsaved changes.** Closing the panel, opening another person, or leaving the page with unsaved changes asks first. This goes through the one `useBlocker` in `UnsentChangesGuard`, because React Router allows only one. The tab also asks before it unloads.
- **A change made elsewhere.** If someone else changes the person while the form is open, a note says that only the fields you edited will be sent.

**Files:**
- Create: `apps/web/src/features/tree/profileForm.ts`
- Create: `apps/web/src/features/tree/ProfileForm.tsx`
- Create: `apps/web/src/features/tree/profileDraft.ts`
- Modify: `apps/web/src/features/tree/ProfilePanel.tsx` (the Edit button, read or edit mode)
- Modify: `apps/web/src/features/tree/TreePage.tsx` (`onMissing` drops the draft and says so)
- Modify: `apps/web/src/features/tree/UnsentChangesGuard.tsx`
- Modify: `apps/web/src/shared/lib/formErrors.ts` (`params.messageKey` on custom issues)
- Modify: `apps/web/src/locales/vi.json`, `apps/web/src/locales/en.json`
- Test: `apps/web/src/features/tree/profileForm.test.ts` (new), `apps/web/src/features/tree/ProfileForm.test.tsx` (new), `apps/web/src/shared/lib/formErrors.test.ts`

**Interfaces:**
- Consumes: `DualDateInput`, `draftToDateInfo`, `draftFromDateInfo`, `EMPTY_DATE_DRAFT` (Task 3); `PersonSchema`, `BirthFamilySchema`, `type PersonChanges` (shared); `personParam` (Task 4).
- Produces (`profileForm.ts`):
  - `ProfileFormSchema`: a Zod schema whose input is `ProfileFormValues` (strings, drafts, booleans) and whose output is `ProfileValues`;
  - `type ProfileFormValues = z.input<typeof ProfileFormSchema>`;
  - `type ProfileValues = z.output<typeof ProfileFormSchema>`;
  - `formValuesFromPerson(person: Person): ProfileFormValues`;
  - `personChanges(base: ProfileValues | null, next: ProfileValues): PersonChanges | null`.
- Produces (`profileDraft.ts`): `useProfileDraft` (a Zustand store `{ dirty: boolean; setDirty: (dirty: boolean) => void }`) and `discardProfileDraft(): void`.

- [ ] **Step 1: Add the locale keys**

`vi.json`:
- merge these keys into the `tree.profile` object from Task 4;
- add `profileDraft` next to `switchTree` in `tree`;
- add `discardProfile` inside `tree.switchTree`.

```json
"profile": {
  "save": "Lưu",
  "cancel": "Huỷ",
  "aliasesHint": "Mỗi dòng một tên.",
  "status": "Tình trạng",
  "siblingOrderHint": "Từ 1 đến 99. Để trống nếu chưa rõ.",
  "siblingOrderError": "Nhập một số từ 1 đến 99.",
  "changedElsewhere": "Người này vừa được sửa ở nơi khác. Khi lưu, chỉ những ô bạn đã sửa được gửi đi.",
  "missingWithDraft": "{{name}} không còn trong cây nên hồ sơ đã đóng. Các thay đổi chưa lưu đã bị bỏ."
},
"profileDraft": {
  "title": "Bỏ các thay đổi trong hồ sơ?",
  "body": "Bạn đã sửa hồ sơ nhưng chưa lưu. Nếu đi tiếp, những thay đổi này sẽ mất.",
  "stay": "Ở lại sửa tiếp",
  "discard": "Bỏ thay đổi"
},
"switchTree": {
  "discardProfile": "Các thay đổi chưa lưu trong hồ sơ cũng sẽ mất."
}
```

`en.json`:

```json
"profile": {
  "save": "Save",
  "cancel": "Cancel",
  "aliasesHint": "One name per line.",
  "status": "Status",
  "siblingOrderHint": "From 1 to 99. Leave empty if unknown.",
  "siblingOrderError": "Enter a number from 1 to 99.",
  "changedElsewhere": "Someone else just changed this person. Saving sends only the fields you edited.",
  "missingWithDraft": "{{name}} is no longer in the tree, so the profile closed. Your unsaved changes were dropped."
},
"profileDraft": {
  "title": "Drop your profile changes?",
  "body": "You edited the profile but did not save. If you go on, those changes are lost.",
  "stay": "Keep editing",
  "discard": "Drop the changes"
},
"switchTree": {
  "discardProfile": "Your unsaved profile changes will be lost too."
}
```

- [ ] **Step 2: Write the failing tests for the form logic**

Create `apps/web/src/features/tree/profileForm.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fixturePerson } from './fixtures';
import {
  formValuesFromPerson,
  personChanges,
  ProfileFormSchema,
  type ProfileFormValues,
} from './profileForm';

const ID = '64b7f0c2a1b2c3d4e5f6c001';
const person = fixturePerson(ID, 'Nguyễn Văn Nam', {
  aliases: ['Cu Tí'],
  branch: 'Chi hai',
  birth: { source: 'solar', solar: { day: 17, month: 2, year: 2026 } },
});

function parse(values: ProfileFormValues) {
  return ProfileFormSchema.parse(values);
}

describe('personChanges', () => {
  const base = parse(formValuesFromPerson(person));

  it('sends nothing when nothing changed, even though the stored date lacks its lunar side', () => {
    expect(personChanges(base, parse(formValuesFromPerson(person)))).toBeNull();
  });

  it('sends only the changed fields, trimmed, with emptied ones as null', () => {
    const values = formValuesFromPerson(person);
    const next = parse({
      ...values,
      fullName: '  Nguyễn Văn Năm ',
      branch: '   ',
      aliases: 'Cu Tí\n\n Tí ',
    });
    expect(personChanges(base, next)).toEqual({
      fullName: 'Nguyễn Văn Năm',
      branch: null,
      aliases: ['Cu Tí', 'Tí'],
    });
  });

  it('sends a death date with both calendars, and drops it for the living', () => {
    const values = formValuesFromPerson(person);
    const died = parse({
      ...values,
      status: 'deceased',
      death: { mode: 'lunar', day: '1', month: '1', year: '2026', isLeap: false },
    });
    expect(personChanges(base, died)).toEqual({
      death: {
        isDeceased: true,
        date: {
          source: 'lunar',
          lunar: { day: 1, month: 1, year: 2026, isLeap: false },
          solar: { day: 17, month: 2, year: 2026 },
        },
      },
    });
    const living = parse({
      ...values,
      death: { mode: 'solar', day: '1', month: '1', year: '2000', isLeap: false },
    });
    expect(personChanges(base, living)).toBeNull();
  });

  it('clears the birth date and the sibling order with null', () => {
    const values = formValuesFromPerson({ ...person, siblingOrder: 2 });
    const start = parse(values);
    const next = parse({
      ...values,
      birth: { mode: 'solar', day: '', month: '', year: '', isLeap: false },
      siblingOrder: '',
    });
    expect(personChanges(start, next)).toEqual({ birth: null, siblingOrder: null });
  });

  it('keeps the birth family together, null when emptied', () => {
    const inLaw = { ...person, birthFamily: { fatherName: 'Lê Văn Ba' } };
    const values = formValuesFromPerson(inLaw);
    const start = parse(values);
    expect(
      personChanges(
        start,
        parse({ ...values, birthFamily: { ...values.birthFamily, hometown: 'Hà Nam' } }),
      ),
    ).toEqual({ birthFamily: { fatherName: 'Lê Văn Ba', hometown: 'Hà Nam' } });
    expect(
      personChanges(
        start,
        parse({ ...values, birthFamily: { ...values.birthFamily, fatherName: '' } }),
      ),
    ).toEqual({ birthFamily: null });
  });

  it('refuses a date or sibling order it cannot store', () => {
    const values = formValuesFromPerson(person);
    const bad = ProfileFormSchema.safeParse({
      ...values,
      birth: { mode: 'lunar', day: '', month: '', year: '1950', isLeap: false },
      siblingOrder: '100',
    });
    expect(bad.success).toBe(false);
    const paths = bad.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['birth', 'siblingOrder']));
  });
});
```

Append to `apps/web/src/shared/lib/formErrors.test.ts`, in the file's existing style for calling `zodErrorMap`:

```ts
it('uses the message key a custom issue carries', () => {
  const schema = z.string().superRefine((_, ctx) =>
    ctx.addIssue({ code: 'custom', params: { messageKey: 'dates.errors.yearOnly' } }),
  );
  const result = schema.safeParse('x', { error: zodErrorMap(i18n.t) });
  expect(result.error?.issues[0]?.message).toBe('Chỉ biết năm? Hãy chọn “Chỉ biết năm”.');
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm vitest run apps/web/src/features/tree/profileForm.test.ts apps/web/src/shared/lib/formErrors.test.ts`
Expected: FAIL, because `profileForm.ts` does not exist and the custom issue gets the generic `forms.errors.invalid` message.

- [ ] **Step 4: Write `profileForm.ts` and the error-map change**

In `formErrors.ts`, the `custom` case becomes:

```ts
      case 'custom': {
        // A field-specific message, such as a DualDateInput error (profileForm.ts).
        const key = issue.params?.messageKey;
        if (typeof key === 'string') return t(key);
        return issue.params?.reason === 'passwordTooLong'
          ? t('forms.errors.passwordTooLong')
          : t('forms.errors.invalid');
      }
```

Create `apps/web/src/features/tree/profileForm.ts`:

```ts
import {
  BirthFamilySchema,
  PersonSchema,
  type BirthFamily,
  type DateInfo,
  type Person,
  type PersonChanges,
} from '@ancestors-tree/shared/tree';
import { z } from 'zod';
import { draftFromDateInfo, draftToDateInfo, EMPTY_DATE_DRAFT, type DateDraft } from '../../shared/ui';

export const DateDraftSchema: z.ZodType<DateDraft> = z.object({
  mode: z.enum(['solar', 'lunar', 'approx']),
  day: z.string(),
  month: z.string(),
  year: z.string(),
  isLeap: z.boolean(),
});

/** A DateDraft parsed into a DateInfo (null when empty), or an issue at the field. */
const DateFieldSchema = DateDraftSchema.transform((draft, ctx): DateInfo | null => {
  const result = draftToDateInfo(draft);
  if (result.ok) return result.value;
  ctx.addIssue({ code: 'custom', params: { messageKey: `dates.errors.${result.error}` } });
  return z.NEVER;
});

/** Trimmed text, null when empty, then the shared field's own rule. */
function optionalText(schema: z.ZodType<string>) {
  return z
    .string()
    .trim()
    .transform((text) => (text === '' ? null : text))
    .pipe(schema.nullable());
}

const ShortText = BirthFamilySchema.shape.surname.unwrap();

const SiblingOrderField = z
  .string()
  .trim()
  .transform((text, ctx): number | null => {
    if (text === '') return null;
    const order = Number(text);
    if (!/^\d+$/.test(text) || order < 1 || order > 99) {
      ctx.addIssue({ code: 'custom', params: { messageKey: 'tree.profile.siblingOrderError' } });
      return z.NEVER;
    }
    return order;
  });

const BirthFamilyField = z
  .object({
    surname: optionalText(ShortText),
    fatherName: optionalText(ShortText),
    motherName: optionalText(ShortText),
    hometown: optionalText(ShortText),
    note: optionalText(BirthFamilySchema.shape.note.unwrap()),
  })
  .transform((family): BirthFamily | null => {
    const kept = Object.fromEntries(
      Object.entries(family).filter(([, value]) => value !== null),
    ) as BirthFamily;
    return Object.keys(kept).length === 0 ? null : kept;
  });

/** The profile form (spec §7.6): what the fields hold in, the values ops are built from out. */
export const ProfileFormSchema = z
  .object({
    fullName: PersonSchema.shape.fullName,
    aliases: z
      .string()
      .transform((text) =>
        text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== ''),
      )
      .pipe(PersonSchema.shape.aliases),
    gender: PersonSchema.shape.gender,
    status: z.enum(['living', 'deceased']),
    birth: DateFieldSchema,
    death: DateFieldSchema,
    isAdopted: z.boolean(),
    siblingOrder: SiblingOrderField,
    branch: optionalText(PersonSchema.shape.branch.unwrap()),
    burialPlace: optionalText(PersonSchema.shape.burialPlace.unwrap()),
    bio: optionalText(PersonSchema.shape.bio.unwrap()),
    birthFamily: BirthFamilyField,
  })
  .transform(({ status, death, ...rest }) => ({
    ...rest,
    // The death fields stay in the form while "living" is picked; only the deceased keep a date.
    death:
      status === 'living'
        ? { isDeceased: false }
        : death === null
          ? { isDeceased: true }
          : { isDeceased: true, date: death },
  }));

export type ProfileFormValues = z.input<typeof ProfileFormSchema>;
export type ProfileValues = z.output<typeof ProfileFormSchema>;

export function formValuesFromPerson(person: Person): ProfileFormValues {
  const family = person.birthFamily ?? {};
  return {
    fullName: person.fullName,
    aliases: person.aliases.join('\n'),
    gender: person.gender,
    status: person.death.isDeceased ? 'deceased' : 'living',
    birth: draftFromDateInfo(person.birth),
    death: person.death.isDeceased ? draftFromDateInfo(person.death.date) : EMPTY_DATE_DRAFT,
    isAdopted: person.isAdopted,
    siblingOrder: person.siblingOrder?.toString() ?? '',
    branch: person.branch ?? '',
    burialPlace: person.burialPlace ?? '',
    bio: person.bio ?? '',
    birthFamily: {
      surname: family.surname ?? '',
      fatherName: family.fatherName ?? '',
      motherName: family.motherName ?? '',
      hometown: family.hometown ?? '',
      note: family.note ?? '',
    },
  };
}

/** Both sides come out of ProfileFormSchema, so equal values serialise alike. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The fields that differ from the values the form opened with (spec §7.6), ready for
 * `updatePerson`; null when nothing changed. Without a base (stored values the form cannot
 * parse), every field is sent.
 */
export function personChanges(
  base: ProfileValues | null,
  next: ProfileValues,
): PersonChanges | null {
  const changes: Partial<Record<keyof ProfileValues, unknown>> = {};
  for (const key of Object.keys(next) as (keyof ProfileValues)[]) {
    if (base !== null && same(base[key], next[key])) continue;
    changes[key] = next[key];
  }
  return Object.keys(changes).length === 0 ? null : (changes as PersonChanges);
}
```

`ProfileValues` keys are all `PersonChanges` keys, since the schema drops `status` in its transform. The cast is safe because each value passed the shared field schema.

If TypeScript rejects `z.ZodType<DateDraft>` as the base of `.transform`, drop the annotation. Then add `const _shape: DateDraft = {} as z.infer<typeof DateDraftSchema>;` so the draft shape is still checked, or use `satisfies`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm vitest run apps/web/src/features/tree/profileForm.test.ts apps/web/src/shared/lib/formErrors.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing component test**

Create `apps/web/src/features/tree/ProfileForm.test.tsx`. It renders the real page with `renderRoute`, so the guard and the panel take part. Copy the `editableTree` helper from `TreeEditing.test.tsx` (it mocks the tree and accepts every op), and read the sent ops the way that file does.

```tsx
import type { Op } from '@ancestors-tree/shared/tree';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReactFlow } from '../../test/reactFlow';
import { renderRoute } from '../../test/render';
import { CLAN_ID, FAMILY, ME, SON } from './fixtures';
import { resetTreeStore, signOutTreeStore, useTreeStore } from './store';

// editableTree(tree) — copied from TreeEditing.test.tsx; returns () => the ops sent.

beforeEach(() => {
  mockReactFlow();
  signOutTreeStore();
  useTreeStore.getState().setAccount(ME.id);
});

afterEach(() => {
  resetTreeStore();
  vi.unstubAllGlobals();
});

async function editSon(user: ReturnType<typeof userEvent.setup>) {
  renderRoute(`/clans/${CLAN_ID}/tree?person=${SON}`);
  const panel = await screen.findByRole('complementary', { name: 'Nguyễn Văn Nam' });
  await user.click(within(panel).getByRole('button', { name: 'Sửa' }));
  return panel;
}

describe('editing a profile', () => {
  it('saves one updatePerson with only the changed fields', async () => {
    const sent = editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    await user.click(within(panel).getByRole('radio', { name: 'Đã mất' }));
    const death = within(panel).getByRole('group', { name: 'Ngày mất' });
    await user.type(within(death).getByLabelText('Ngày'), '15');
    await user.type(within(death).getByLabelText('Tháng'), '10');
    await user.type(within(death).getByLabelText('Năm'), '1990');
    await user.click(within(panel).getByRole('button', { name: 'Lưu' }));
    expect(within(panel).queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    await waitFor(() => expect(sent()).toHaveLength(1));
    const op = sent()[0] as Extract<Op, { type: 'updatePerson' }>;
    expect(op.type).toBe('updatePerson');
    expect(op.payload.id).toBe(SON);
    expect(Object.keys(op.payload.changes)).toEqual(['death']);
    expect(op.payload.changes.death).toMatchObject({
      isDeceased: true,
      date: { source: 'lunar', lunar: { day: 15, month: 10, year: 1990, isLeap: false } },
    });
  });

  it('asks before closing with unsaved changes, and keeps them on "stay"', async () => {
    editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    const name = within(panel).getByLabelText('Họ và tên');
    await user.clear(name);
    await user.type(name, 'Nguyễn Văn Năm');
    await user.click(within(panel).getByRole('button', { name: 'Đóng hồ sơ' }));
    const ask = await screen.findByRole('dialog', { name: 'Bỏ các thay đổi trong hồ sơ?' });
    await user.click(within(ask).getByRole('button', { name: 'Ở lại sửa tiếp' }));
    expect(within(panel).getByLabelText('Họ và tên')).toHaveValue('Nguyễn Văn Năm');
    await user.click(within(panel).getByRole('button', { name: 'Đóng hồ sơ' }));
    const again = await screen.findByRole('dialog', { name: 'Bỏ các thay đổi trong hồ sơ?' });
    await user.click(within(again).getByRole('button', { name: 'Bỏ thay đổi' }));
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Nguyễn Văn Nam' })).not.toBeInTheDocument(),
    );
  });

  it('shows a date error at the field and does not save', async () => {
    const sent = editableTree(FAMILY);
    const user = userEvent.setup();
    const panel = await editSon(user);
    const birth = within(panel).getByRole('group', { name: 'Ngày sinh' });
    await user.type(within(birth).getByLabelText('Năm'), '1950');
    await user.click(within(panel).getByRole('button', { name: 'Lưu' }));
    expect(await within(birth).findByText('Chỉ biết năm? Hãy chọn “Chỉ biết năm”.')).toBeInTheDocument();
    expect(sent()).toHaveLength(0);
  });
});
```

`TextField` labels its input with the visible label, so `getByLabelText('Họ và tên')` finds the name field.

- [ ] **Step 7: Run the test to see it fail**

Run: `pnpm vitest run apps/web/src/features/tree/ProfileForm.test.tsx`
Expected: FAIL, because there is no "Sửa" button.

- [ ] **Step 8: Write `profileDraft.ts`**

```ts
import { create } from 'zustand';

interface ProfileDraftState {
  /** The open profile form has changes that are not saved. */
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
}

/** Read by UnsentChangesGuard, which owns the app's one navigation blocker. */
export const useProfileDraft = create<ProfileDraftState>()((set) => ({
  dirty: false,
  setDirty: (dirty) => set({ dirty }),
}));

export function discardProfileDraft(): void {
  useProfileDraft.setState({ dirty: false });
}
```

- [ ] **Step 9: Write `ProfileForm.tsx`**

```tsx
import type { Person } from '@ancestors-tree/shared/tree';
import { useEffect, useId, useState, type ComponentProps } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useZodForm } from '../../shared/lib/formErrors';
import { Button, DualDateInput, TextField } from '../../shared/ui';
import { applyFailureMessage } from './format';
import { useProfileDraft } from './profileDraft';
import { formValuesFromPerson, personChanges, ProfileFormSchema } from './profileForm';
import { useTreeStore } from './store';

const AREA =
  'min-h-20 rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink aria-invalid:border-stamp';

interface TextAreaFieldProps extends ComponentProps<'textarea'> {
  label: string;
  hint?: string;
  error?: string;
}

/** TextField's layout for a multi-line value. */
function TextAreaField({ label, hint, error, ...props }: TextAreaFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={id}
        className={AREA}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-stamp">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface ProfileFormProps {
  person: Person;
  inLaw: boolean;
  onDone: () => void;
}

/** Edit mode (spec §7.6): one updatePerson with the fields changed since the form opened. */
export function ProfileForm({ person, inLaw, onDone }: ProfileFormProps) {
  const { t } = useTranslation();
  const apply = useTreeStore((state) => state.apply);
  const setDirty = useProfileDraft((state) => state.setDirty);
  // What the form opened with: the base of the changes, fixed for the form's life.
  const [opened] = useState(() => {
    const values = formValuesFromPerson(person);
    const parsed = ProfileFormSchema.safeParse(values);
    return { person, values, base: parsed.success ? parsed.data : null };
  });
  const form = useZodForm(ProfileFormSchema, { defaultValues: opened.values });
  const { errors, isDirty } = form.formState;
  const status = form.watch('status');

  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  const submit = form.handleSubmit((values) => {
    const changes = personChanges(opened.base, values);
    if (changes === null) {
      onDone();
      return;
    }
    const result = apply({ type: 'updatePerson', payload: { id: person.id, changes } });
    if (!result.ok) {
      form.setError('root.server', { type: 'rule', message: applyFailureMessage(t, result.reason) });
      return;
    }
    setDirty(false);
    onDone();
  });

  const dateField = (name: 'birth' | 'death', legend: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <DualDateInput
          legend={legend}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
        />
      )}
    />
  );
  const radio = (name: 'gender' | 'status', value: string, label: string) => (
    <label className="flex items-center gap-2">
      <input type="radio" value={value} className="size-4" {...form.register(name)} />
      {label}
    </label>
  );

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {person !== opened.person ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('tree.profile.changedElsewhere')}
        </p>
      ) : null}
      <TextField
        label={t('tree.form.fullName')}
        autoComplete="off"
        error={errors.fullName?.message}
        {...form.register('fullName')}
      />
      <TextAreaField
        label={t('tree.profile.aliases')}
        hint={t('tree.profile.aliasesHint')}
        error={errors.aliases?.message}
        rows={2}
        {...form.register('aliases')}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">{t('tree.form.gender')}</legend>
        <div className="flex gap-6">
          {radio('gender', 'male', t('tree.form.male'))}
          {radio('gender', 'female', t('tree.form.female'))}
        </div>
      </fieldset>
      {dateField('birth', t('tree.profile.birth'))}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">{t('tree.profile.status')}</legend>
        <div className="flex gap-6">
          {radio('status', 'living', t('tree.form.living'))}
          {radio('status', 'deceased', t('tree.form.deceased'))}
        </div>
      </fieldset>
      {status === 'deceased' ? (
        <>
          {dateField('death', t('tree.profile.death'))}
          <TextField
            label={t('tree.profile.burialPlace')}
            autoComplete="off"
            error={errors.burialPlace?.message}
            {...form.register('burialPlace')}
          />
        </>
      ) : null}
      <TextField
        label={t('tree.profile.siblingOrder')}
        hint={t('tree.profile.siblingOrderHint')}
        inputMode="numeric"
        autoComplete="off"
        error={errors.siblingOrder?.message}
        {...form.register('siblingOrder')}
      />
      <TextField
        label={t('tree.profile.branch')}
        autoComplete="off"
        error={errors.branch?.message}
        {...form.register('branch')}
      />
      <label className="flex items-center gap-2">
        <input type="checkbox" className="size-4" {...form.register('isAdopted')} />
        {t('tree.profile.adopted')}
      </label>
      {inLaw ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium text-ink">
            {t('tree.profile.birthFamily')}
          </legend>
          {(['surname', 'fatherName', 'motherName', 'hometown'] as const).map((key) => (
            <TextField
              key={key}
              label={t(`tree.profile.${key}`)}
              autoComplete="off"
              error={errors.birthFamily?.[key]?.message}
              {...form.register(`birthFamily.${key}`)}
            />
          ))}
          <TextAreaField
            label={t('tree.profile.note')}
            rows={2}
            error={errors.birthFamily?.note?.message}
            {...form.register('birthFamily.note')}
          />
        </fieldset>
      ) : null}
      <TextAreaField
        label={t('tree.profile.bio')}
        rows={5}
        error={errors.bio?.message}
        {...form.register('bio')}
      />
      {errors.root?.server ? (
        <p role="alert" className="text-sm font-medium text-stamp">
          {errors.root.server.message}
        </p>
      ) : null}
      <div className="sticky bottom-0 flex justify-end gap-2 bg-paper py-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('tree.profile.cancel')}
        </Button>
        <Button type="submit">{t('tree.profile.save')}</Button>
      </div>
    </form>
  );
}
```

Hiding the death fields while "Còn sống" (living) is chosen does not clear them. The schema drops the date for the living, so switching back and forth loses nothing. A field the form hides keeps the value it opened with, so it never counts as a change.

- [ ] **Step 10: Put the form in the panel**

In `ProfilePanel.tsx`:
- add `const [editing, setEditing] = useState(false);` and `const editButton = useRef<HTMLButtonElement>(null);`;
- in the header, before the close button, show the Edit button when `actions !== null && !editing`:

```tsx
          {actions !== null && !editing ? (
            <Button ref={editButton} variant="secondary" onClick={() => setEditing(true)}>
              <Pencil {...ICON} />
              {t('tree.profile.edit')}
            </Button>
          ) : null}
```

- render the form in place of the actions and the details while editing:

```tsx
      {editing ? (
        <ProfileForm person={person} inLaw={inLaw} onDone={() => setEditing(false)} />
      ) : (
        <>
          {/* the actions section and <ProfileDetails> from Task 4, unchanged */}
        </>
      )}
```

- when the form closes, its Save or Cancel button is gone with it, so focus moves to the Edit button:

```tsx
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
```

Put these hooks before `if (!person) return null;`. `TreePage` keys the panel by `personId`, so another person always starts in read mode. If `Button` does not forward refs, wrap the ref in the same way `Button.tsx` passes its props (React 19 passes `ref` as a prop).

In `TreePage.tsx`, `onMissing` also drops a draft and says so:

```ts
  const onMissing = useCallback(
    (name: string | undefined) => {
      const silent = removedHere.current !== null && removedHere.current === personId;
      removedHere.current = null;
      const hadDraft = useProfileDraft.getState().dirty;
      // Dropped before closing, so the guard does not ask about someone who is gone.
      discardProfileDraft();
      if (!silent) {
        setNotice(
          name === undefined
            ? t('tree.profile.missingUnnamed')
            : t(hadDraft ? 'tree.profile.missingWithDraft' : 'tree.profile.missing', { name }),
        );
      }
      closeProfile();
    },
    [closeProfile, personId, t],
  );
```

- [ ] **Step 11: Extend `UnsentChangesGuard`**

Add one paragraph to the comment at the top of the file: "An open profile form with unsaved changes also asks before the panel closes, another person opens, or the page changes (profileDraft.ts). React Router allows one blocker, so both reasons live here; when both apply, the tree question is asked and says the profile edits go too."

The component becomes the following. The `returnTo` ref with its layout effect, the `onCloseAutoFocus` handler and the existing comments stay as they are.

```tsx
export function UnsentChangesGuard() {
  const { t } = useTranslation();
  const unsent = useTreeStore(selectUnsentCount);
  const loadedClanId = useTreeStore((state) => state.clanId);
  const profileDirty = useProfileDraft((state) => state.dirty);
  const hasUnsent = unsent > 0;
  const switchesTree = (pathname: string) => {
    const next = treeOpenedBy(pathname);
    return hasUnsent && next !== null && next !== loadedClanId;
  };
  const leavesProfile = (from: Location, to: Location) =>
    profileDirty &&
    (from.pathname !== to.pathname || personParam(from.search) !== personParam(to.search));
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      switchesTree(nextLocation.pathname) || leavesProfile(currentLocation, nextLocation),
  );
  const blocked = blocker.state === 'blocked';
  const askTree = blocked && switchesTree(blocker.location.pathname);
  const askProfile = blocked && !askTree && profileDirty;
  const asking = askTree || askProfile;
  // ...returnTo and its layout effect, keyed on `asking`, unchanged...

  useEffect(() => {
    if (!hasUnsent && !profileDirty) return;
    // ...the beforeunload listener, unchanged...
  }, [hasUnsent, profileDirty]);

  // Nothing would be lost any more (everything got saved meanwhile): go on.
  useEffect(() => {
    if (blocked && !asking) blocker.proceed();
  }, [asking, blocked, blocker]);

  if (!asking) return null;
  const discard = () => {
    // The user chose to drop them: see the comments of the tree case above for why now.
    if (askTree) resetTreeStore();
    discardProfileDraft();
    blocker.proceed();
  };
  const description = askTree
    ? [t('tree.switchTree.body', { count: unsent }), profileDirty ? t('tree.switchTree.discardProfile') : null]
        .filter(Boolean)
        .join(' ')
    : t('tree.profileDraft.body');
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : blocker.reset())}>
      <DialogContent
        title={askTree ? t('tree.switchTree.title') : t('tree.profileDraft.title')}
        description={description}
        onCloseAutoFocus={/* unchanged */}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => blocker.reset()}>
            {askTree ? t('tree.switchTree.stay') : t('tree.profileDraft.stay')}
          </Button>
          <Button variant="danger" onClick={discard}>
            {askTree ? t('tree.switchTree.discard') : t('tree.profileDraft.discard')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Import `type Location` from `react-router`, `personParam` from `./profileParams`, and `discardProfileDraft` and `useProfileDraft` from `./profileDraft`. Find the existing guard tests with `rtk grep "switchTree" apps/web/src`; they must still pass unchanged.

- [ ] **Step 12: Run the tests to see them pass**

Run: `pnpm vitest run apps/web/src/features/tree apps/web/src/shared apps/web/src/locales`
Expected: PASS.

- [ ] **Step 13: Mutation checks**

1. In `personChanges`, drop the `same(...)` check so every field is sent. See "sends only the changed fields" fail, then restore the check.
2. In the guard, make `leavesProfile` return `false`. See "asks before closing with unsaved changes" fail, then restore it.

- [ ] **Step 14: Run the whole check, then commit**

Run: `pnpm check` (allow 10 minutes). Expected: exit 0.

```
feat(web): edit a profile, saved as one updatePerson of the changed fields

- every field, with DualDateInput for birth and death and the birth family
  for in-laws; ops are built from the parsed, trimmed values
- unsaved changes ask before the panel closes, another person opens or the
  page changes, through the app's one navigation blocker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 7: Add parent

Spec §7.6, plus the in-law rule that Task 10 writes into the spec.
- **No parents yet.** The batch adds the new person, a Union with them as its only partner, and `setParents`.
- **One known parent.** The new person joins that Union through `updateUnion` `partnerIds`. The form names the siblings who get the same parent, and the gender defaults to the other one.
- **Two known parents.** Not offered.
- **On the progenitor.** Only the Owner sees the action. The form shows "Đặt người này làm thuỷ tổ (đời thứ 1)", ticked by default, and the batch ends with `setProgenitor`.
- **In-laws.** Never offered: their parents belong in the birth family.

It is one op either way, so one undo step.

**Files:**
- Modify: `apps/web/src/features/tree/ops.ts` (`parentSlot`, `addParentOp`)
- Modify: `apps/web/src/features/tree/usePersonActions.ts` (`addParent` in `availableActions`)
- Modify: `apps/web/src/features/tree/PersonFormDialog.tsx` (`defaultGender`, `note`, `checkbox`)
- Modify: `apps/web/src/features/tree/TreeDialogs.tsx` (the `'parent'` kind), `apps/web/src/features/tree/TreePage.tsx` (run `addParent`)
- Modify: `apps/web/src/locales/vi.json`, `apps/web/src/locales/en.json`
- Test: `apps/web/src/features/tree/ops.test.ts`, `apps/web/src/features/tree/usePersonActions.test.ts` (new), `apps/web/src/features/tree/TreeEditing.test.tsx`

**Interfaces:**
- Produces (`ops.ts`):
  - `type ParentSlot = { kind: 'none' } | { kind: 'one'; union: Union; parent: Person; siblings: readonly Person[] } | { kind: 'full' }`;
  - `parentSlot(tree: TreeState, index: TreeIndex, childId: string): ParentSlot`;
  - `addParentOp(tree: TreeState, index: TreeIndex, childId: string, input: NewPersonInput, makeProgenitor: boolean): Op`.
- Produces (`PersonFormDialog`):
  - props `defaultGender?: Gender`, `note?: string` and `checkbox?: { label: string; defaultChecked: boolean }`;
  - `onSubmit(input, unionId, checked: boolean)`.
- Produces (`TreeDialogs`): `TreeDialog` gains `{ kind: 'parent'; personId: string }`.

- [ ] **Step 1: Add the locale keys**

`vi.json`, in `tree.form`:

```json
"parentTitle": "Thêm cha/mẹ của {{name}}",
"parentAlsoOf": "Người này cũng sẽ là cha/mẹ của: {{names}}.",
"makeProgenitor": "Đặt người này làm thuỷ tổ (đời thứ 1)"
```

`en.json`:

```json
"parentTitle": "Add a parent of {{name}}",
"parentAlsoOf": "This person will also be the parent of: {{names}}.",
"makeProgenitor": "Make this person the progenitor (generation 1)"
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/web/src/features/tree/ops.test.ts`. Add `addParentOp` and `parentSlot` to the import from `./ops`.

```ts
describe('addParentOp', () => {
  const parent: NewPersonInput = { fullName: 'Nguyễn Văn Cố', gender: 'male', isDeceased: true };

  it('gives a person without parents a one-parent union, in one batch', () => {
    expect(parentSlot(tree, index, GRANDPA)).toEqual({ kind: 'none' });
    const op = addParentOp(tree, index, GRANDPA, parent, false);
    expect(op.type).toBe('batch');
    const next = applyOp(tree, op).tree;
    const added = Object.values(next.persons).find((person) => person.fullName === 'Nguyễn Văn Cố');
    const unionId = next.persons[GRANDPA]?.parentUnionId;
    expect(unionId).toBeDefined();
    expect(next.unions[unionId ?? '']?.partnerIds).toEqual([added?.id]);
    expect(next.progenitorId).toBe(GRANDPA);
  });

  it('makes the new parent the progenitor when asked, still one op', () => {
    const next = applyOp(tree, addParentOp(tree, index, GRANDPA, parent, true)).tree;
    expect(next.persons[next.progenitorId ?? '']?.fullName).toBe('Nguyễn Văn Cố');
  });

  it('adds the second parent to the union of the first', () => {
    const oneParent = treeStateFromLists(
      FAMILY.progenitorId,
      FAMILY.persons,
      FAMILY.unions.map((union) =>
        union.id === PARENTS_UNION ? { ...union, partnerIds: [GRANDPA] } : union,
      ),
    );
    const oneIndex = buildTreeIndex(oneParent);
    expect(parentSlot(oneParent, oneIndex, SON)).toMatchObject({
      kind: 'one',
      parent: { id: GRANDPA },
      siblings: [],
    });
    const op = addParentOp(oneParent, oneIndex, SON, { ...parent, gender: 'female' }, false);
    expect(applyOp(oneParent, op).tree.unions[PARENTS_UNION]?.partnerIds).toHaveLength(2);
  });

  it('finds both parents known', () => {
    expect(parentSlot(tree, index, SON)).toEqual({ kind: 'full' });
  });
});
```

Create `apps/web/src/features/tree/usePersonActions.test.ts`:

```ts
import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { FAMILY, GRANDMA, GRANDPA, LOOSE, SON } from './fixtures';
import { availableActions } from './usePersonActions';

const tree = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);

describe('availableActions', () => {
  it('offers Add parent on the progenitor to the Owner only', () => {
    expect(availableActions(tree, GRANDPA, true)).toEqual([
      'addChild',
      'addSpouse',
      'addParent',
      'delete',
    ]);
    expect(availableActions(tree, GRANDPA, false)).toEqual(['addChild', 'addSpouse', 'delete']);
  });

  it('does not offer Add parent to in-laws or to someone with both parents', () => {
    expect(availableActions(tree, GRANDMA, true)).not.toContain('addParent');
    expect(availableActions(tree, SON, true)).not.toContain('addParent');
  });

  it('offers it to an unlinked person without parents', () => {
    expect(availableActions(tree, LOOSE, false)).toContain('addParent');
  });
});
```

In `TreeEditing.test.tsx`, add an integration test in the file's style:
- **Setup.** As the Owner, open "Nguyễn Văn Tư"'s panel and click "Thêm cha/mẹ". The dialog "Thêm cha/mẹ của Nguyễn Văn Tư" shows the checkbox "Đặt người này làm thuỷ tổ (đời thứ 1)", ticked.
- **Sending.** Fill "Nguyễn Văn Cố" and press "Thêm vào cây". Exactly one op goes out, and it is a `batch` whose last op is `setProgenitor`.
- **Result.** A card whose name starts "Nguyễn Văn Cố," and ends "đời thứ 1" appears.

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm vitest run apps/web/src/features/tree/ops.test.ts apps/web/src/features/tree/usePersonActions.test.ts apps/web/src/features/tree/TreeEditing.test.tsx`
Expected: FAIL, because `addParentOp` and `parentSlot` do not exist and `addParent` is never offered.

- [ ] **Step 4: Write `parentSlot` and `addParentOp`**

Append to `apps/web/src/features/tree/ops.ts`, and add `type TreeState` to its shared import:

```ts
export type ParentSlot =
  | { kind: 'none' }
  | { kind: 'one'; union: Union; parent: Person; siblings: readonly Person[] }
  | { kind: 'full' };

/** Where a new parent of `childId` goes (spec §7.6 "Add parent"). */
export function parentSlot(tree: TreeState, index: TreeIndex, childId: string): ParentSlot {
  const unionId = tree.persons[childId]?.parentUnionId;
  const union = unionId === undefined ? undefined : tree.unions[unionId];
  if (union === undefined) return { kind: 'none' };
  const parent = union.partnerIds.length === 1 ? tree.persons[union.partnerIds[0] ?? ''] : undefined;
  if (parent === undefined) return { kind: 'full' };
  const siblings = index.childrenOf(union.id).filter((child) => child.id !== childId);
  return { kind: 'one', union, parent, siblings };
}

/**
 * A parent of `childId`, as one op: with no parents, a one-parent union and setParents; with
 * one, the second partner of that union. `makeProgenitor` ends the batch with setProgenitor.
 * Not for a child with two parents: availableActions does not offer it then.
 */
export function addParentOp(
  tree: TreeState,
  index: TreeIndex,
  childId: string,
  input: NewPersonInput,
  makeProgenitor: boolean,
): Op {
  const parent = buildPerson(input);
  const slot = parentSlot(tree, index, childId);
  const ops: SingleOp[] = [{ type: 'addPerson', payload: parent }];
  if (slot.kind === 'one') {
    ops.push({
      type: 'updateUnion',
      payload: { id: slot.union.id, changes: { partnerIds: [slot.parent.id, parent.id] } },
    });
  } else {
    const union: Union = { id: newObjectId(), partnerIds: [parent.id], order: 1, status: 'married' };
    ops.push(
      { type: 'addUnion', payload: union },
      { type: 'setParents', payload: { personId: childId, parentUnionId: union.id } },
    );
  }
  if (makeProgenitor) ops.push({ type: 'setProgenitor', payload: { personId: parent.id } });
  return { type: 'batch', payload: { ops } };
}
```

- [ ] **Step 5: Offer it**

In `usePersonActions.ts`, `availableActions` becomes:

```ts
export function availableActions(
  tree: TreeState,
  personId: string,
  isOwner: boolean,
): PersonActionId[] {
  if (!tree.persons[personId]) return [];
  const actions: PersonActionId[] = ['addChild', 'addSpouse'];
  const isProgenitor = tree.progenitorId === personId;
  // In-laws' parents belong in their birth family (spec §7.6, §8).
  const inLaw = classifyLineage(tree).get(personId) === 'in-law';
  const slot = parentSlot(tree, buildTreeIndex(tree), personId).kind;
  if (!inLaw && slot !== 'full' && (!isProgenitor || isOwner)) actions.push('addParent');
  if (isOwner && !isProgenitor) actions.push('setProgenitor');
  actions.push('delete');
  return actions;
}
```

Import `buildTreeIndex` and `classifyLineage` from `@ancestors-tree/shared/tree`, and `parentSlot` from `./ops`.

- [ ] **Step 6: Extend `PersonFormDialog`**

Add these props:

```ts
  /** The gender picked when the form opens. */
  defaultGender?: Gender;
  /** A sentence above the fields, such as the siblings who get the same parent. */
  note?: string;
  /** An extra checkbox; its state is passed to onSubmit. */
  checkbox?: { label: string; defaultChecked: boolean };
  onSubmit: (input: NewPersonInput, unionId: string | undefined, checked: boolean) => ApplyResult;
```

Then:
- add `checked: z.boolean()` to `PersonFormSchema`;
- make the defaults `gender: defaultGender ?? 'male'` and `checked: checkbox?.defaultChecked ?? false`;
- pass `values.checked` as the third argument of `onSubmit`;
- render the note as the form's first child, `<p className="text-sm text-ink-muted">{note}</p>`;
- render the checkbox after the status fieldset:

```tsx
          {checkbox ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4" {...form.register('checked')} />
              {checkbox.label}
            </label>
          ) : null}
```

Import `type Gender` from `@ancestors-tree/shared/tree`. The existing callers ignore the third argument.

- [ ] **Step 7: Wire the dialog and the action**

In `TreeDialogs.tsx`:
- add `'parent'` to the person kinds;
- build the index for it too: `const needsIndex = dialog?.kind === 'child' || dialog?.kind === 'spouse' || dialog?.kind === 'parent';`;
- add the case:

```tsx
    case 'parent': {
      if (index === null) return null;
      const slot = parentSlot(tree, index, person.id);
      const offerProgenitor = isOwner && tree.progenitorId === person.id;
      return (
        <PersonFormDialog
          title={t('tree.form.parentTitle', { name: person.fullName })}
          defaultGender={slot.kind === 'one' && slot.parent.gender === 'male' ? 'female' : 'male'}
          note={
            slot.kind === 'one' && slot.siblings.length > 0
              ? t('tree.form.parentAlsoOf', {
                  names: slot.siblings.map((sibling) => sibling.fullName).join(', '),
                })
              : undefined
          }
          checkbox={
            offerProgenitor ? { label: t('tree.form.makeProgenitor'), defaultChecked: true } : undefined
          }
          onSubmit={(input, _unionId, checked) =>
            apply(addParentOp(tree, index, person.id, input, offerProgenitor && checked))
          }
          onClose={close}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      );
    }
```

In `TreePage.tsx`'s `run`, add `else if (action === 'addParent') changeDialog({ kind: 'parent', personId: id });`.

- [ ] **Step 8: Run the tests to see them pass**

Run: `pnpm vitest run apps/web/src/features/tree apps/web/src/locales`
Expected: PASS.

- [ ] **Step 9: Mutation check**

Drop the `!inLaw` condition, and see "does not offer Add parent to in-laws" fail. Then restore it.

- [ ] **Step 10: Run the whole check, then commit**

Run: `pnpm check`. Expected: exit 0.

```
feat(web): add a missing parent, and a new progenitor above the old one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 8: Arrow keys between relatives

Spec §7.8. These keys work on a focused card.
- **Blood relatives.**
  - ↑ moves to a parent: the blood one, else the other one.
  - ↓ moves to the eldest child of the first union that has children.
  - ← and → move to the previous and next sibling in chart order.
- **In-laws.** ← and → move to the spouse.
- **Edges.** A key with no relative that way does nothing. Only cards on the board are targets, never the "Loose photos" tray.

The board's own key handler already ignores keys from cards (P6a), and its `onFocus` centres a focused card that is off screen.

**Files:**
- Create: `apps/web/src/features/tree/relativeNav.ts`
- Modify: `apps/web/src/features/tree/PersonCard.tsx`
- Modify: `apps/web/src/locales/vi.json`, `apps/web/src/locales/en.json` (`tree.board.keyboardHint`)
- Test: `apps/web/src/features/tree/relativeNav.test.ts` (new), `apps/web/src/features/tree/TreeBoard.test.tsx`

**Interfaces:**
- Consumes: `buildTreeIndex`, `classifyLineage`, `type TreeState` (shared); `personCardButton` (Task 4).
- Produces:
  - `type RelativeKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'`;
  - `isRelativeKey(key: string): key is RelativeKey`;
  - `relativeTarget(tree: TreeState, personId: string, key: RelativeKey): string | null`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/tree/relativeNav.test.ts`:

```ts
import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { FAMILY, fixturePerson, GRANDMA, GRANDPA, LOOSE, PARENTS_UNION, SON } from './fixtures';
import { relativeTarget } from './relativeNav';

// No siblingOrder on either child, so the chart sorts them by id: Nam (…a003), then Út.
const DAUGHTER = '64b7f0c2a1b2c3d4e5f6a004';
const tree = treeStateFromLists(
  FAMILY.progenitorId,
  [
    ...FAMILY.persons,
    fixturePerson(DAUGHTER, 'Nguyễn Thị Út', { gender: 'female', parentUnionId: PARENTS_UNION }),
  ],
  FAMILY.unions,
);

describe('relativeTarget', () => {
  it('moves up to the blood parent and down to the eldest child', () => {
    expect(relativeTarget(tree, SON, 'ArrowUp')).toBe(GRANDPA);
    expect(relativeTarget(tree, GRANDPA, 'ArrowDown')).toBe(SON);
    expect(relativeTarget(tree, GRANDPA, 'ArrowUp')).toBeNull();
  });

  it('moves between siblings in chart order', () => {
    expect(relativeTarget(tree, SON, 'ArrowRight')).toBe(DAUGHTER);
    expect(relativeTarget(tree, DAUGHTER, 'ArrowLeft')).toBe(SON);
    expect(relativeTarget(tree, DAUGHTER, 'ArrowRight')).toBeNull();
  });

  it('moves from an in-law to the spouse, and never from or into the tray', () => {
    expect(relativeTarget(tree, GRANDMA, 'ArrowLeft')).toBe(GRANDPA);
    expect(relativeTarget(tree, GRANDMA, 'ArrowRight')).toBe(GRANDPA);
    expect(relativeTarget(tree, GRANDMA, 'ArrowDown')).toBeNull();
    expect(relativeTarget(tree, LOOSE, 'ArrowUp')).toBeNull();
  });
});
```

Add to `TreeBoard.test.tsx`, rendering the family the way the file's focus tests do:

```ts
it('moves focus to a relative with the arrow keys', async () => {
  const user = userEvent.setup();
  // render the family board as the focus-reveal tests in this file do
  act(() => screen.getByRole('button', { name: /^Nguyễn Văn Nam,/ }).focus());
  await user.keyboard('{ArrowUp}');
  expect(screen.getByRole('button', { name: /^Nguyễn Văn Tư,/ })).toHaveFocus();
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm vitest run apps/web/src/features/tree/relativeNav.test.ts apps/web/src/features/tree/TreeBoard.test.tsx`
Expected: FAIL, because the module does not exist and focus stays on Nam.

- [ ] **Step 3: Write `relativeNav.ts`**

```ts
import { buildTreeIndex, classifyLineage, type TreeState } from '@ancestors-tree/shared/tree';

export type RelativeKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export function isRelativeKey(key: string): key is RelativeKey {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
}

/** The card an arrow key moves to from `personId` (spec §7.8), or null. Board cards only. */
export function relativeTarget(tree: TreeState, personId: string, key: RelativeKey): string | null {
  const person = tree.persons[personId];
  const lineage = classifyLineage(tree);
  const kind = lineage.get(personId);
  if (!person || kind === undefined || kind === 'unlinked') return null;
  const index = buildTreeIndex(tree);

  if (kind === 'in-law') {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
    for (const union of index.unionsOf(personId)) {
      const spouse = union.partnerIds.find((id) => lineage.get(id) === 'blood');
      if (spouse !== undefined) return spouse;
    }
    return null;
  }

  const parentUnion =
    person.parentUnionId === undefined ? undefined : tree.unions[person.parentUnionId];
  switch (key) {
    case 'ArrowUp': {
      const parents = parentUnion?.partnerIds ?? [];
      return (
        parents.find((id) => lineage.get(id) === 'blood') ??
        parents.find((id) => lineage.get(id) === 'in-law') ??
        null
      );
    }
    case 'ArrowDown': {
      for (const union of index.unionsOf(personId)) {
        const eldest = index.childrenOf(union.id)[0];
        if (eldest !== undefined) return eldest.id;
      }
      return null;
    }
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (parentUnion === undefined) return null;
      const siblings = index.childrenOf(parentUnion.id);
      const at = siblings.findIndex((sibling) => sibling.id === personId);
      return siblings[key === 'ArrowLeft' ? at - 1 : at + 1]?.id ?? null;
    }
  }
}
```

`index.unionsOf` sorts by union `order` and `index.childrenOf` by sibling order, the order the chart draws (`lineage.ts`). Children of a blood person are blood, so ↓ never leaves the board.

- [ ] **Step 4: Handle the keys on the card**

In `PersonCard.tsx`, add `onKeyDown` to the open button:

```tsx
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
          if (!isRelativeKey(event.key)) return;
          // Arrows on a card never scroll the page or pan the board (spec §7.8).
          event.preventDefault();
          const target = relativeTarget(useTreeStore.getState().tree, person.id, event.key);
          if (target !== null) personCardButton(target)?.focus();
        }}
```

Reading `getState()` in the handler keeps the card free of another store subscription. Import `useTreeStore` from `./store`, `isRelativeKey` and `relativeTarget` from `./relativeNav`, and `personCardButton` from `./profileParams`.

Append a sentence to `tree.board.keyboardHint` in both locales:
- vi: " Trên một thẻ: Enter mở hồ sơ, phím mũi tên đi tới người thân."
- en: " On a card: Enter opens the profile, the arrow keys move to relatives."

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm vitest run apps/web/src/features/tree apps/web/src/locales`
Expected: PASS.

- [ ] **Step 6: Mutation check**

Swap `at - 1` and `at + 1`, and see the sibling test fail. Then restore them.

- [ ] **Step 7: Run the whole check, then commit**

Run: `pnpm check`. Expected: exit 0.

```
feat(web): arrow keys move between relatives on the board

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 9: End-to-end tests

**Files:**
- Modify: `e2e/support.ts` (`cardOf` and `openProfile` replace `openActions`)
- Modify: `e2e/tree.spec.ts`, `e2e/undo-sync.spec.ts`
- Create: `e2e/profile.spec.ts`

**Interfaces:**
- Produces (`e2e/support.ts`): `cardOf(page: Page, name: string): Locator` and `openProfile(page: Page, name: string): Promise<Locator>`. `openProfile` resolves to the panel, `getByRole('complementary', { name })`.

- [ ] **Step 1: Replace the helper**

In `e2e/support.ts`, replace `openActions` with:

```ts
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A person's card on the board or in the tray: its name starts with the person's name. */
export function cardOf(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}(,|$)`) });
}

/** Opens a person's profile panel; returns it. */
export async function openProfile(page: Page, name: string) {
  await cardOf(page, name).click();
  const panel = page.getByRole('complementary', { name });
  await expect(panel).toBeVisible();
  return panel;
}
```

In `tree.spec.ts` and `undo-sync.spec.ts`, import and call `openProfile` in place of `openActions`. The callers click "Thêm con", "Xoá người này" and "Chọn làm thuỷ tổ" inside the returned locator; those buttons now live in the panel.

Two kinds of old expectation change:
- A step that expected the actions dialog to be hidden after an action now expects the panel to stay open.
- A step that deleted the person now expects the panel to have closed.

Run: `pnpm e2e e2e/tree.spec.ts e2e/undo-sync.spec.ts`. Expected: PASS. Adjust only those expectations until the specs pass; do not change what they test.

- [ ] **Step 2: Write `e2e/profile.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import {
  addPerson,
  cardOf,
  createTree,
  expectNoSeriousA11yViolations,
  openProfile,
  register,
} from './support.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/register');
  await register(page, 'Phạm Lan', 'profile');
  await createTree(page, 'Họ Phạm');
  await page.getByRole('button', { name: 'Thêm người đầu tiên' }).click();
  await addPerson(page, 'Phạm Văn Cả');
});

test('edits a lunar death date and shows the anniversary on the card', async ({ page }) => {
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await expectNoSeriousA11yViolations(page);
  await panel.getByRole('button', { name: 'Sửa' }).click();
  await panel.getByRole('radio', { name: 'Đã mất' }).check();
  const death = panel.getByRole('group', { name: 'Ngày mất' });
  await death.getByLabel('Ngày').fill('15');
  await death.getByLabel('Tháng').fill('10');
  await death.getByLabel('Năm').fill('1990');
  await expect(death).toContainText('dương lịch');
  await expectNoSeriousA11yViolations(page);
  await panel.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByText('Giỗ 15/10 ÂL')).toBeVisible();

  // The open profile is in the URL: a reload shows it again, with the saved date.
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Phạm Văn Cả' })).toContainText(
    '15/10/1990 âm lịch',
  );
});

test('the Owner adds a parent above the progenitor, and arrows move between them', async ({ page }) => {
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await panel.getByRole('button', { name: 'Thêm cha/mẹ' }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm cha/mẹ của Phạm Văn Cả' });
  await expect(
    dialog.getByRole('checkbox', { name: 'Đặt người này làm thuỷ tổ (đời thứ 1)' }),
  ).toBeChecked();
  await addPerson(page, 'Phạm Văn Tổ');
  await expect(cardOf(page, 'Phạm Văn Tổ')).toHaveAccessibleName(/đời thứ 1$/);
  await expect(cardOf(page, 'Phạm Văn Cả')).toHaveAccessibleName(/đời thứ 2$/);

  await cardOf(page, 'Phạm Văn Cả').focus();
  await page.keyboard.press('ArrowUp');
  await expect(cardOf(page, 'Phạm Văn Tổ')).toBeFocused();
});

test('asks before dropping unsaved profile changes', async ({ page }) => {
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await panel.getByRole('button', { name: 'Sửa' }).click();
  await panel.getByLabel('Họ và tên').fill('Phạm Văn Cải');
  await page.keyboard.press('Escape');
  const ask = page.getByRole('dialog', { name: 'Bỏ các thay đổi trong hồ sơ?' });
  await ask.getByRole('button', { name: 'Ở lại sửa tiếp' }).click();
  await expect(panel.getByLabel('Họ và tên')).toHaveValue('Phạm Văn Cải');

  // Back closes the panel too, so it asks again.
  await page.goBack();
  await ask.getByRole('button', { name: 'Bỏ thay đổi' }).click();
  await expect(panel).toBeHidden();
  await expect(cardOf(page, 'Phạm Văn Cả')).toBeVisible();
});
```

Check the details against `e2e/support.ts` and the existing specs:
- the sign-up route, and how the other specs reach `register`;
- the name of the "Add first person" button.

Esc in a form field reaches the panel's `onKeyDown`, because the input is inside the `aside`.

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm e2e` (allow 10 minutes). Expected: all specs pass. Then run `pnpm e2e e2e/profile.spec.ts --repeat-each=3` once, to catch flakiness.

- [ ] **Step 4: Commit**

```
test(e2e): profile panel, dates, Add parent and arrow keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 10: Docs

**Files:**
- Create: `docs/adr/0009-profile-panel-in-the-url.md`
- Modify: `docs/superpowers/plans/2026-11-12-roadmap.md`
- Modify: `docs/superpowers/specs/2026-11-11-ancestors-tree-design.md`, `docs/superpowers/specs/2026-11-11-ancestors-tree-design.vi.md`

- [ ] **Step 1: The spec line about in-laws (EN and VI in the same commit)**

In §7.6, the "**Add parent** (if missing)" list, add a last bullet:
- EN: "Not offered on in-laws: their parents belong in the birth family (§8), not in this tree."
- VI: "Không có trên thẻ con dâu, con rể: cha mẹ của họ thuộc gia đình gốc (§8), không thuộc cây này."

Match the VI file's own word for "in-law". Find it with `rtk grep "dâu" docs/superpowers/specs/2026-11-11-ancestors-tree-design.vi.md`.

- [ ] **Step 2: The ADR**

Create `docs/adr/0009-profile-panel-in-the-url.md`. Use the same headings as `0008-undo-rebase-and-revert.md`, and record these decisions:
1. **The open profile lives in the URL (`?person=`).**
   - Opening pushes a history entry, switching replaces it, and closing goes back when this tab opened it. Links, reloads and Back therefore all work.
   - Cards get a stable `openPerson` through context, so they need no router hooks and do not re-render when the URL changes.
2. **Unsaved profile edits share the blocker with unsent changes.** React Router allows one `useBlocker`, so `UnsentChangesGuard` owns both reasons, and a small Zustand flag (`profileDraft.ts`) tells it the form is dirty.
3. **Saving sends the difference between two outputs of the same Zod schema**: the values when the form opened, and the values at save.
   - A stored date without its derived side does not count as a change.
   - Every op carries trimmed, parsed values (the P5 T1 carry-over).
4. **`DateInfoSchema` refuses a derived side that is not the conversion.** Client and server share the schema, so not even a hand-written op can store two calendars that disagree.

If `docs/` has an ADR list (find it with `rtk grep "0008" docs --glob "*.md"`), add 0009 to it.

- [ ] **Step 3: The roadmap**

In `docs/superpowers/plans/2026-11-12-roadmap.md`:
- **Tick the P6b carry-overs, each with where it was done:**
  - `DateInfo` and `CLEARABLE_PERSON_FIELDS`: Task 1, with empty text becoming `null` in Task 6;
  - the stale `TreeDialogs` state: Task 4;
  - the arrow keys: Task 8;
  - ops built from parsed values: Task 6.
- **Resolve the `keepNode` line.** Mark it done with the reason: "moot: the selection lives in the URL (`?person=`), and React Flow's `elementsSelectable` stays false".
- **Mark P6b done** the same way P6a is marked. The mobile bottom bar line stays open.

- [ ] **Step 4: Check and commit**

Run: `pnpm check`. Expected: exit 0.

```
docs: P6b decisions, roadmap ticks, no "Add parent" on in-laws

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
