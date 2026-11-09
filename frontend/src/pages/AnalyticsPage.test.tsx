import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Analytics } from '../api/analytics';
import { mockFetch, renderWithProviders } from '../test/utils';
import { AnalyticsPage } from './AnalyticsPage';

const ivan = { id: 4, full_name: 'Иван Петров' };
const maria = { id: 5, full_name: 'Мария Соколова' };

const data: Analytics = {
  date_from: '2026-11-01T00:00:00Z',
  date_to: '2026-12-01T00:00:00Z',
  summary: {
    created: 12,
    completed: 5,
    cancelled: 1,
    active_now: 4,
    overdue_now: 2,
    avg_work_seconds: 3 * 3600 + 15 * 60,
    revisions_per_task: 1.4,
  },
  by_status: [
    { status: 'new', count: 3 },
    { status: 'done', count: 5 },
  ],
  workload: [
    {
      user: ivan,
      in_progress: 2,
      review: 1,
      revision: 0,
      active_tasks: 3,
      active_creatives: 14,
      completed_in_period: 3,
      avg_work_seconds: 7200,
    },
  ],
  overdue: {
    on_time: 4,
    late: 1,
    missed: 1,
    late_rate: 0.3333,
    current: 2,
    by_executor: [
      { user: ivan, on_time: 3, late: 1, missed: 0, current: 1 },
      { user: null, on_time: 0, late: 0, missed: 1, current: 1 },
    ],
  },
  ai_credits: {
    by_service: [
      { service_id: 1, service: 'Midjourney', credits: 120.5 },
      { service_id: 2, service: 'Runway', credits: 40 },
    ],
    by_executor: [
      { user: ivan, service_id: 1, service: 'Midjourney', credits: 100 },
      { user: maria, service_id: 1, service: 'Midjourney', credits: 20.5 },
      { user: maria, service_id: 2, service: 'Runway', credits: 40 },
    ],
  },
  timeline: [{ day: '2026-11-02', created: 12, completed: 5 }],
};

describe('AnalyticsPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('показывает сводку, загрузку, сроки и расходы по сервисам без общей суммы', async () => {
    mockFetch({ 'GET /api/analytics': data, 'GET /api/users': [] });
    renderWithProviders(<AnalyticsPage />);

    expect(await screen.findByText('3 ч 15 мин')).toBeInTheDocument();
    expect(screen.getByText('1.4')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('Не взята в работу')).toBeInTheDocument();
    // Сводная таблица расходов: исполнитель × сервис, пустая клетка — прочерк
    expect(screen.getByText('20,5')).toBeInTheDocument();
    expect(screen.getAllByText('Мария Соколова').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Итого/i)).not.toBeInTheDocument();
  });

  it('по умолчанию запрашивает текущий месяц с таймзоной браузера', async () => {
    const fetch = mockFetch({ 'GET /api/analytics': data, 'GET /api/users': [] });
    renderWithProviders(<AnalyticsPage />);

    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/analytics'))).toBe(true),
    );
    const url = new URL(
      String(fetch.mock.calls.find(([u]) => String(u).includes('/api/analytics'))?.[0]),
      'http://x',
    );
    const from = new Date(url.searchParams.get('date_from')!);
    expect(from.getDate()).toBe(1);
    expect(url.searchParams.get('tz')).toBeTruthy();
  });

  it('пустой период — понятные пустые состояния', async () => {
    mockFetch({
      'GET /api/analytics': {
        ...data,
        by_status: [],
        workload: [],
        overdue: { ...data.overdue, by_executor: [], late_rate: null },
        ai_credits: { by_service: [], by_executor: [] },
        timeline: [{ day: '2026-11-02', created: 0, completed: 0 }],
      },
      'GET /api/users': [],
    });
    renderWithProviders(<AnalyticsPage />);

    expect(await screen.findByText('За период AI-кредиты не тратились.')).toBeInTheDocument();
    expect(screen.getByText('Дедлайнов в периоде нет.')).toBeInTheDocument();
    expect(screen.getByText('За период задач нет.')).toBeInTheDocument();
  });
});
