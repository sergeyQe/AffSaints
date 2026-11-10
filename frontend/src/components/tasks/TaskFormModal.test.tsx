import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeTask } from '../../test/fixtures';
import { ME_KEY } from '../../api/auth';
import { createTestQueryClient, mockFetch, renderWithProviders } from '../../test/utils';
import { TaskFormModal } from './TaskFormModal';

const posted = (fetch: ReturnType<typeof mockFetch>, method: string) =>
  fetch.mock.calls.filter(([, init]) => init?.method === method);

async function fillRequired() {
  await userEvent.type(screen.getByLabelText(/Оффер/), 'Pin-Up');
  await userEvent.type(screen.getByLabelText(/GEO/), 'KZ');
}

describe('TaskFormModal — создание', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('требует оффер и GEO', async () => {
    const fetch = mockFetch({});
    renderWithProviders(<TaskFormModal task={null} onClose={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));

    expect(screen.getByText('Укажите оффер')).toBeInTheDocument();
    expect(screen.getByText('Укажите GEO')).toBeInTheDocument();
    expect(posted(fetch, 'POST')).toHaveLength(0);
  });

  it('без дедлайна показывает последствия и не создаёт задачу без подтверждения', async () => {
    const fetch = mockFetch({});
    renderWithProviders(<TaskFormModal task={null} onClose={() => {}} />);
    await fillRequired();

    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));

    expect(await screen.findByText('Дедлайн не указан')).toBeInTheDocument();
    expect(screen.getByText(/не попадёт в метрику просрочек/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Указать дедлайн' }));
    expect(posted(fetch, 'POST')).toHaveLength(0);
  });

  it('после подтверждения создаёт задачу с deadline: null', async () => {
    const onCreated = vi.fn();
    const fetch = mockFetch({ 'POST /api/tasks': makeTask({ id: 42 }) });
    renderWithProviders(<TaskFormModal task={null} onClose={() => {}} onCreated={onCreated} />);
    await fillRequired();

    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Создать без дедлайна' }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 42 })),
    );
    const body = JSON.parse(String(posted(fetch, 'POST')[0]?.[1]?.body));
    expect(body).toMatchObject({ offer: 'Pin-Up', geo: 'KZ', deadline: null, quantity: 1 });
  });

  it('с быстрым дедлайном создаёт задачу сразу, без диалога', async () => {
    const fetch = mockFetch({ 'POST /api/tasks': makeTask() });
    renderWithProviders(<TaskFormModal task={null} onClose={() => {}} />);
    await fillRequired();

    await userEvent.click(screen.getByRole('button', { name: '+1 день' }));
    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));

    await waitFor(() => expect(posted(fetch, 'POST')).toHaveLength(1));
    expect(screen.queryByText('Дедлайн не указан')).not.toBeInTheDocument();
    const body = JSON.parse(String(posted(fetch, 'POST')[0]?.[1]?.body));
    expect(new Date(body.deadline).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('TaskFormModal — кнопки дедлайна', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('±1 день и ±1 час меняют текущее значение, «минус» без дедлайна неактивен', async () => {
    mockFetch({});
    renderWithProviders(<TaskFormModal task={null} onClose={() => {}} />);
    const deadline = () => screen.getByRole('button', { name: /Дедлайн/ }).textContent ?? '';
    const btn = (name: string) => screen.getByRole('button', { name });

    // Порядок: все «минус» (час, день, неделя), затем все «плюс»
    const steps = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((t) => /^[−+]1 /.test(t));
    expect(steps).toEqual(['−1 час', '−1 день', '−1 неделя', '+1 час', '+1 день', '+1 неделя']);
    expect(btn('−1 день')).toBeDisabled();
    expect(btn('−1 час')).toBeDisabled();
    expect(btn('−1 неделя')).toBeDisabled();

    // Неделя вперёд и назад возвращает то же значение
    await userEvent.click(btn('+1 неделя'));
    const week = deadline();
    await userEvent.click(btn('+1 неделя'));
    await userEvent.click(btn('−1 неделя'));
    expect(deadline()).toBe(week);
    await userEvent.click(btn('−1 неделя'));
    expect(btn('−1 неделя')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Очистить дедлайн' }));

    await userEvent.click(btn('+1 день'));
    await userEvent.click(btn('+1 день'));
    const twoDays = deadline();
    await userEvent.click(btn('+1 час'));
    const plusHour = deadline();
    expect(plusHour).not.toBe(twoDays);
    await userEvent.click(btn('−1 час'));
    expect(deadline()).toBe(twoDays);
    await userEvent.click(btn('−1 день'));
    expect(deadline()).not.toBe(twoDays);
    // Остался день от начала текущего часа — ещё «минус день» ушёл бы в прошлое
    expect(btn('−1 день')).toBeDisabled();
    expect(btn('−1 час')).toBeEnabled();
  });
});

describe('TaskFormModal — черновик', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // Форма знает текущего пользователя — черновик у каждого свой
  const renderAs = (userId: number, onClose = () => {}) => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(ME_KEY, {
      id: userId,
      login: `u${userId}`,
      full_name: 'Тест',
      roles: ['buyer'],
      is_active: true,
    });
    return renderWithProviders(<TaskFormModal task={null} onClose={onClose} />, { queryClient });
  };

  it('прерванное ТЗ восстанавливается при следующем «Новое ТЗ»', async () => {
    mockFetch({});
    const first = renderAs(1);
    await fillRequired();
    expect(screen.queryByText(/Восстановлен черновик/)).toBeNull();
    first.unmount();

    renderAs(1);
    expect(screen.getByText(/Восстановлен черновик/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Оффер/)).toHaveValue('Pin-Up');
    expect(screen.getByLabelText(/GEO/)).toHaveValue('KZ');
  });

  it('у другого пользователя черновика нет', async () => {
    mockFetch({});
    const first = renderAs(1);
    await fillRequired();
    first.unmount();

    renderAs(2);
    expect(screen.queryByText(/Восстановлен черновик/)).toBeNull();
    expect(screen.getByLabelText(/Оффер/)).toHaveValue('');
  });

  it('«Сбросить черновик» очищает форму и удаляет черновик', async () => {
    mockFetch({});
    const first = renderAs(1);
    await fillRequired();
    first.unmount();

    const second = renderAs(1);
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить черновик' }));
    expect(screen.getByLabelText(/Оффер/)).toHaveValue('');
    expect(screen.queryByText(/Восстановлен черновик/)).toBeNull();
    second.unmount();

    renderAs(1);
    expect(screen.queryByText(/Восстановлен черновик/)).toBeNull();
  });

  it('после создания задачи черновик удаляется', async () => {
    const fetch = mockFetch({ 'POST /api/tasks': makeTask() });
    const first = renderAs(1);
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: '+1 день' }));
    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));
    await waitFor(() => expect(posted(fetch, 'POST')).toHaveLength(1));
    await waitFor(() => expect(localStorage.getItem('affsaints:task-draft:1')).toBeNull());
    first.unmount();

    renderAs(1);
    expect(screen.queryByText(/Восстановлен черновик/)).toBeNull();
  });
});

describe('TaskFormModal — редактирование', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('отправляет только изменённые поля', async () => {
    const fetch = mockFetch({ 'PATCH /api/tasks/7': makeTask() });
    renderWithProviders(<TaskFormModal task={makeTask()} onClose={() => {}} />);

    const geo = screen.getByLabelText(/GEO/);
    await userEvent.clear(geo);
    await userEvent.type(geo, 'MX');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(posted(fetch, 'PATCH')).toHaveLength(1));
    expect(JSON.parse(String(posted(fetch, 'PATCH')[0]?.[1]?.body))).toEqual({ geo: 'MX' });
  });

  it('предупреждает, что задача уже в работе', () => {
    mockFetch({});
    renderWithProviders(
      <TaskFormModal
        task={makeTask({ status: 'in_progress', assignee: { id: 4, full_name: 'Иван Петров' } })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/уже в работе у Иван Петров/)).toBeInTheDocument();
  });
});
