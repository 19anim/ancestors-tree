import type { DateInfo, Person } from '@ancestors-tree/shared/tree';
import type { TFunction } from 'i18next';

/** The year on the side the user entered (approximate years are shown as plain years in P5). */
export function yearOf(date: DateInfo | undefined): string | undefined {
  if (!date) return undefined;
  const year =
    date.source === 'solar'
      ? date.solar?.year
      : date.source === 'lunar'
        ? date.lunar?.year
        : date.approxYear;
  return year === undefined ? undefined : String(year);
}

/** "1931–2004", "1962" for the living, "1931–?" or "?–2004" when one year is unknown. */
export function lifeYears(person: Person): string | undefined {
  const born = yearOf(person.birth);
  const died = person.death.isDeceased ? yearOf(person.death.date) : undefined;
  if (born !== undefined && died !== undefined) return `${born}–${died}`;
  if (born !== undefined) return person.death.isDeceased ? `${born}–?` : born;
  if (died !== undefined) return `?–${died}`;
  return undefined;
}

/** The card's accessible name: name, life years and generation (spec §7.8). */
export function cardLabel(
  t: TFunction,
  name: string,
  years: string | undefined,
  generation: number,
): string {
  return years === undefined
    ? t('tree.card.labelNoYears', { name, generation })
    : t('tree.card.label', { name, years, generation });
}
