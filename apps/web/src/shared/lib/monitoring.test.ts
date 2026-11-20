import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './apiError';
import {
  identifyUser,
  loadMonitoring,
  MAX_QUEUED_REPORTS,
  reportError,
  resetMonitoringForTests,
  shouldReport,
  startMonitoring,
  type MonitoringClient,
} from './monitoring';

// Built at runtime: no DSN-shaped literal in the repository.
const SENTRY_HOST = 'sentry.example.test';
const ON = {
  enabled: true,
  dsn: `https://${SENTRY_HOST}/7`,
  release: 'abc123',
  environment: 'production',
};

function fakeClient() {
  const client = { captureException: vi.fn(), setUserId: vi.fn() } satisfies MonitoringClient;
  return { client, load: vi.fn(async () => client) };
}

afterEach(() => {
  resetMonitoringForTests();
  vi.restoreAllMocks();
});

describe('shouldReport', () => {
  it('skips expected API errors, and reports bugs and unreadable answers', () => {
    expect(shouldReport(new ApiError('FORBIDDEN', 'No', 403))).toBe(false);
    expect(shouldReport(new ApiError('NETWORK_ERROR', 'Offline', 0))).toBe(false);
    expect(shouldReport(new ApiError('INTERNAL_ERROR', 'Gateway', 502))).toBe(false);
    expect(shouldReport(new ApiError('INVALID_RESPONSE', 'Bad shape', 200))).toBe(true);
    expect(shouldReport(new TypeError('x is undefined'))).toBe(true);
  });
});

describe('monitoring', () => {
  it('is off outside production or without a DSN, and never loads the SDK', async () => {
    const { client, load } = fakeClient();
    expect(startMonitoring({ ...ON, enabled: false })).toBe(false);
    expect(startMonitoring({ ...ON, dsn: undefined })).toBe(false);
    expect(startMonitoring({ ...ON, dsn: '' })).toBe(false);
    reportError(new Error('boom'));
    await loadMonitoring(load);
    expect(load).not.toHaveBeenCalled();
    expect(client.captureException).not.toHaveBeenCalled();
  });

  it('queues reports until the SDK has loaded, then sends them in order with the user id', async () => {
    const { client, load } = fakeClient();
    expect(startMonitoring(ON)).toBe(true);
    const first = new Error('first');
    reportError(first, { boundary: 'app' });
    reportError(new ApiError('FORBIDDEN', 'No', 403));
    identifyUser('u1');

    await loadMonitoring(load);
    expect(load).toHaveBeenCalledWith({
      dsn: ON.dsn,
      release: 'abc123',
      environment: 'production',
    });
    expect(client.setUserId).toHaveBeenCalledWith('u1');
    expect(client.captureException.mock.calls).toEqual([[first, { boundary: 'app' }]]);

    const second = new Error('second');
    reportError(second);
    identifyUser(null);
    expect(client.captureException).toHaveBeenLastCalledWith(second, undefined);
    expect(client.setUserId).toHaveBeenLastCalledWith(null);
  });

  it(`keeps at most ${MAX_QUEUED_REPORTS} reports before the SDK loads`, async () => {
    const { client, load } = fakeClient();
    startMonitoring(ON);
    for (let index = 0; index < MAX_QUEUED_REPORTS + 5; index += 1)
      reportError(new Error(`e${index}`));
    await loadMonitoring(load);
    expect(client.captureException).toHaveBeenCalledTimes(MAX_QUEUED_REPORTS);
  });

  it('catches unhandled errors before the SDK loads, and leaves them to the SDK after', async () => {
    const { client, load } = fakeClient();
    startMonitoring(ON);
    const early = new Error('early');
    window.dispatchEvent(new ErrorEvent('error', { error: early }));
    await loadMonitoring(load);
    expect(client.captureException.mock.calls).toEqual([[early, undefined]]);

    // Stands in for the SDK's own handler; without any listener the test runner would see an
    // uncaught error.
    const sdkHandler = vi.fn();
    window.addEventListener('error', sdkHandler);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('late') }));
    window.removeEventListener('error', sdkHandler);
    expect(sdkHandler).toHaveBeenCalledTimes(1);
    expect(client.captureException).toHaveBeenCalledTimes(1);
  });

  it('turns itself off when the SDK chunk fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    startMonitoring(ON);
    await loadMonitoring(async () => {
      throw new Error('chunk failed');
    });
    const { client, load } = fakeClient();
    reportError(new Error('after'));
    await loadMonitoring(load);
    expect(load).not.toHaveBeenCalled();
    expect(client.captureException).not.toHaveBeenCalled();
  });
});
