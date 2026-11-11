import { ERROR_CODES, type ErrorCode, type ErrorDetail } from '@ancestors-tree/shared';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[] | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.details = details;
  }
}

export function zodIssuesToDetails(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
  prefix: string,
): ErrorDetail[] {
  return issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
}
