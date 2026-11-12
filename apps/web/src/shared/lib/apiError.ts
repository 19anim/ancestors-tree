import type { ErrorCode, ErrorDetail } from '@ancestors-tree/shared';

/** Codes produced by the client itself, never sent by the API. */
export const CLIENT_ONLY_ERROR_CODES = ['NETWORK_ERROR', 'INVALID_RESPONSE'] as const;

export type ClientErrorCode = ErrorCode | (typeof CLIENT_ONLY_ERROR_CODES)[number];

export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[] | undefined;

  constructor(code: ClientErrorCode, message: string, status: number, details?: ErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
};

/** For error bodies the client cannot read (an older client meeting a newer API code). */
export function errorCodeForStatus(status: number): ClientErrorCode {
  if (status >= 500) return 'INTERNAL_ERROR';
  return CODE_BY_STATUS[status] ?? 'INVALID_RESPONSE';
}

/** TanStack Query retry: client errors (4xx) never succeed on retry; others get one more try. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

/** Translation key for any thrown value; unknown errors fall back to INTERNAL_ERROR. */
export function errorMessageKey(error: unknown): `errors.${ClientErrorCode}` {
  return `errors.${error instanceof ApiError ? error.code : 'INTERNAL_ERROR'}`;
}
