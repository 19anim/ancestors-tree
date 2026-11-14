import { canChiYear, MAX_YEAR, MIN_YEAR } from '@ancestors-tree/shared/lunar';
import { X } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import {
  draftToDateInfo,
  EMPTY_DATE_DRAFT,
  leapMonthOf,
  type DateDraft,
  type DateMode,
} from './dateDraft';

interface DualDateInputProps {
  legend: string;
  value: DateDraft;
  onChange: (next: DateDraft) => void;
  /** Already translated; shown under the fields and linked to them. */
  error?: string;
  onBlur?: () => void;
}

const MODES: DateMode[] = ['lunar', 'solar', 'approx'];
const FIELD =
  'h-10 w-full rounded-control border border-line-strong bg-surface px-2 text-base text-ink aria-invalid:border-stamp';

/** Lunar / Solar / Year only (spec §7.6): one side is typed, the other is shown converted. */
export function DualDateInput({ legend, value, onChange, error, onBlur }: DualDateInputProps) {
  const { t } = useTranslation();
  const id = useId();
  const errorId = `${id}-error`;
  const previewId = `${id}-preview`;
  const leapHintId = `${id}-leap-hint`;
  /** A leap month that no longer matches the month or year typed is unticked, not kept hidden. */
  const set = (patch: Partial<DateDraft>) => {
    const next = { ...value, ...patch };
    if (next.isLeap && leapMonthOf(next) !== Number(next.month.trim())) next.isLeap = false;
    onChange(next);
  };
  const result = draftToDateInfo(value);
  const date = result.ok ? result.value : null;
  const leapMonth = value.mode === 'lunar' ? leapMonthOf(value) : null;
  const leapAllowed = leapMonth !== null && leapMonth === Number(value.month.trim());
  const typedYear = /^\d{1,4}$/.test(value.year.trim()) ? Number(value.year.trim()) : null;
  const yearKnown = typedYear !== null && typedYear >= MIN_YEAR && typedYear <= MAX_YEAR;
  let leapHint: string | null = null;
  if (leapMonth !== null) {
    leapHint = t('dates.leapHint', { year: typedYear, month: leapMonth });
  } else if (yearKnown) {
    leapHint = t('dates.noLeapHint', { year: typedYear });
  }

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

  const describedBy =
    [error ? errorId : null, preview ? previewId : null].filter(Boolean).join(' ') || undefined;
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
          <label key={mode} className="flex items-center gap-2 text-sm text-ink">
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
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          {/* The hint stays outside the label, so the checkbox is named "Tháng nhuận" alone. */}
          <label className="flex items-center gap-2 text-ink">
            <input
              type="checkbox"
              className="size-4 aria-disabled:opacity-50"
              checked={value.isLeap && leapAllowed}
              aria-disabled={leapAllowed ? undefined : true}
              aria-describedby={leapHint ? leapHintId : undefined}
              onChange={() => {
                if (leapAllowed) set({ isLeap: !value.isLeap });
              }}
            />
            {t('dates.leap')}
          </label>
          {leapHint ? (
            <span id={leapHintId} className="text-ink-muted">
              {leapHint}
            </span>
          ) : null}
        </div>
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
