import { ApiError } from './apiError';

/** Extra tags sent with a report, such as which error boundary caught it. */
export type ReportContext = Readonly<Record<string, string>>;

/** What the lazily loaded SDK offers the rest of the app. */
export interface MonitoringClient {
  captureException(error: unknown, context?: ReportContext): void;
  setUserId(id: string | null): void;
}

export interface MonitoringSettings {
  /** Production builds only (import.meta.env.PROD). */
  enabled: boolean;
  /** VITE_SENTRY_DSN; monitoring is off without it. */
  dsn: string | undefined;
  /** The commit (Netlify's COMMIT_REF at build time). */
  release: string;
  /** Netlify's deploy context (production, deploy-preview…). */
  environment: string;
}

export interface SdkSettings {
  dsn: string;
  release: string;
  environment: string;
}

export type LoadMonitoringClient = (settings: SdkSettings) => Promise<MonitoringClient>;

/** Reports kept until the SDK has loaded; any more in the first seconds are dropped. */
export const MAX_QUEUED_REPORTS = 20;

interface QueuedReport {
  error: unknown;
  context: ReportContext | undefined;
}

let sdkSettings: SdkSettings | null = null;
let client: MonitoringClient | null = null;
let queue: QueuedReport[] = [];
let userId: string | null = null;
let removeEarlyListeners: (() => void) | null = null;
let loading: Promise<void> | null = null;

/**
 * Expected failures are not bugs (spec §13.1): API errors carry a known code (4xx, offline, a
 * sleeping server), and the server reports its own 5xx. Only an answer the client cannot read
 * (INVALID_RESPONSE) points at a bug here.
 */
export function shouldReport(error: unknown): boolean {
  return !(error instanceof ApiError) || error.code === 'INVALID_RESPONSE';
}

/** Sends a caught error to Sentry; a no-op outside production or without a DSN. */
export function reportError(error: unknown, context?: ReportContext): void {
  if (sdkSettings === null || !shouldReport(error)) return;
  if (client !== null) client.captureException(error, context);
  else if (queue.length < MAX_QUEUED_REPORTS) queue.push({ error, context });
}

/** The signed-in user's id, the only user detail a report carries; null when signed out. */
export function identifyUser(id: string | null): void {
  userId = id;
  client?.setUserId(id);
}

function stopEarlyListeners(): void {
  removeEarlyListeners?.();
  removeEarlyListeners = null;
}

/**
 * Before the first render: decides whether monitoring is on, and catches unhandled errors and
 * rejections until the SDK, which has its own handlers, has loaded. Returns whether it is on.
 */
export function startMonitoring(settings: MonitoringSettings): boolean {
  if (!settings.enabled || !settings.dsn) return false;
  // Already on: a second pair of listeners would report every early error twice.
  if (sdkSettings !== null) return true;
  sdkSettings = { dsn: settings.dsn, release: settings.release, environment: settings.environment };
  const onError = (event: ErrorEvent) => reportError(event.error ?? new Error(event.message));
  const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  removeEarlyListeners = () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
  return true;
}

const loadSentryClient: LoadMonitoringClient = async (settings) => {
  // A separate chunk: the SDK never weighs on the first render.
  const { createSentryClient } = await import('./sentryClient');
  return createSentryClient(settings);
};

async function initClient(settings: SdkSettings, load: LoadMonitoringClient): Promise<void> {
  try {
    const loaded = await load(settings);
    if (sdkSettings !== settings) return; // reset by a test while loading
    stopEarlyListeners();
    client = loaded;
    loaded.setUserId(userId);
    for (const report of queue) loaded.captureException(report.error, report.context);
    queue = [];
  } catch (error) {
    if (sdkSettings !== settings) return;
    console.error(error);
    stopEarlyListeners();
    sdkSettings = null;
    queue = [];
  }
}

/**
 * Loads the SDK, then sends what was queued. A failed load turns monitoring off. Calls made while
 * it is loading share the same load, so the SDK is set up once.
 */
export function loadMonitoring(load: LoadMonitoringClient = loadSentryClient): Promise<void> {
  if (sdkSettings === null || client !== null) return Promise.resolve();
  loading ??= initClient(sdkSettings, load);
  return loading;
}

/** After the first render, when the browser is idle. */
export function loadMonitoringWhenIdle(): void {
  const start = () => void loadMonitoring();
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, { timeout: 5_000 });
  } else {
    window.setTimeout(start, 2_000);
  }
}

export function resetMonitoringForTests(): void {
  stopEarlyListeners();
  sdkSettings = null;
  client = null;
  loading = null;
  queue = [];
  userId = null;
}
