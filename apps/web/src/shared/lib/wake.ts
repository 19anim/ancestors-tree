import { create } from 'zustand';
import { ApiError } from './apiError';

/** A request still waiting after this long makes one quick health check (spec §13.1). */
export const SLOW_REQUEST_MS = 4_000;
/** The quick check, and each check of the wake-up screen, gives up after this long. */
export const HEALTH_TIMEOUT_MS = 3_000;
/** How often the wake-up screen checks the server. */
export const POLL_INTERVAL_MS = 3_000;
/** After this long the wake-up screen says the server did not wake up. */
export const GIVE_UP_MS = 2 * 60_000;
/**
 * Once the server answers, the wake-up screen waits at most this long for the app's refetch
 * before it closes: apiClient has no request timeout, so a refetch could hang for good.
 */
export const AWAKE_REFETCH_WAIT_MS = 10_000;

const GATEWAY_STATUSES = new Set([502, 503, 504]);

export type WakePhase = 'awake' | 'waking' | 'failed';

export interface WakeState {
  phase: WakePhase;
  /** Counts the server's returns after the wake-up screen; loaders outside TanStack Query watch it. */
  recoveries: number;
}

export const useWakeStore = create<WakeState>()(() => ({ phase: 'awake', recoveries: 0 }));

/** The API's own error body `{ error: { code } }`, even with a code this client does not know. */
export function hasApiErrorBody(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  const error = (payload as { error?: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

/**
 * Whether a failed request means the server may be asleep (spec §13.1): a gateway error (502,
 * 503 or 504) whose body is not the API's own, or no answer at all (status 0) while the
 * browser is online. Offline, the pending queue keeps the edits; it is not a sleeping server.
 */
export function isWakeSignal(status: number, payload: unknown, online: boolean): boolean {
  return isWakeAnswer(status, hasApiErrorBody(payload), online);
}

/**
 * Whether a thrown error was a wake signal (the rule of isWakeSignal), for a loader outside
 * TanStack Query that tries again after a recovery. A refusal (403, 404) or the API's own error
 * is left alone. Online is assumed: the server has just answered.
 */
export function isWakeError(error: unknown): boolean {
  return error instanceof ApiError && isWakeAnswer(error.status, error.fromApiBody, true);
}

function isWakeAnswer(status: number, fromApiBody: boolean, online: boolean): boolean {
  if (status === 0) return online;
  return GATEWAY_STATUSES.has(status) && !fromApiBody;
}

export function startWaking(): void {
  if (useWakeStore.getState().phase === 'awake') useWakeStore.setState({ phase: 'waking' });
}

export function wakeFailed(): void {
  if (useWakeStore.getState().phase === 'waking') useWakeStore.setState({ phase: 'failed' });
}

export function retryWaking(): void {
  if (useWakeStore.getState().phase === 'failed') useWakeStore.setState({ phase: 'waking' });
}

export function serverAwake(): void {
  useWakeStore.setState((state) => ({ phase: 'awake', recoveries: state.recoveries + 1 }));
}

/** apiRequest calls it for every failed request: status 0 when nothing answered. */
export function noteFailedRequest(status: number, payload: unknown): void {
  if (isWakeSignal(status, payload, navigator.onLine)) startWaking();
}

/**
 * One GET /api/health with its own timeout; true when the server answers 2xx. It calls fetch
 * directly, never apiRequest, so it can never feed the detection it serves.
 */
export async function checkHealth(timeoutMs = HEALTH_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/health', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** One quick check at a time, however many requests are slow together. */
let probing = false;

/**
 * apiRequest calls it as a request starts, and the returned function as it ends. A request
 * still waiting after SLOW_REQUEST_MS makes one health check; only a check that fails or times
 * out shows the wake-up screen, so a slow request on an awake server never does.
 */
export function watchSlowRequest(): () => void {
  const timer = setTimeout(() => {
    if (probing || useWakeStore.getState().phase !== 'awake') return;
    probing = true;
    void checkHealth().then((ok) => {
      probing = false;
      // An offline browser is not a sleeping server: the pending queue handles that.
      if (!ok && navigator.onLine) startWaking();
    });
  }, SLOW_REQUEST_MS);
  return () => clearTimeout(timer);
}

export interface WakeCycleOptions {
  check: () => Promise<boolean>;
  /** The server answered: refetch, then leave the screen. */
  onAwake: () => Promise<void>;
  /** GIVE_UP_MS passed without an answer. */
  onGiveUp: () => void;
}

/**
 * The wake-up screen's loop: a check at once, then every POLL_INTERVAL_MS (never two at a time),
 * until one succeeds or GIVE_UP_MS passes. Returns the cleanup.
 */
export function runWakeCycle({ check, onAwake, onGiveUp }: WakeCycleOptions): () => void {
  let stopped = false;
  let checking = false;
  const stop = () => {
    stopped = true;
    clearInterval(interval);
    clearTimeout(giveUp);
  };
  const tick = async () => {
    if (stopped || checking) return;
    checking = true;
    const ok = await check();
    checking = false;
    if (stopped || !ok) return;
    stop();
    await onAwake();
  };
  const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
  const giveUp = setTimeout(() => {
    stop();
    onGiveUp();
  }, GIVE_UP_MS);
  void tick();
  return stop;
}

export function resetWakeForTests(): void {
  useWakeStore.setState({ phase: 'awake', recoveries: 0 });
  probing = false;
}
