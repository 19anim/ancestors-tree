import { HealthResponseSchema } from '@ancestors-tree/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../shared/lib/apiClient';
import { errorMessageKey } from '../../shared/lib/apiError';
import { cn } from '../../shared/lib/cn';
import { Button } from '../../shared/ui';

type ServerState = 'checking' | 'error' | 'ok';

const DOT: Record<ServerState, string> = {
  checking: 'bg-line-strong',
  error: 'bg-stamp',
  ok: 'bg-success',
};

export function ServerStatus() {
  const { t } = useTranslation();
  const health = useQuery({
    queryKey: ['system', 'health'],
    queryFn: () => apiRequest('/health', HealthResponseSchema),
  });

  let state: ServerState = 'checking';
  let message = t('system.serverStatus.checking');
  if (health.isSuccess) {
    state = 'ok';
    message = t('system.serverStatus.ok', { version: health.data.version });
  } else if (health.isError && !health.isFetching) {
    state = 'error';
    message = t(errorMessageKey(health.error));
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', DOT[state])} />
      {/* One persistent live region: screen readers hear every change of state. */}
      <p role="status" aria-live="polite" data-state={state} className="text-ink-muted">
        {message}
      </p>
      {/* TanStack Query v5 resets a refetch of a query without data to pending, so isError is false while retrying. */}
      {!health.isSuccess && health.errorUpdateCount > 0 ? (
        // aria-disabled, not disabled: a disabled button would drop keyboard focus mid-retry.
        <Button
          variant="secondary"
          size="sm"
          aria-disabled={health.isFetching}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          onClick={() => {
            if (!health.isFetching) void health.refetch();
          }}
        >
          {t('system.serverStatus.retry')}
        </Button>
      ) : null}
    </div>
  );
}
