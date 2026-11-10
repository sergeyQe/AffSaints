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

export interface OverdueStats {
  on_time: number;
  late: number;
  missed: number;
  late_rate: number | null;
  current: number;
  by_executor: OverdueRow[];
}

/** Вкладка «Пользователи и задачи». */
export interface Overview {
  date_from: string;
  date_to: string;
  summary: {
    created: number;
    completed: number;
    cancelled: number;
    active_now: number;
    overdue_now: number;
    revisions_per_task: number | null;
  };
  by_status: { status: TaskStatus; count: number }[];
  workload: WorkloadRow[];
  timeline: { day: string; created: number; completed: number }[];
}

/** Кредиты с разбивкой: первая версия (круг 0) и правки (круги 1, 2…). */
interface CreditsSplit {
  credits: number;
  first_version: number;
  revisions: number;
}

/** Вкладка «Учёт AI-расходов». */
export interface AiAnalytics {
  date_from: string;
  date_to: string;
  records: number;
  revision_share: number | null;
  by_service: (CreditsSplit & {
    service_id: number;
    service: string;
    revision_share: number | null;
  })[];
  by_executor: (CreditsSplit & { user: UserBrief; service_id: number; service: string })[];
  by_task: (CreditsSplit & {
    task_id: number;
    offer: string;
    geo: string;
    user: UserBrief;
    service_id: number;
    service: string;
    rounds: { round: number; credits: number }[];
  })[];
  by_task_truncated: boolean;
}

/** Вкладка «Учёт времени». Длительности — в секундах. */
export interface TimeAnalytics {
  date_from: string;
  date_to: string;
  tiles: {
    completed: number;
    avg_work_seconds: number | null;
    avg_revision_seconds: number | null;
    avg_review_wait_seconds: number | null;
    avg_pool_wait_seconds: number | null;
  };
  by_creative: {
    user: UserBrief;
    completed: number;
    work_seconds: number;
    revision_seconds: number;
    avg_task_seconds: number | null;
    revisions_per_task: number | null;
  }[];
  by_task: {
    task_id: number;
    offer: string;
    geo: string;
    user: UserBrief | null;
    completed_at: string;
    work_seconds: number;
    revision_seconds: number;
    revision_count: number;
    review_wait_seconds: number;
    pool_wait_seconds: number;
    deadline: 'on_time' | 'late' | 'none';
  }[];
  by_task_truncated: boolean;
  review_wait_by_reviewer: {
    user: UserBrief | null;
    tasks: number;
    avg_seconds: number;
    max_seconds: number;
  }[];
  waiting_now: { count: number; oldest_task_id: number | null; oldest_seconds: number | null };
  overdue: OverdueStats;
}

export type AnalyticsTab = 'overview' | 'ai' | 'time';

interface TabData {
  overview: Overview;
  ai: AiAnalytics;
  time: TimeAnalytics;
}

/** Данные одной вкладки: каждая грузится своим запросом, только когда открыта. */
export function useAnalyticsTab<T extends AnalyticsTab>(tab: T, params: AnalyticsParams) {
  return useQuery({
    queryKey: ['analytics', tab, params],
    queryFn: () => api<TabData[T]>(`/analytics/${tab}`, { query: { ...params } }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}
