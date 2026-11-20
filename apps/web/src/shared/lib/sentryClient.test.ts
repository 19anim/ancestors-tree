import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './apiError';
import { createSentryClient } from './sentryClient';

const sdk = vi.hoisted(() => {
  const integration = (name: string) => () => ({ name });
  return {
    init: vi.fn(),
    captureException: vi.fn(),
    setUser: vi.fn(),
    eventFiltersIntegration: integration('EventFilters'),
    functionToStringIntegration: integration('FunctionToString'),
    browserApiErrorsIntegration: integration('BrowserApiErrors'),
    globalHandlersIntegration: integration('GlobalHandlers'),
    linkedErrorsIntegration: integration('LinkedErrors'),
    dedupeIntegration: integration('Dedupe'),
  };
});

vi.mock('@sentry/react', () => sdk);

// Built at runtime: no DSN-shaped literal in the repository.
const SENTRY_HOST = 'sentry.example.test';
const SETTINGS = { dsn: `https://${SENTRY_HOST}/7`, release: 'abc123', environment: 'production' };

interface InitOptions {
  dsn: string;
  release: string;
  environment: string;
  defaultIntegrations: false;
  integrations: { name: string }[];
  tracesSampleRate?: number;
  dataCollection: unknown;
  beforeSend: (event: object, hint: { originalException?: unknown }) => object | null;
  beforeBreadcrumb: (breadcrumb: object) => object | null;
}

const initOptions = () => sdk.init.mock.calls[0]?.[0] as InitOptions;

afterEach(() => {
  vi.clearAllMocks();
});

describe('createSentryClient', () => {
  it('reports errors only: unhandled ones and what the app sends, no tracing, no breadcrumbs', () => {
    createSentryClient(SETTINGS);
    const options = initOptions();
    expect(options).toMatchObject({ ...SETTINGS, defaultIntegrations: false });
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.integrations.map((integration) => integration.name)).toEqual([
      'EventFilters',
      'FunctionToString',
      'BrowserApiErrors',
      'GlobalHandlers',
      'LinkedErrors',
      'Dedupe',
    ]);
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
    expect(options.beforeBreadcrumb({ category: 'fetch' })).toBeNull();
  });

  it('drops expected API errors and scrubs the rest', () => {
    createSentryClient(SETTINGS);
    const { beforeSend } = initOptions();
    expect(
      beforeSend({ message: 'x' }, { originalException: new ApiError('FORBIDDEN', 'No', 403) }),
    ).toBeNull();
    expect(
      beforeSend(
        {
          message: 'Failed for lan@example.test',
          request: { url: 'https://site.example.test/join/secret-token' },
          user: { id: 'u1', email: 'lan@example.test' },
        },
        { originalException: new TypeError('x is undefined') },
      ),
    ).toEqual({ message: 'Failed for [email]', user: { id: 'u1' } });
  });

  it('tags reports with their context and names the user by id only', () => {
    const client = createSentryClient(SETTINGS);
    const error = new Error('boom');
    client.captureException(error, { boundary: 'route' });
    client.captureException(error);
    client.setUserId('u1');
    client.setUserId(null);
    expect(sdk.captureException.mock.calls).toEqual([
      [error, { tags: { boundary: 'route' } }],
      [error, undefined],
    ]);
    expect(sdk.setUser.mock.calls).toEqual([[{ id: 'u1' }], [null]]);
  });
});
