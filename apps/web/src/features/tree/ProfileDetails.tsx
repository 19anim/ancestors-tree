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
      {person.birth ? (
        <Fact term={t('tree.profile.birth')}>{dateText(t, person.birth)}</Fact>
      ) : null}
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
      {person.isAdopted ? (
        <Fact term={t('tree.profile.adopted')}>{t('tree.profile.yes')}</Fact>
      ) : null}
      {person.bio ? <Fact term={t('tree.profile.bio')}>{person.bio}</Fact> : null}
    </dl>
  );
}
