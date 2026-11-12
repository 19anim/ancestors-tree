import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { CURRENT_USER_KEY } from '../features/auth';
import { ApiError, shouldRetryQuery } from '../shared/lib/apiError';
import { ThemeProvider } from '../shared/ui';

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        // The silent refresh already failed: the session is over.
        if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
          client.setQueryData(CURRENT_USER_KEY, null);
        }
      },
    }),
    defaultOptions: {
      queries: { retry: shouldRetryQuery, staleTime: 30_000, refetchOnWindowFocus: false },
    },
  });
  return client;
}

interface AppProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

export function AppProviders({ children, queryClient }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
