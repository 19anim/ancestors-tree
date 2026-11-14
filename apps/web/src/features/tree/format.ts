import {
  completeDateInfo,
  OpError,
  type DateInfo,
  type OpErrorCode,
  type Person,
} from '@ancestors-tree/shared/tree';
import type { TFunction } from 'i18next';
import { ApiError, errorMessageKey } from '../../shared/lib/apiError';
import type { ApplyFailure } from './store';

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

function joinYears(person: Person, show: (part: YearPart) => string): string | undefined {
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
  if (person.death.isDeceased || !person.birth || person.birth.source === 'approx')
    return undefined;
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
export function cardLabel(t: TFunction, person: Person, generation: number, inLaw = false): string {
  const years = lifeYearsSpoken(t, person);
  const name = person.fullName;
  const label =
    years === undefined
      ? t('tree.card.labelNoYears', { name, generation })
      : t('tree.card.label', { name, years, generation });
  const family = inLaw ? birthFamilySubtitle(t, person) : undefined;
  return family === undefined ? label : t('tree.card.inLawLabel', { label, family });
}

export function ruleKey(reason: OpErrorCode): `tree.rules.${OpErrorCode}` {
  return `tree.rules.${reason}`;
}

/** Why apply() did nothing: the broken rule, the tree is not loaded, or it changed meanwhile. */
export function applyFailureMessage(t: TFunction, reason: ApplyFailure): string {
  if (reason === 'NOT_LOADED') return t('tree.form.notLoaded');
  if (reason === 'OUT_OF_DATE') return t('tree.outOfDate');
  return t(ruleKey(reason));
}

/**
 * Why a change was not saved: the broken rule (found by the server, or by the rebase on this
 * device), else the error code.
 */
export function rejectionMessage(t: TFunction, error: unknown): string {
  if (error instanceof OpError) return t(ruleKey(error.code));
  if (error instanceof ApiError && error.reason !== undefined) return t(ruleKey(error.reason));
  return t(errorMessageKey(error));
}
