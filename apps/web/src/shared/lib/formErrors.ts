import { zodResolver } from '@hookform/resolvers/zod';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import {
  useForm,
  type FieldValues,
  type Path,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { ApiError, errorMessageKey, type ClientErrorCode } from './apiError';

/** Translates Zod issues by code; the shared schemas carry no messages of their own. */
export function zodErrorMap(t: TFunction): z.core.$ZodErrorMap {
  return (issue) => {
    switch (issue.code) {
      case 'too_small':
        return Number(issue.minimum) <= 1
          ? t('forms.errors.required')
          : t('forms.errors.tooShort', { min: Number(issue.minimum) });
      case 'too_big':
        return t('forms.errors.tooLong', { max: Number(issue.maximum) });
      case 'invalid_format':
        return issue.format === 'email' ? t('forms.errors.email') : t('forms.errors.invalid');
      case 'custom':
        return issue.params?.reason === 'passwordTooLong'
          ? t('forms.errors.passwordTooLong')
          : t('forms.errors.invalid');
      default:
        return t('forms.errors.invalid');
    }
  };
}

/** React Hook Form driven by a shared Zod schema, with translated messages. */
export function useZodForm<Schema extends z.ZodType<FieldValues, FieldValues>>(
  schema: Schema,
  options: Omit<UseFormProps<z.input<Schema>, unknown, z.output<Schema>>, 'resolver'> = {},
): UseFormReturn<z.input<Schema>, unknown, z.output<Schema>> {
  const { t } = useTranslation();
  const resolver = useMemo(() => zodResolver(schema, { error: zodErrorMap(t) }), [schema, t]);
  return useForm<z.input<Schema>, unknown, z.output<Schema>>({
    mode: 'onTouched',
    ...options,
    resolver,
  });
}

/** Shows an API error next to the field it concerns, else above the submit button. */
export function setServerError<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, 'setError'>,
  error: unknown,
  t: TFunction,
  fieldFor: Partial<Record<ClientErrorCode, Path<T>>> = {},
): void {
  const field = error instanceof ApiError ? fieldFor[error.code] : undefined;
  const message = t(errorMessageKey(error));
  if (field) form.setError(field, { type: 'server', message });
  else form.setError('root.server', { type: 'server', message });
}
