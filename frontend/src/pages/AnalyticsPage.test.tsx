import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiAnalytics, Overview, TimeAnalytics } from '../api/analytics';
import { jsonError, mockFetch, renderWithProviders } from '../test/utils';
import { AnalyticsPage } from './AnalyticsPage';

const ivan = { id: 4, full_name: 'Иван Петров' };
const maria = { id: 5, full_name: 'Мария Соколова' };
const anna = { id: 2, full_name: 'Анна Козлова' };
const period = { date_from: '2026-11-01T00:00:00Z', date_to: '2026-12-01T00:00:00Z' };

const overview: Overview = {
  ...period,
  summary: {
    created: 12,
    completed: 5,
    cancelled: 1,
    active_now: 4,
    overdue_now: 2,
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
  timeline: [{ day: '2026-11-02', created: 12, completed: 5 }],
};

const ai: AiAnalytics = {
  ...period,
  records: 5,
  revision_share: 0.25,
  by_service: [
    {
      service_id: 1,
      service: 'Midjourney',
      credits: 120.5,
      first_version: 80.5,
      revisions: 40,
      revision_share: 0.332,
    },
    {
      service_id: 2,
      service: 'Runway',
      credits: 40,
      first_version: 40,
      revisions: 0,
      revision_share: 0,
    },
  ],
  by_executor: [
    {
      user: ivan,
      service_id: 1,
      service: 'Midjourney',
      credits: 100,
      first_version: 60,
      revisions: 40,
    },
    {
      user: maria,
      service_id: 1,
      service: 'Midjourney',
      credits: 20.5,
      first_version: 20.5,
      revisions: 0,
    },
    { user: maria, service_id: 2, service: 'Runway', credits: 40, first_version: 40, revisions: 0 },
  ],
  by_task: [
    {
      task_id: 13,
      offer: '1win',
      geo: 'KZ',
      user: ivan,
      service_id: 1,
      service: 'Midjourney',
      credits: 100,
      first_version: 60,
      revisions: 40,
      rounds: [
        { round: 1, credits: 30 },
        { round: 2, credits: 10 },
      ],
    },
  ],
  by_task_truncated: false,
};

const time: TimeAnalytics = {
  ...period,
  tiles: {
    completed: 5,
    avg_work_seconds: 3 * 3600 + 15 * 60,
    avg_revision_seconds: 40 * 60,
    avg_review_wait_seconds: 5 * 3600,
    avg_pool_wait_seconds: 20 * 60,
  },
  by_creative: [
    {
      user: ivan,
      completed: 3,
      work_seconds: 9 * 3600,
      revision_seconds: 3600,
      avg_task_seconds: 10 * 3600,
      revisions_per_task: 1.5,
    },
  ],
  by_task: [
    {
      task_id: 6,
      offer: 'Joycasino',
      geo: 'MX',
      user: maria,
      completed_at: '2026-11-05T10:00:00Z',
      work_seconds: 3 * 3600 + 10 * 60,
      revision_seconds: 0,
      revision_count: 0,
      review_wait_seconds: 5 * 3600,
      pool_wait_seconds: 20 * 60,
      deadline: 'late',
    },
  ],
  by_task_truncated: false,
  review_wait_by_reviewer: [{ user: anna, tasks: 4, avg_seconds: 2 * 3600, max_seconds: 6 * 3600 }],
  waiting_now: { count: 2, oldest_task_id: 10, oldest_seconds: 26 * 3600 },
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
};

const routes = {
  'GET /api/analytics/overview': overview,
  'GET /api/analytics/ai': ai,
  'GET /api/analytics/time': time,
  'GET /api/users': [],
};

const requested = (fetch: ReturnType<typeof mockFetch>, tab: string) =>
  fetch.mock.calls.filter(([url]) => String(url).includes(`/api/analytics/${tab}`));

describe('AnalyticsPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('по умолчанию — «Пользователи и задачи», грузится только эта вкладка', async () => {
    const fetch = mockFetch(routes);
    renderWithProviders(<AnalyticsPage />);

    expect(await screen.findByText('1.4')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Пользователи и задачи' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Среднее время и сроки переехали на вкладку «Учёт времени»
    expect(screen.queryByRole('group', { name: 'Среднее время' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Сроки' })).not.toBeInTheDocument();
    expect(requested(fetch, 'overview').length).toBeGreaterThan(0);
    expect(requested(fetch, 'ai')).toHaveLength(0);
    expect(requested(fetch, 'time')).toHaveLength(0);
  });

  it('по умолчанию запрашивает текущий месяц с таймзоной браузера', async () => {
    const fetch = mockFetch(routes);
    renderWithProviders(<AnalyticsPage />);

    await waitFor(() => expect(requested(fetch, 'overview').length).toBeGreaterThan(0));
    const url = new URL(String(requested(fetch, 'overview')[0]?.[0]), 'http://x');
    const from = new Date(url.searchParams.get('date_from')!);
    expect(from.getDate()).toBe(1);
    expect(url.searchParams.get('tz')).toBeTruthy();
  });

  it('AI-расходы: доли правок общая и по сервисам, разбивка по задачам без общей суммы', async () => {
    mockFetch(routes);
    renderWithProviders(<AnalyticsPage />, { route: '/?tab=ai' });

    expect(await screen.findByText('25%')).toBeInTheDocument();
    expect(screen.getByText('Midjourney — 33%')).toBeInTheDocument();
    expect(screen.getByText('Runway — 0%')).toBeInTheDocument();
    // В клетке исполнителя — сколько из кредитов ушло на правки
    expect(screen.getByText('правки 40')).toBeInTheDocument();
    // По задачам: ссылка на карточку, первая версия / правки / всего
    const link = screen.getByRole('link', { name: '#13 1win' });
    expect(link).toHaveAttribute('href', '/?task=13&tab=ai');
    const row = link.closest('tr')!;
    expect(within(row).getByText('60')).toBeInTheDocument();
    expect(within(row).getByText('100')).toBeInTheDocument();
    expect(screen.queryByText(/Итого/i)).not.toBeInTheDocument();
  });

  it('учёт времени: плитки, ожидание проверки за принявшим, сроки', async () => {
    mockFetch(routes);
    renderWithProviders(<AnalyticsPage />, { route: '/?tab=time' });

    expect(await screen.findByText('3 ч 15 мин')).toBeInTheDocument();
    expect(screen.getByText('40 мин')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#6 Joycasino' })).toBeInTheDocument();
    expect(screen.getByText('с опозданием')).toBeInTheDocument();
    const review = screen.getByRole('region', { name: 'Ожидание проверки' });
    expect(within(review).getByText('Анна Козлова')).toBeInTheDocument();
    expect(within(review).getByText(/Сейчас ждут проверки: 2/)).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('Не взята в работу')).toBeInTheDocument();
  });

  it('переключение вкладки сохраняет фильтры', async () => {
    const fetch = mockFetch({ ...routes, 'GET /api/users': [ivan] });
    renderWithProviders(<AnalyticsPage />);
    await screen.findByText('1.4');

    // Имя есть и в таблице загрузки — выбираем поиском в поле и Enter
    await userEvent.type(
      screen.getByRole('combobox', { name: 'Креативщик' }),
      'Иван{ArrowDown}{Enter}',
    );
    await waitFor(() =>
      expect(requested(fetch, 'overview').some(([u]) => String(u).includes('creative_id=4'))).toBe(
        true,
      ),
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Учёт времени' }));
    expect(await screen.findByText('3 ч 15 мин')).toBeInTheDocument();
    // Тот же фильтр ушёл и в запрос вкладки времени
    expect(requested(fetch, 'time').every(([u]) => String(u).includes('creative_id=4'))).toBe(true);
  });

  it('сбой фонового обновления не прячет загруженные данные — ошибка над ними', async () => {
    // Первый ответ успешный, повторный (обновление раз в минуту) — падает
    let calls = 0;
    mockFetch({
      ...routes,
      'GET /api/analytics/overview': () =>
        ++calls === 1 ? overview : jsonError(502, 'bad_gateway', 'Сервер недоступен'),
    });
    const { queryClient } = renderWithProviders(<AnalyticsPage />);
    expect(await screen.findByText('1.4')).toBeInTheDocument();

    await act(() => queryClient.refetchQueries({ queryKey: ['analytics', 'overview'] }));

    expect(await screen.findByText(/Не удалось загрузить аналитику/)).toBeInTheDocument();
    expect(screen.getByText('1.4')).toBeInTheDocument();
  });

  it('пустой период — понятные пустые состояния на каждой вкладке', async () => {
    mockFetch({
      ...routes,
      'GET /api/analytics/overview': {
        ...overview,
        by_status: [],
        workload: [],
        timeline: [{ day: '2026-11-02', created: 0, completed: 0 }],
      },
      'GET /api/analytics/ai': {
        ...ai,
        records: 0,
        revision_share: null,
        by_service: [],
        by_executor: [],
        by_task: [],
      },
      'GET /api/analytics/time': {
        ...time,
        by_creative: [],
        by_task: [],
        review_wait_by_reviewer: [],
        waiting_now: { count: 0, oldest_task_id: null, oldest_seconds: null },
        overdue: { ...time.overdue, by_executor: [], late_rate: null },
      },
    });
    renderWithProviders(<AnalyticsPage />);

    expect(await screen.findByText('За период задач нет.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Учёт AI-расходов' }));
    expect(await screen.findByText('За период AI-кредиты не тратились.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Учёт времени' }));
    expect(await screen.findByText('Дедлайнов в периоде нет.')).toBeInTheDocument();
    expect(screen.getAllByText('За период задачи не принимались.')).toHaveLength(2);
  });
});
