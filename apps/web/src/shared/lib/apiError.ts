import type { ErrorCode } from '@ancestors-tree/shared';

/** Codes produced by the client itself, never sent by the API. */
export const CLIENT_ONLY_ERROR_CODES = ['NETWORK_ERROR', 'INVALID_RESPONSE'] as const;

export type ClientErrorCode = ErrorCode | (typeof CLIENT_ONLY_ERROR_CODES)[number];

export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;

  constructor(code: ClientErrorCode, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** Translation key for any thrown value; unknown errors fall back to INTERNAL_ERROR. */
export function errorMessageKey(error: unknown): `errors.${ClientErrorCode}` {
  return `errors.${error instanceof ApiError ? error.code : 'INTERNAL_ERROR'}`;
}
