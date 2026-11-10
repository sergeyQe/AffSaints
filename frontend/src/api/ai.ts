import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import { taskKeys, type UserBrief } from './tasks';

export interface AiService {
  id: number;
  name: string;
  is_active: boolean;
}

export interface AiUsage {
  id: number;
  task_id: number;
  service: AiService;
  user: UserBrief;
  credits: number;
  /** Круг правок: 0 — первая версия, 1, 2… — правки. */
  round: number;
  created_at: string;
  updated_at: string;
}

export interface TaskAiUsage {
  items: AiUsage[];
  totals: { service: AiService; credits: number }[];
}

export function useAiServices(includeInactive = false) {
  return useQuery({
    queryKey: ['ai-services', includeInactive],
    queryFn: () =>
      api<AiService[]>('/ai-services', {
        query: { include_inactive: includeInactive || undefined },
      }),
    staleTime: 60_000,
  });
}

export function useSaveAiService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: number; name?: string; is_active?: boolean }) =>
      id
        ? api<AiService>(`/ai-services/${id}`, { method: 'PATCH', body })
        : api<AiService>('/ai-services', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-services'] }),
  });
}

const usageKey = (taskId: number) => ['tasks', 'ai-usage', taskId] as const;

export function useTaskAiUsage(taskId: number) {
  return useQuery({
    queryKey: usageKey(taskId),
    queryFn: () => api<TaskAiUsage>(`/tasks/${taskId}/ai-usage`),
  });
}

/** Добавление, правка и удаление расхода; после — обновляем расходы, историю и аналитику. */
export function useAiUsageMutation(taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      vars:
        | { op: 'add'; service_id: number; credits: number }
        | { op: 'update'; id: number; service_id?: number; credits?: number }
        | { op: 'remove'; id: number },
    ) => {
      if (vars.op === 'add') {
        return api(`/tasks/${taskId}/ai-usage`, {
          method: 'POST',
          body: { service_id: vars.service_id, credits: vars.credits },
        });
      }
      if (vars.op === 'update') {
        const { id, service_id, credits } = vars;
        return api(`/ai-usage/${id}`, { method: 'PATCH', body: { service_id, credits } });
      }
      return api(`/ai-usage/${vars.id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: usageKey(taskId) });
      void qc.invalidateQueries({ queryKey: taskKeys.events(taskId) });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}
