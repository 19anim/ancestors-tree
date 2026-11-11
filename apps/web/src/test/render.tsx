import { QueryClient } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AppProviders } from '../app/providers';

export function renderWithProviders(ui: ReactElement): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<AppProviders queryClient={queryClient}>{ui}</AppProviders>);
}
