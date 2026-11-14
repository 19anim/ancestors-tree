import type { ErrorCode, ErrorDetail } from '@ancestors-tree/shared';
import type { OpErrorCode } from '@ancestors-tree/shared/tree';

/** Codes produced by the client itself, never sent by the API. */
export const CLIENT_ONLY_ERROR_CODES = ['NETWORK_ERROR', 'INVALID_RESPONSE'] as const;

export type ClientErrorCode = ErrorCode | (typeof CLIENT_ONLY_ERROR_CODES)[number];

export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[] | undefined;
  /** Only with RULE_VIOLATION: the rule applyOp refused (translated as `tree.rules.<reason>`). */
  readonly reason: OpErrorCode | undefined;

  constructor(
    code: ClientErrorCode,
    message: string,
    status: number,
    details?: ErrorDetail[],
    reason?: OpErrorCode,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.reason = reason;
  }
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  // A newer API may send a reason this client does not know; the status still tells the store
  // whether to reload (409) or roll back (422).
  409: 'VERSION_CONFLICT',
  422: 'RULE_VIOLATION',
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
