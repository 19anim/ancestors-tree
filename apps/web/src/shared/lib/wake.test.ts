import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkHealth,
  GIVE_UP_MS,
  HEALTH_TIMEOUT_MS,
  isWakeSignal,
  noteFailedRequest,
  POLL_INTERVAL_MS,
  retryWaking,
  runWakeCycle,
  serverAwake,
  SLOW_REQUEST_MS,
  startWaking,
  useWakeStore,
  wakeFailed,
  watchSlowRequest,
} from './wake';

const phase = () => useWakeStore.getState().phase;

/** A fetch that never answers until its signal aborts, like a proxy waiting on a cold start. */
function hangingFetch() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isWakeSignal', () => {
  it("is a gateway error without the API's body, or a network error while online", () => {
    for (const status of [502, 503, 504]) {
      expect(isWakeSignal(status, '<html>Bad gateway</html>', true), String(status)).toBe(true);
      expect(isWakeSignal(status, undefined, true), String(status)).toBe(true);
    }
    expect(isWakeSignal(0, undefined, true)).toBe(true);
  });

  it("is not the API's own error, another status, or a network error while offline", () => {
    const apiBody = { error: { code: 'PHOTOS_NOT_CONFIGURED', message: 'No photos' } };
    expect(isWakeSignal(503, apiBody, true)).toBe(false);
    // A code this client does not know is still the API answering.
    expect(isWakeSignal(502, { error: { code: 'BRAND_NEW', message: 'x' } }, true)).toBe(false);
    expect(isWakeSignal(500, '<html>Error</html>', true)).toBe(false);
    expect(isWakeSignal(404, undefined, true)).toBe(false);
    expect(isWakeSignal(0, undefined, false)).toBe(false);
  });
});

describe('the wake phases', () => {
  it('goes awake → waking → failed → waking → awake, counting recoveries', () => {
    startWaking();
    expect(phase()).toBe('waking');
    wakeFailed();
    expect(phase()).toBe('failed');
    // Another failed request does not restart a cycle that gave up.
    startWaking();
    expect(phase()).toBe('failed');
    retryWaking();
    expect(phase()).toBe('waking');
    serverAwake();
    expect(useWakeStore.getState()).toEqual({ phase: 'awake', recoveries: 1 });
  });

  it('notes a failed request with the browser online state', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    noteFailedRequest(0, undefined);
    expect(phase()).toBe('awake');
    noteFailedRequest(502, '<html>Bad gateway</html>');
    expect(phase()).toBe('waking');
  });
});

describe('checkHealth', () => {
  it('is true for a 2xx answer, and false for an error, no answer or a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    await expect(checkHealth()).resolves.toBe(true);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad gateway', { status: 502 })),
    );
    await expect(checkHealth()).resolves.toBe(false);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(checkHealth()).resolves.toBe(false);

    vi.useFakeTimers();
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);
    const result = checkHealth();
    await vi.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS);
    await expect(result).resolves.toBe(false);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/health');
  });
});

describe('watchSlowRequest', () => {
  it('makes one health check for requests still waiting after 4 s, and wakes when it fails', async () => {
    vi.useFakeTimers();
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);
    const stopFirst = watchSlowRequest();
    const stopSecond = watchSlowRequest();

    await vi.advanceTimersByTimeAsync(SLOW_REQUEST_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(phase()).toBe('awake');

    await vi.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS);
    expect(phase()).toBe('waking');
    stopFirst();
    stopSecond();
  });

  it('stays awake when the health check answers: a slow request on an awake server', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    const stop = watchSlowRequest();
    await vi.advanceTimersByTimeAsync(SLOW_REQUEST_MS + HEALTH_TIMEOUT_MS);
    expect(phase()).toBe('awake');
    stop();
  });

  it('does nothing for a request that ends within 4 s, or while the screen already shows', async () => {
    vi.useFakeTimers();
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);
    const stop = watchSlowRequest();
    await vi.advanceTimersByTimeAsync(SLOW_REQUEST_MS - 1);
    stop();
    await vi.advanceTimersByTimeAsync(SLOW_REQUEST_MS);
    expect(fetchMock).not.toHaveBeenCalled();

    startWaking();
    const stopWhileWaking = watchSlowRequest();
    await vi.advanceTimersByTimeAsync(SLOW_REQUEST_MS);
    expect(fetchMock).not.toHaveBeenCalled();
    stopWhileWaking();
  });
});

describe('runWakeCycle', () => {
  it('checks at once and every 3 s, one check at a time, until the server answers', async () => {
    vi.useFakeTimers();
    const answers: ((ok: boolean) => void)[] = [];
    const check = vi.fn(() => new Promise<boolean>((resolve) => answers.push(resolve)));
    const onAwake = vi.fn(async () => undefined);
    const onGiveUp = vi.fn();
    runWakeCycle({ check, onAwake, onGiveUp });
    expect(check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    // The first check is still waiting: no second one on top of it.
    expect(check).toHaveBeenCalledTimes(1);
    answers[0]?.(false);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);

    answers[1]?.(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(onAwake).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(GIVE_UP_MS);
    expect(check).toHaveBeenCalledTimes(2);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('gives up after 2 minutes and stops checking', async () => {
    vi.useFakeTimers();
    const check = vi.fn(async () => false);
    const onGiveUp = vi.fn();
    runWakeCycle({ check, onAwake: vi.fn(async () => undefined), onGiveUp });

    await vi.advanceTimersByTimeAsync(GIVE_UP_MS - 1);
    expect(onGiveUp).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    const checks = check.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    expect(check).toHaveBeenCalledTimes(checks);
  });

  it('stops for good when its cleanup runs', async () => {
    vi.useFakeTimers();
    const check = vi.fn(async () => false);
    const onGiveUp = vi.fn();
    const stop = runWakeCycle({ check, onAwake: vi.fn(async () => undefined), onGiveUp });
    stop();
    await vi.advanceTimersByTimeAsync(GIVE_UP_MS);
    expect(check).toHaveBeenCalledTimes(1);
    expect(onGiveUp).not.toHaveBeenCalled();
  });
});
