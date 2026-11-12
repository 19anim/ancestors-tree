import type { QueryClient } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProviders, createQueryClient } from '../app/providers';
import { routes } from '../app/routes';

function createTestQueryClient(): QueryClient {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });
  return queryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  queryClient: QueryClient = createTestQueryClient(),
): RenderResult {
  return render(<AppProviders queryClient={queryClient}>{ui}</AppProviders>);
}

/** Renders the real route table at `path`, inside the app providers. */
export function renderRoute(path: string, queryClient?: QueryClient): RenderResult {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return renderWithProviders(<RouterProvider router={router} />, queryClient);
}
