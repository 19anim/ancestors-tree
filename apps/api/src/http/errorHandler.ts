import type { ApiErrorBody } from '@ancestors-tree/shared';
import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import { NO_ERROR_REPORTER, type ErrorReporter } from '../monitoring/reporter.ts';
import { AppError } from './AppError.ts';
import { getLocals } from './locals.ts';

/** A client error raised by Express middleware in the http-errors style (e.g. body-parser). */
interface ClientHttpError {
  status: number;
  type: unknown;
}

/** Safe client-facing messages for body-parser error types; other exposed 4xx get a generic one. */
const CLIENT_ERROR_MESSAGES = new Map<unknown, string>([
  ['entity.parse.failed', 'Malformed JSON body'],
  ['entity.too.large', 'Request body too large'],
  ['charset.unsupported', 'Unsupported request body encoding'],
  ['encoding.unsupported', 'Unsupported request body encoding'],
]);

function asClientHttpError(err: unknown): ClientHttpError | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { expose, status, statusCode, type } = err as Record<string, unknown>;
  const code = typeof status === 'number' ? status : statusCode;
  if (expose !== true || typeof code !== 'number' || code < 400 || code > 499) return undefined;
  return { status: code, type };
}

function toAppError(
  err: unknown,
  logger: Logger,
  reportUnexpected: (error: unknown) => void,
): AppError {
  if (err instanceof AppError) return err;
  const clientError = asClientHttpError(err);
  if (clientError) {
    // Only status and type are logged: the original message and fields such as `body` may
    // echo the request payload.
    logger.warn(clientError, 'Rejected client request');
    return new AppError(
      'VALIDATION_ERROR',
      CLIENT_ERROR_MESSAGES.get(clientError.type) ?? 'Invalid request',
    );
  }
  logger.error({ err }, 'Unhandled error');
  // Only the unexpected: AppErrors and client errors have known codes (spec §13.1).
  reportUnexpected(err);
  return new AppError('INTERNAL_ERROR', 'Unexpected server error');
}

export function createErrorHandler(
  logger: Logger,
  reporter: ErrorReporter = NO_ERROR_REPORTER,
): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const appError = toAppError(err, logger, (error) => {
      reporter.captureException(error, { userId: getLocals(res).userId });
    });
    const body: ApiErrorBody = {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
        ...(appError.reason ? { reason: appError.reason } : {}),
      },
    };
    res.status(appError.status).json(body);
  };
}
