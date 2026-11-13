import { ERROR_CODES, type ErrorCode, type ErrorDetail } from '@ancestors-tree/shared';
import type { OpErrorCode } from '@ancestors-tree/shared/tree';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[] | undefined;
  /** Only with RULE_VIOLATION: the rule applyOp refused. */
  readonly reason: OpErrorCode | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[], reason?: OpErrorCode) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.details = details;
    this.reason = reason;
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
