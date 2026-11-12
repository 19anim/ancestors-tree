import {
  AuthProvidersSchema,
  CurrentUserSchema,
  type CurrentUser,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
} from '@ancestors-tree/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '../../shared/lib/apiClient';
import { ApiError } from '../../shared/lib/apiError';

export const CURRENT_USER_KEY = ['me'] as const;

async function fetchCurrentUser(signal: AbortSignal): Promise<CurrentUser | null> {
  try {
    return await apiRequest('/me', CurrentUserSchema, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') return null;
    throw error;
  }
}

/** The signed-in user, or null when signed out. */
export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: ({ signal }) => fetchCurrentUser(signal),
    staleTime: 5 * 60_000,
  });
}

export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: ({ signal }) => apiRequest('/auth/providers', AuthProvidersSchema, { signal }),
    staleTime: Infinity,
  });
}

function useSignInMutation<Input>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) =>
      apiRequest(path, CurrentUserSchema, { method: 'POST', json: input }),
    onSuccess: (user) => {
      queryClient.setQueryData(CURRENT_USER_KEY, user);
    },
  });
}

export const useLogin = () => useSignInMutation<LoginRequest>('/auth/login');
export const useRegister = () => useSignInMutation<RegisterRequest>('/auth/register');
export const useResetPassword = () =>
  useSignInMutation<ResetPasswordRequest>('/auth/reset-password');

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordRequest) =>
      apiRequest('/auth/forgot-password', z.undefined(), { method: 'POST', json: input }),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest('/auth/logout', z.undefined(), { method: 'POST' }),
    onSettled: () => {
      // Nothing of the previous user may stay on screen.
      // Keep the mutation cache: this very mutation is still settling in it.
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== CURRENT_USER_KEY[0],
      });
      queryClient.setQueryData(CURRENT_USER_KEY, null);
    },
  });
}
