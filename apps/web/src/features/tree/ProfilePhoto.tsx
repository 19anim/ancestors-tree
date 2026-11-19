import type { Person } from '@ancestors-tree/shared/tree';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { initialsOf } from '../../shared/ui';
import { photoUrl } from './photoUrl';

/** The photo at the top of the profile (spec §7.6), or the person's initials. */
export function ProfilePhoto({ person }: { person: Person }) {
  const { t } = useTranslation();
  const url = photoUrl(person.photo, 'profile');
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined);
  const box = 'size-32 shrink-0 rounded-photo border border-line bg-photo object-cover';
  if (url !== undefined && failedUrl !== url) {
    return (
      <img
        src={url}
        alt={t('tree.photo.alt', { name: person.fullName })}
        className={box}
        onError={() => setFailedUrl(url)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${box} flex items-center justify-center text-3xl font-bold text-photo-ink`}
    >
      {initialsOf(person.fullName)}
    </span>
  );
}
