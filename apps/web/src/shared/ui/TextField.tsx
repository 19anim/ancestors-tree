import { useId, type ComponentProps } from 'react';
import { cn } from '../lib/cn';

export interface TextFieldProps extends ComponentProps<'input'> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, id, className, ...inputProps }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="h-10 rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-muted aria-invalid:border-stamp"
        {...inputProps}
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
