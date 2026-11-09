import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeTask } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { TaskFormModal } from './TaskFormModal';

const patches = (fetch: ReturnType<typeof mockFetch>) =>
  fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH');

describe('TaskFormModal — редактирование: дедлайн', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('просроченную задачу можно отредактировать, не трогая дедлайн (А5-1)', async () => {
    const fetch = mockFetch({ 'PATCH /api/tasks/7': makeTask() });
    const past = makeTask({ deadline: '2026-01-10T12:00:00Z', overdue: 'current' });
    renderWithProviders(<TaskFormModal task={past} onClose={() => {}} />);

    const quantity = screen.getByLabelText('Количество');
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '8');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(screen.queryByText('Дедлайн не может быть в прошлом')).not.toBeInTheDocument();
    await waitFor(() => expect(patches(fetch)).toHaveLength(1));
    expect(JSON.parse(String(patches(fetch)[0]?.[1]?.body))).toEqual({ quantity: 8 });
  });

  it('снятие дедлайна в редактировании требует подтверждения и шлёт deadline: null', async () => {
    const fetch = mockFetch({ 'PATCH /api/tasks/7': makeTask() });
    const task = makeTask({ deadline: '2099-01-10T12:00:00Z' });
    renderWithProviders(<TaskFormModal task={task} onClose={() => {}} />);

    await userEvent.click(screen.getByLabelText('Очистить дедлайн'));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Дедлайн не указан')).toBeInTheDocument();
    expect(patches(fetch)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить без дедлайна' }));
    await waitFor(() => expect(patches(fetch)).toHaveLength(1));
    expect(JSON.parse(String(patches(fetch)[0]?.[1]?.body))).toEqual({ deadline: null });
  });
});
