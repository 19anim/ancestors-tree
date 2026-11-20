import { scrubErrorEvent } from '@ancestors-tree/shared';
import * as Sentry from '@sentry/react';
import { shouldReport, type MonitoringClient, type SdkSettings } from './monitoring';

interface Frames {
  frames?: { filename?: string }[];
}

/** The parts of an event that hold stack frames. */
interface EventWithFrames {
  exception?: { values?: { stacktrace?: Frames }[] };
  stacktrace?: Frames;
}

/** Vite's built scripts: the only frame files whose path is worth keeping. */
function isScriptAsset(pathname: string): boolean {
  return pathname.startsWith('/assets/') && /\.m?js$/.test(pathname);
}

/**
 * A frame's file without its query or hash. A file that is not a script asset is most likely
 * the page itself (the SDK falls back to the page URL when an error event has no filename), and
 * a page path can hold a secret (/join/<token>, the reset-password #token=…): only its origin
 * stays.
 */
export function scrubFrameFilename(filename: string): string {
  const bare = filename.replace(/[?#][\s\S]*$/, '');
  let url: URL;
  try {
    url = new URL(bare);
  } catch {
    return bare; // `<anonymous>`, `native`, and other names that are not URLs
  }
  if (isScriptAsset(url.pathname)) return bare;
  return url.origin === 'null' ? `${url.protocol}//${url.host}` : url.origin;
}

function scrubFrames(stacktrace: Frames): Frames {
  if (stacktrace.frames === undefined) return stacktrace;
  return {
    ...stacktrace,
    frames: stacktrace.frames.map((frame) =>
      frame.filename === undefined
        ? frame
        : { ...frame, filename: scrubFrameFilename(frame.filename) },
    ),
  };
}

/** Applies scrubFrameFilename to every stack frame of the event. */
export function scrubEventFrames<E extends EventWithFrames>(event: E): E {
  const source: EventWithFrames = event;
  const scrubbed: EventWithFrames = { ...source };
  if (source.stacktrace !== undefined) scrubbed.stacktrace = scrubFrames(source.stacktrace);
  if (source.exception?.values !== undefined) {
    scrubbed.exception = {
      ...source.exception,
      values: source.exception.values.map((value) =>
        value.stacktrace === undefined
          ? value
          : { ...value, stacktrace: scrubFrames(value.stacktrace) },
      ),
    };
  }
  return scrubbed as E;
}

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
    // An unhandled rejection of an expected API error is not a bug either. The request (with the
    // page URL) is dropped by scrubErrorEvent; no integration in the list above writes a URL into
    // tags or contexts, so stack frames are the only other place a page URL can travel in.
    beforeSend: (event, hint) =>
      shouldReport(hint.originalException) ? scrubErrorEvent(scrubEventFrames(event)) : null,
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
