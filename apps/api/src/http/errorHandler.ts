import type { ApiErrorBody } from '@ancestors-tree/shared';
import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import { AppError } from './AppError.ts';

function isMalformedJsonError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type: unknown }).type === 'entity.parse.failed'
  );
}

function toAppError(err: unknown, logger: Logger): AppError {
  if (err instanceof AppError) return err;
  if (isMalformedJsonError(err)) return new AppError('VALIDATION_ERROR', 'Malformed JSON body');
  logger.error({ err }, 'Unhandled error');
  return new AppError('INTERNAL_ERROR', 'Unexpected server error');
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const appError = toAppError(err, logger);
    const body: ApiErrorBody = {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
      },
    };
    res.status(appError.status).json(body);
  };
}
