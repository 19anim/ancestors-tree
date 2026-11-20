import { scrubErrorEvent } from '@ancestors-tree/shared';
import * as Sentry from '@sentry/react';
import { shouldReport, type MonitoringClient, type SdkSettings } from './monitoring';

/**
 * Loaded on demand by monitoring.ts after the first render, so the SDK stays out of the main
 * bundle. Errors only (spec §13.1): tracesSampleRate stays unset (no tracing), and the default
 * integrations are off (no sessions, no breadcrumbs with URLs or console text, no request
 * context). Every event is scrubbed of personal data.
 */
export function createSentryClient(settings: SdkSettings): MonitoringClient {
  Sentry.init({
    dsn: settings.dsn,
    release: settings.release,
    environment: settings.environment,
    defaultIntegrations: false,
    integrations: [
      Sentry.eventFiltersIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.browserApiErrorsIntegration(),
      Sentry.globalHandlersIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
    ],
    // SDK 11's replacement for sendDefaultPii: false.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
    },
    // An unhandled rejection of an expected API error is not a bug either.
    beforeSend: (event, hint) =>
      shouldReport(hint.originalException) ? scrubErrorEvent(event) : null,
    beforeBreadcrumb: () => null,
  });
  return {
    captureException: (error, context) => {
      Sentry.captureException(error, context === undefined ? undefined : { tags: context });
    },
    setUserId: (id) => {
      Sentry.setUser(id === null ? null : { id });
    },
  };
}
