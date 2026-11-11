import { HealthResponseSchema } from '@ancestors-tree/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../shared/lib/apiClient';
import { errorMessageKey } from '../../shared/lib/apiError';

export function ServerStatus() {
  const { t } = useTranslation();
  const health = useQuery({
    queryKey: ['system', 'health'],
    queryFn: () => apiRequest('/health', HealthResponseSchema),
  });

  if (health.isPending) {
    return <p role="status">{t('system.serverStatus.checking')}</p>;
  }

  if (health.isError) {
    return (
      <div role="alert">
        <p>{t(errorMessageKey(health.error))}</p>
        <button type="button" onClick={() => void health.refetch()}>
          {t('system.serverStatus.retry')}
        </button>
      </div>
    );
  }

  return <p role="status">{t('system.serverStatus.ok', { version: health.data.version })}</p>;
}
