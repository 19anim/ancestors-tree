import type { CurrentUser } from '@ancestors-tree/shared';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { clearUserData, CURRENT_USER_KEY } from '../features/auth';
import { ApiError, shouldRetryQuery } from '../shared/lib/apiError';
import { identifyUser } from '../shared/lib/monitoring';
import { ThemeProvider } from '../shared/ui';

export function createQueryClient(): QueryClient {
  // The silent refresh already failed: the session is over, and nothing of that user may stay.
  const endSession = (error: unknown) => {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
      identifyUser(null);
      clearUserData(client);
      client.setQueryData(CURRENT_USER_KEY, null);
    }
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: endSession,
      onSuccess: (data, query) => {
        if (query.queryKey[0] !== CURRENT_USER_KEY[0]) return;
        // Error reports name the user by id only (spec §13.1).
        identifyUser((data as CurrentUser | null)?.id ?? null);
        // `/me` answers "signed out" as null data rather than an error.
        if (data === null) clearUserData(client);
      },
    }),
    mutationCache: new MutationCache({ onError: endSession }),
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
