import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, api } from './client';
import type { DemoUser, User } from './types';

export const ME_KEY = ['me'] as const;

/** Текущий пользователь; null — не авторизован (401 не считается ошибкой). */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api<User>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useDemoUsers() {
  return useQuery({
    queryKey: ['demo-users'],
    queryFn: () => api<DemoUser[]>('/auth/demo-users'),
    staleTime: Infinity,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { login: string; password: string }) =>
      api<User>('/auth/login', { method: 'POST', body }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useDemoLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      api<User>('/auth/demo-login', { method: 'POST', body: { user_id: userId } }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      // Чистим весь кэш: данные прошлого пользователя не должны мелькнуть следующему
      qc.clear();
      qc.setQueryData(ME_KEY, null);
    },
  });
}
