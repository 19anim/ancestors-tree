import type { ErrorEvent, NodeOptions } from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';
import { createSentryReporter, sentryOptions, type SentryNodeApi } from './sentry.ts';

// Built at runtime: no DSN-shaped literal in the repository.
const SENTRY_HOST = 'sentry.example.test';
const DSN = `https://${SENTRY_HOST}/42`;

/** A stand-in for @sentry/node: the tests never load the real SDK. */
function fakeSdk() {
  const integration = (name: string) => () => ({ name });
  return {
    init: vi.fn(),
    captureException: vi.fn(),
    eventFiltersIntegration: integration('EventFilters'),
    functionToStringIntegration: integration('FunctionToString'),
    linkedErrorsIntegration: integration('LinkedErrors'),
    dedupeIntegration: integration('Dedupe'),
    onUncaughtExceptionIntegration: integration('OnUncaughtException'),
    onUnhandledRejectionIntegration: integration('OnUnhandledRejection'),
    contextLinesIntegration: integration('ContextLines'),
    nodeContextIntegration: integration('Context'),
  };
}

const asApi = (sdk: ReturnType<typeof fakeSdk>) => sdk as unknown as SentryNodeApi;

describe('sentryOptions', () => {
  const options = sentryOptions({ dsn: DSN, release: 'abc123' }, asApi(fakeSdk()));

  it('reports errors only: no default integrations, no tracing', () => {
    expect(options).toMatchObject({
      dsn: DSN,
      release: 'abc123',
      environment: 'production',
      defaultIntegrations: false,
      enableRuntimeChannelInjection: false,
    });
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.tracesSampler).toBeUndefined();
    const integrations = options.integrations as { name: string }[];
    expect(integrations.map((integration) => integration.name)).toEqual([
      'EventFilters',
      'FunctionToString',
      'LinkedErrors',
      'Dedupe',
      'OnUncaughtException',
      'OnUnhandledRejection',
      'ContextLines',
      'Context',
    ]);
  });

  it('collects no personal data, and scrubs every event before it is sent', () => {
    expect(options.dataCollection).toEqual({
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
    });
    const event = {
      type: undefined,
      message: 'Duplicate key lan@example.test',
      request: { url: '/api/clans?x=1', cookies: { at: 'x' }, headers: { cookie: 'x' } },
      user: { id: 'u1', email: 'lan@example.test', ip_address: '203.0.113.7' },
      breadcrumbs: [{ message: 'x' }],
    } as ErrorEvent;
    expect(options.beforeSend?.(event, {})).toEqual({
      message: 'Duplicate key [email]',
      user: { id: 'u1' },
    });
    expect(options.beforeBreadcrumb?.({ message: 'x' })).toBeNull();
  });
});

describe('createSentryReporter', () => {
  it('starts the SDK once, and names the user by id only', async () => {
    const sdk = fakeSdk();
    const reporter = await createSentryReporter({ dsn: DSN, release: 'abc123' }, async () =>
      asApi(sdk),
    );
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect((sdk.init.mock.calls[0]?.[0] as NodeOptions).dsn).toBe(DSN);

    const error = new Error('boom');
    reporter.captureException(error, { userId: 'u1' });
    reporter.captureException(error, {});
    expect(sdk.captureException.mock.calls).toEqual([
      [error, { user: { id: 'u1' } }],
      [error, undefined],
    ]);
  });
});
