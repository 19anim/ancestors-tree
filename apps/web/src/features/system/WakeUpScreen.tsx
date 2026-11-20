import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../../shared/lib/cn';
import {
  AWAKE_REFETCH_WAIT_MS,
  checkHealth,
  retryWaking,
  runWakeCycle,
  serverAwake,
  useWakeStore,
  wakeFailed,
  type WakePhase,
} from '../../shared/lib/wake';
import { Button, inertPage, tapeColor } from '../../shared/ui';

/**
 * The full-page "Waking up the server…" screen (spec §13.1). Mounted once, beside the router;
 * portalled to <body> so it covers dialogs too.
 */
export function WakeUpScreen() {
  const phase = useWakeStore((state) => state.phase);
  if (phase === 'awake') return null;
  return createPortal(<WakeUpPanel phase={phase} />, document.body);
}

function WakeUpPanel({ phase }: { phase: Exclude<WakePhase, 'awake'> }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const headingId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The app stays mounted underneath, inert, so drafts and pending changes are kept. Focus
  // moves to the heading and goes back where it was afterwards.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const undo = inertPage(root);
    headingRef.current?.focus();
    return () => {
      undo();
      if (previous?.isConnected && previous.closest('[inert]') === null) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'waking') return;
    return runWakeCycle({
      check: () => checkHealth(),
      onAwake: async () => {
        // Refetch before leaving: RequireAuth waits while the phase is not "awake". But not for
        // good: apiClient has no request timeout, and a hung refetch would keep the screen up.
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          queryClient.invalidateQueries(),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, AWAKE_REFETCH_WAIT_MS);
          }),
        ]);
        clearTimeout(timer);
        serverAwake();
      },
      onGiveUp: wakeFailed,
    });
  }, [phase, queryClient]);

  const failed = phase === 'failed';
  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      // pointer-events-auto: a Radix modal underneath sets pointer-events: none on <body>.
      className="board-grid pointer-events-auto fixed inset-0 z-60 flex items-center justify-center overflow-y-auto p-6"
    >
      <div className="relative w-full max-w-md rounded-photo border border-line bg-surface px-6 pt-9 pb-6 text-ink">
        <span
          aria-hidden="true"
          className="absolute -top-3 left-1/2 h-6 w-28 -translate-x-1/2 -rotate-2 opacity-90"
          style={{ backgroundColor: tapeColor('progenitor') }}
        />
        <h1
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="text-2xl font-bold focus:outline-none"
        >
          {t(failed ? 'system.wakeUp.failedTitle' : 'system.wakeUp.title')}
        </h1>
        <p className="mt-3 text-ink-muted">{t('system.wakeUp.body')}</p>
        <div className="mt-5 flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn('size-2 shrink-0 rounded-full', failed ? 'bg-stamp' : 'bg-line-strong')}
          />
          {/* One persistent live region: the change to "did not wake up" is announced. */}
          <p role="status" aria-live="polite" className="text-sm text-ink-muted">
            {t(failed ? 'system.wakeUp.failed' : 'system.wakeUp.waiting')}
          </p>
        </div>
        {failed ? (
          <Button
            className="mt-5"
            onClick={() => {
              retryWaking();
              headingRef.current?.focus();
            }}
          >
            {t('system.wakeUp.retry')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
