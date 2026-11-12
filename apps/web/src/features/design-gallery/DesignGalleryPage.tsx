import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DateMark,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Polaroid,
  TextField,
  tiltFor,
  type PolaroidLod,
} from '../../shared/ui';
import { SAMPLE_PEOPLE, SampleFamilyBoard } from '../home';

const COLOR_TOKENS = [
  'paper',
  'paper-grid',
  'surface',
  'ink',
  'ink-muted',
  'line',
  'line-strong',
  'stamp',
  'stamp-hover',
  'on-stamp',
  'accent',
  'on-accent',
  'success',
  'photo',
  'photo-ink',
  'photo-muted',
  'photo-stamp',
  'sticker',
  'on-sticker',
  'thread',
  'pin',
  'scrim',
] as const;

const TAPE_TOKENS = [
  'tape-progenitor',
  'tape-1',
  'tape-2',
  'tape-3',
  'tape-4',
  'tape-5',
  'tape-6',
  'tape-in-law',
  'tape-loose',
] as const;

const LODS = [
  { lod: 'full', labelKey: 'designGallery.photos.full' },
  { lod: 'label', labelKey: 'designGallery.photos.label' },
  { lod: 'strip', labelKey: 'designGallery.photos.strip' },
] as const satisfies ReadonlyArray<{ lod: PolaroidLod; labelKey: string }>;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line pt-8">
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Swatch({ token }: { token: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="size-10 shrink-0 rounded-control border border-line"
        style={{ backgroundColor: `var(--${token})` }}
      />
      <code className="font-mono text-sm">--{token}</code>
    </li>
  );
}

export function DesignGalleryPage() {
  const { t } = useTranslation();
  const progenitor = SAMPLE_PEOPLE[0];

  return (
    <div className="flex flex-col gap-12">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-bold">{t('designGallery.title')}</h1>
        <p className="mt-3 text-lg text-ink-muted">{t('designGallery.intro')}</p>
      </header>

      <Section id="gallery-colors" title={t('designGallery.sections.colors')}>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4">
          {[...COLOR_TOKENS, ...TAPE_TOKENS].map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </ul>
      </Section>

      <Section id="gallery-type" title={t('designGallery.sections.type')}>
        <div className="flex flex-col gap-4">
          <p className="text-4xl font-bold tracking-tight">{t('designGallery.type.display')}</p>
          <p className="max-w-prose text-base">{t('designGallery.type.body')}</p>
          <p className="font-hand text-2xl">{t('designGallery.type.hand')}</p>
          <p className="font-mono text-sm">{t('designGallery.type.mono')}</p>
        </div>
      </Section>

      <Section id="gallery-controls" title={t('designGallery.sections.controls')}>
        <div className="flex flex-wrap gap-3">
          <Button>{t('designGallery.controls.primary')}</Button>
          <Button variant="secondary">{t('designGallery.controls.secondary')}</Button>
          <Button variant="ghost">{t('designGallery.controls.ghost')}</Button>
          <Button variant="danger">{t('designGallery.controls.danger')}</Button>
          <Button disabled>{t('designGallery.controls.primary')}</Button>
        </div>
        <div className="mt-8 grid max-w-2xl gap-6 sm:grid-cols-2">
          <TextField
            label={t('designGallery.controls.nameLabel')}
            hint={t('designGallery.controls.nameHint')}
          />
          <TextField
            label={t('designGallery.controls.dateLabel')}
            defaultValue="30/10"
            error={t('designGallery.controls.dateError')}
          />
        </div>
      </Section>

      <Section id="gallery-dialog" title={t('designGallery.sections.dialog')}>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">{t('designGallery.dialog.open')}</Button>
          </DialogTrigger>
          <DialogContent
            title={t('designGallery.dialog.title')}
            description={t('designGallery.dialog.body')}
          >
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="secondary">{t('designGallery.dialog.cancel')}</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="danger">{t('designGallery.dialog.confirm')}</Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </Section>

      <Section id="gallery-photos" title={t('designGallery.sections.photos')}>
        {progenitor ? (
          <ul className="flex flex-wrap items-start gap-12">
            {LODS.map(({ lod, labelKey }) => (
              <li key={lod} className="flex flex-col items-start gap-5">
                <span className="text-sm text-ink-muted">{t(labelKey)}</span>
                <Polaroid
                  name={progenitor.name}
                  label={t('scrapbook.personLabel', {
                    name: progenitor.name,
                    years: progenitor.years,
                  })}
                  lifeYears={progenitor.years}
                  tape={progenitor.tape}
                  tilt={tiltFor(progenitor.id)}
                  lod={lod}
                  marks={
                    <DateMark kind="death-anniversary">
                      {t('scrapbook.deathAnniversary', { date: '15/10' })}
                    </DateMark>
                  }
                />
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section id="gallery-marks" title={t('designGallery.sections.marks')}>
        <div className="flex items-center gap-8">
          <DateMark kind="death-anniversary">
            {t('scrapbook.deathAnniversary', { date: '15/10' })}
          </DateMark>
          <DateMark kind="birthday">{t('scrapbook.birthday', { date: '21/11' })}</DateMark>
        </div>
        <p className="mt-4 text-sm text-ink-muted">{t('designGallery.marks.note')}</p>
      </Section>

      <Section id="gallery-threads" title={t('designGallery.sections.threads')}>
        {/* Keyboard users can focus the board and scroll it with the arrow keys on small screens. */}
        <div
          role="region"
          aria-label={t('home.boardScroll')}
          tabIndex={0}
          className="overflow-x-auto pb-2"
        >
          <SampleFamilyBoard />
        </div>
        <p className="mt-4 text-sm text-ink-muted">{t('designGallery.threads.note')}</p>
      </Section>
    </div>
  );
}
