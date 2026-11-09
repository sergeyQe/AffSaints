import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import type { Role, User } from './types';

export interface UserCreateBody {
  login: string;
  full_name: string;
  password: string;
  roles: Role[];
}

export interface UserUpdateBody {
  full_name?: string;
  password?: string;
  roles?: Role[];
  is_active?: boolean;
}

export function useUsers(params: { role?: Role; includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () =>
      api<User[]>('/users', {
        query: { role: params.role, include_inactive: params.includeInactive || undefined },
      }),
    staleTime: 60_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserCreateBody) => api<User>('/users', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UserUpdateBody & { id: number }) =>
      api<User>(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
