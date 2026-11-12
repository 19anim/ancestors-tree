import {
  AcceptInviteResponseSchema,
  ClanListSchema,
  ClanSchema,
  InviteListSchema,
  InvitePreviewSchema,
  InviteSchema,
  MemberListSchema,
  MemberSchema,
  type CreateClanRequest,
  type InviteRole,
  type UpdateClanRequest,
} from '@ancestors-tree/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '../../shared/lib/apiClient';

export const clanKeys = {
  all: ['clans'] as const,
  detail: (id: string) => ['clans', id] as const,
  members: (id: string) => ['clans', id, 'members'] as const,
  invites: (id: string) => ['clans', id, 'invites'] as const,
  invite: (token: string) => ['invite', token] as const,
};

export function useClans() {
  return useQuery({
    queryKey: clanKeys.all,
    queryFn: ({ signal }) => apiRequest('/clans', ClanListSchema, { signal }),
  });
}

export function useClan(id: string) {
  return useQuery({
    queryKey: clanKeys.detail(id),
    queryFn: ({ signal }) => apiRequest(`/clans/${id}`, ClanSchema, { signal }),
  });
}

export function useCreateClan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClanRequest) =>
      apiRequest('/clans', ClanSchema, { method: 'POST', json: input }),
    onSuccess: (clan) => {
      queryClient.setQueryData(clanKeys.detail(clan.id), clan);
      void queryClient.invalidateQueries({ queryKey: clanKeys.all, exact: true });
    },
  });
}

export function useUpdateClan(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateClanRequest) =>
      apiRequest(`/clans/${id}`, ClanSchema, { method: 'PATCH', json: input }),
    onSuccess: (clan) => {
      queryClient.setQueryData(clanKeys.detail(id), clan);
      void queryClient.invalidateQueries({ queryKey: clanKeys.all, exact: true });
    },
  });
}

export function useMembers(id: string) {
  return useQuery({
    queryKey: clanKeys.members(id),
    queryFn: ({ signal }) => apiRequest(`/clans/${id}/members`, MemberListSchema, { signal }),
  });
}

export function useChangeRole(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: InviteRole }) =>
      apiRequest(`/clans/${id}/members/${userId}`, MemberSchema, {
        method: 'PATCH',
        json: { role },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clanKeys.members(id) }),
  });
}

export function useRemoveMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiRequest(`/clans/${id}/members/${userId}`, z.undefined(), { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clanKeys.all }),
  });
}

export function useInvites(id: string, enabled: boolean) {
  return useQuery({
    queryKey: clanKeys.invites(id),
    queryFn: ({ signal }) => apiRequest(`/clans/${id}/invites`, InviteListSchema, { signal }),
    enabled,
  });
}

export function useCreateInvite(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: InviteRole) =>
      apiRequest(`/clans/${id}/invites`, InviteSchema, { method: 'POST', json: { role } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clanKeys.invites(id) }),
  });
}

export function useRevokeInvite(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      apiRequest(`/clans/${id}/invites/${inviteId}`, z.undefined(), { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clanKeys.invites(id) }),
  });
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: clanKeys.invite(token),
    queryFn: ({ signal }) =>
      apiRequest(`/invites/${encodeURIComponent(token)}`, InvitePreviewSchema, { signal }),
  });
}

export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest(`/invites/${encodeURIComponent(token)}/accept`, AcceptInviteResponseSchema, {
        method: 'POST',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clanKeys.all }),
  });
}
