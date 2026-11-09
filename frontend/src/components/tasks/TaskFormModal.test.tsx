import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeTask } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
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

    await userEvent.click(screen.getByRole('button', { name: '+3 дня' }));
    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));

    await waitFor(() => expect(posted(fetch, 'POST')).toHaveLength(1));
    expect(screen.queryByText('Дедлайн не указан')).not.toBeInTheDocument();
    const body = JSON.parse(String(posted(fetch, 'POST')[0]?.[1]?.body));
    expect(new Date(body.deadline).getTime()).toBeGreaterThan(Date.now());
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
