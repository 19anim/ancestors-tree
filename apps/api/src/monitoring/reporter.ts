/** Where unexpected server errors go: Sentry in production with a DSN, nowhere otherwise. */
export interface ErrorReporter {
  /** `userId`: the signed-in user, if any. It is the only user detail ever sent (spec §13.1). */
  captureException(error: unknown, context: { userId?: string }): void;
}

export const NO_ERROR_REPORTER: ErrorReporter = { captureException: () => undefined };
