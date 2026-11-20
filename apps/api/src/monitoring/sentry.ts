import { scrubErrorEvent } from '@ancestors-tree/shared';
import type * as SentryNode from '@sentry/node';
import type { ErrorReporter } from './reporter.ts';

/** The part of @sentry/node this module uses; tests pass a fake, so they never load the SDK. */
export type SentryNodeApi = Pick<
  typeof SentryNode,
  | 'init'
  | 'captureException'
  | 'eventFiltersIntegration'
  | 'functionToStringIntegration'
  | 'linkedErrorsIntegration'
  | 'dedupeIntegration'
  | 'onUncaughtExceptionIntegration'
  | 'onUnhandledRejectionIntegration'
  | 'contextLinesIntegration'
  | 'nodeContextIntegration'
>;

export interface SentrySettings {
  /** SENTRY_DSN of the Node project. */
  dsn: string;
  /** releaseOf(config): the commit Render deployed. */
  release: string;
}

/**
 * Errors only, and no personal data (spec §13.1). `tracesSampleRate` stays unset (no tracing,
 * so the free quota goes to errors). The default integrations are off: no HTTP or console
 * breadcrumbs, no request data, no local variables. Express is not instrumented
 * (`enableRuntimeChannelInjection: false`): the error handler reports explicitly.
 */
export function sentryOptions(
  settings: SentrySettings,
  sdk: SentryNodeApi,
): SentryNode.NodeOptions {
  return {
    dsn: settings.dsn,
    release: settings.release,
    environment: 'production',
    defaultIntegrations: false,
    integrations: [
      sdk.eventFiltersIntegration(),
      sdk.functionToStringIntegration(),
      sdk.linkedErrorsIntegration(),
      sdk.dedupeIntegration(),
      sdk.onUncaughtExceptionIntegration(),
      sdk.onUnhandledRejectionIntegration(),
      sdk.contextLinesIntegration(),
      sdk.nodeContextIntegration(),
    ],
    enableRuntimeChannelInjection: false,
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
    beforeSend: (event) => scrubErrorEvent(event),
    beforeBreadcrumb: () => null,
  };
}

/**
 * Loads the SDK on demand (production with a DSN only), starts it and returns the reporter the
 * error handler calls.
 */
export async function createSentryReporter(
  settings: SentrySettings,
  load: () => Promise<SentryNodeApi> = () => import('@sentry/node'),
): Promise<ErrorReporter> {
  const sdk = await load();
  sdk.init(sentryOptions(settings, sdk));
  return {
    captureException(error, { userId }) {
      sdk.captureException(error, userId === undefined ? undefined : { user: { id: userId } });
    },
  };
}
