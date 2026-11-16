import { MAX_PHOTO_BYTES, type Person } from '@ancestors-tree/shared/tree';
import { ImageUp, Trash2 } from 'lucide-react';
import { useContext, useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, errorMessageKey } from '../../shared/lib/apiError';
import { Button } from '../../shared/ui';
import { ChangeContext } from './ChangeRunner';
import { PHOTO_TYPES, PhotoFileError, checkSource, shrinkPhoto } from './photoFile';
import { photosEnabled } from './photoUrl';
import { PhotoUploadError, requestPhotoUpload, uploadPhoto } from './photoUpload';
import { ProfilePhoto } from './ProfilePhoto';

const ICON = { 'aria-hidden': true, className: 'size-4', strokeWidth: 1.75 } as const;

type Work =
  { kind: 'idle' } | { kind: 'working'; fraction: number } | { kind: 'error'; text: string };

/** The profile's photo with "Đổi ảnh" and "Gỡ ảnh" for editors (spec §7.6 "Photo"). */
export function PhotoControl({ clanId, person }: { clanId: string; person: Person }) {
  const { t } = useTranslation();
  const requestChange = useContext(ChangeContext);
  const input = useRef<HTMLInputElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const running = useRef<AbortController | null>(null);
  const [work, setWork] = useState<Work>({ kind: 'idle' });
  const statusId = useId();

  // The panel closed or another person opened: the upload in flight is cancelled.
  useEffect(() => () => running.current?.abort(), []);

  const editable = requestChange !== null && photosEnabled();
  const working = work.kind === 'working';

  const fail = (error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    const text =
      error instanceof PhotoFileError
        ? t(`tree.photo.errors.${error.problem}`)
        : error instanceof PhotoUploadError
          ? t('tree.photo.errors.upload')
          : t(errorMessageKey(error instanceof ApiError ? error : undefined));
    setWork({ kind: 'error', text });
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared, so choosing the same file again is a change too.
    event.target.value = '';
    if (file === undefined || requestChange === null) return;
    const problem = checkSource(file);
    if (problem !== null) {
      fail(new PhotoFileError(problem));
      return;
    }
    const controller = new AbortController();
    running.current = controller;
    setWork({ kind: 'working', fraction: 0 });
    try {
      const blob = await shrinkPhoto(file);
      // Shrinking and signing cannot be cancelled: the next step does not start once closed.
      if (controller.signal.aborted) return;
      if (blob.size > MAX_PHOTO_BYTES) throw new PhotoFileError('tooLarge');
      const target = await requestPhotoUpload(clanId, person.id);
      if (controller.signal.aborted) return;
      const photo = await uploadPhoto(
        target,
        blob,
        (fraction) => {
          setWork({ kind: 'working', fraction });
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setWork({ kind: 'idle' });
      requestChange({
        change: { kind: 'photo', personId: person.id, photo },
        focusFallback: () => changeButton.current,
      });
    } catch (error) {
      fail(error);
    } finally {
      if (running.current === controller) running.current = null;
    }
  };

  return (
    <section aria-label={t('tree.photo.section')} className="flex items-start gap-3">
      <ProfilePhoto person={person} />
      {editable ? (
        <div className="flex min-w-0 flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept={PHOTO_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => void onFile(event)}
          />
          <Button
            ref={changeButton}
            variant="secondary"
            disabled={working}
            aria-describedby={statusId}
            onClick={() => input.current?.click()}
          >
            <ImageUp {...ICON} />
            {t('tree.photo.change')}
          </Button>
          {person.photo ? (
            <Button
              variant="ghost"
              disabled={working}
              onClick={() =>
                requestChange({
                  change: { kind: 'photo', personId: person.id, photo: null },
                  focusFallback: () => changeButton.current,
                })
              }
            >
              <Trash2 {...ICON} />
              {t('tree.photo.remove')}
            </Button>
          ) : null}
          <p id={statusId} aria-live="polite" className="text-sm text-ink-muted">
            {working ? t('tree.photo.uploading') : ''}
          </p>
          {working ? (
            <progress
              max={1}
              value={work.fraction}
              aria-label={t('tree.photo.uploading')}
              className="w-full"
            />
          ) : null}
          {work.kind === 'error' ? (
            <p role="alert" className="text-sm font-medium text-stamp">
              {work.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
