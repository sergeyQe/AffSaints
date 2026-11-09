import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api } from './client';
import type { TaskStatus, UserBrief } from './tasks';

export interface AnalyticsParams {
  date_from: string;
  date_to: string;
  buyer_id?: number | null;
  creative_id?: number | null;
  offer?: string;
  tz: string;
}

export interface WorkloadRow {
  user: UserBrief;
  in_progress: number;
  review: number;
  revision: number;
  active_tasks: number;
  active_creatives: number;
  completed_in_period: number;
  avg_work_seconds: number | null;
}

export interface OverdueRow {
  user: UserBrief | null;
  on_time: number;
  late: number;
  missed: number;
  current: number;
}

export interface Analytics {
  date_from: string;
  date_to: string;
  summary: {
    created: number;
    completed: number;
    cancelled: number;
    active_now: number;
    overdue_now: number;
    avg_work_seconds: number | null;
    revisions_per_task: number | null;
  };
  by_status: { status: TaskStatus; count: number }[];
  workload: WorkloadRow[];
  overdue: {
    on_time: number;
    late: number;
    missed: number;
    late_rate: number | null;
    current: number;
    by_executor: OverdueRow[];
  };
  ai_credits: {
    by_service: { service_id: number; service: string; credits: number }[];
    by_executor: { user: UserBrief; service_id: number; service: string; credits: number }[];
  };
  timeline: { day: string; created: number; completed: number }[];
}

export function useAnalytics(params: AnalyticsParams) {
  return useQuery({
    queryKey: ['analytics', params],
    queryFn: () => api<Analytics>('/analytics', { query: { ...params } }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}
