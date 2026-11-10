import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';

export type TaskStatus = 'new' | 'in_progress' | 'review' | 'revision' | 'done' | 'cancelled';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type CreativeType = 'video' | 'static' | 'animation' | 'ugc' | 'playable' | 'other';
export type OverdueState = 'none' | 'current' | 'late';
export type TaskAction =
  | 'edit'
  | 'cancel'
  | 'take'
  | 'assign'
  | 'submit'
  | 'accept'
  | 'request_revision'
  | 'reopen'
  | 'reassign'
  | 'unassign'
  | 'move'
  | 'add_reference'
  | 'add_result'
  | 'manage_ai_usage';

export interface UserBrief {
  id: number;
  full_name: string;
}

export interface Task {
  id: number;
  offer: string;
  geo: string;
  creative_type: CreativeType;
  quantity: number;
  description: string;
  priority: Priority;
  deadline: string | null;
  status: TaskStatus;
  author: UserBrief;
  assignee: UserBrief | null;
  created_at: string;
  updated_at: string;
  taken_at: string | null;
  first_submitted_at: string | null;
  last_submitted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  revision_count: number;
  revision_comment: string | null;
  brief_updated_at: string | null;
  overdue: OverdueState;
  actions: TaskAction[];
}

export interface TaskDetail extends Task {
  work_seconds: number;
}

export interface TaskEvent {
  id: number;
  type: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  payload: Record<string, unknown>;
  actor: UserBrief | null;
  created_at: string;
}

export interface TaskBrief {
  offer: string;
  geo: string;
  creative_type: CreativeType;
  quantity: number;
  description: string;
  priority: Priority;
  deadline: string | null;
}

export interface TaskFilters {
  status?: TaskStatus;
  assignee_id?: number | null;
  author_id?: number | null;
  offer?: string;
  geo?: string;
  priority?: Priority | null;
  overdue?: boolean;
}

/** Опрос доски раз в 12 секунд (решение №19) + обновление при возврате на вкладку. */
export const BOARD_REFETCH_MS = 12_000;

export const taskKeys = {
  all: ['tasks'] as const,
  list: (filters: TaskFilters) => ['tasks', 'list', filters] as const,
  detail: (id: number) => ['tasks', 'detail', id] as const,
  events: (id: number) => ['tasks', 'events', id] as const,
};

export function useTasks(filters: TaskFilters, { keepPrevious = true } = {}) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => api<Task[]>('/tasks', { query: { ...filters } }),
    refetchInterval: BOARD_REFETCH_MS,
    // На доске при смене фильтров держим старые карточки до ответа; в архиве — нет
    placeholderData: keepPrevious ? keepPreviousData : undefined,
  });
}

export function useTask(id: number | null) {
  return useQuery({
    queryKey: taskKeys.detail(id ?? 0),
    queryFn: () => api<TaskDetail>(`/tasks/${id}`),
    enabled: id !== null,
    refetchInterval: BOARD_REFETCH_MS,
  });
}

export function useTaskEvents(id: number | null) {
  return useQuery({
    queryKey: taskKeys.events(id ?? 0),
    queryFn: () => api<TaskEvent[]>(`/tasks/${id}/events`),
    enabled: id !== null,
    refetchInterval: BOARD_REFETCH_MS,
  });
}

/**
 * Реакции на результат — на уровне хука, а не mutate(vars, {...}):
 * в TanStack Query 5 колбэки вызова срабатывают только для последнего mutate.
 */
export interface MutationHandlers<V> {
  onSuccess?: (task: TaskDetail, vars: V) => void;
  onError?: (error: unknown, vars: V) => void;
}

/** После любого изменения задачи (и после ошибки — данные могли устареть) обновляем доску и карточку. */
function useTaskMutation<V>(
  fn: (vars: V) => Promise<TaskDetail>,
  handlers: MutationHandlers<V> = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (task, vars) => {
      qc.setQueryData(taskKeys.detail(task.id), task);
      handlers.onSuccess?.(task, vars);
    },
    onError: (error, vars) => handlers.onError?.(error, vars),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: taskKeys.all });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useCreateTask() {
  return useTaskMutation((body: TaskBrief) => api<TaskDetail>('/tasks', { method: 'POST', body }));
}

export function useUpdateTask() {
  return useTaskMutation(({ id, ...body }: Partial<TaskBrief> & { id: number }) =>
    api<TaskDetail>(`/tasks/${id}`, { method: 'PATCH', body }),
  );
}

export type TransitionVars =
  | { id: number; action: 'take' | 'submit' | 'accept' | 'unassign' }
  // Сдача без материала — только с явным подтверждением исполнителя
  | { id: number; action: 'submit'; without_result: true }
  | { id: number; action: 'request-revision' | 'reopen'; comment: string }
  | { id: number; action: 'cancel'; reason: string }
  | { id: number; action: 'assign' | 'reassign'; assignee_id: number }
  // Перенос руководителем в любую колонку: исполнитель — при уходе из «Новых»
  | {
      id: number;
      action: 'move';
      status: TaskStatus;
      assignee_id?: number;
      comment?: string;
    };

export function useTransition(handlers: MutationHandlers<TransitionVars> = {}) {
  return useTaskMutation(
    ({ id, action, ...body }: TransitionVars) =>
      api<TaskDetail>(`/tasks/${id}/${action}`, {
        method: 'POST',
        body: Object.keys(body).length ? body : undefined,
      }),
    handlers,
  );
}
