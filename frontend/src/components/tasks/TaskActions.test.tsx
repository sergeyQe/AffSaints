import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TaskAction } from '../../api/tasks';
import { makeTask } from '../../test/fixtures';
import { jsonError, mockFetch, renderWithProviders } from '../../test/utils';
import { TaskActions } from './TaskActions';

function renderActions(
  actions: TaskAction[],
  status = makeTask().status,
  onResultRequired = vi.fn(),
) {
  renderWithProviders(
    <TaskActions
      task={makeTask({ actions, status })}
      onEdit={() => {}}
      onResultRequired={onResultRequired}
    />,
  );
  return { onResultRequired };
}

const buttons = () => screen.queryAllByRole('button').map((b) => b.textContent);

describe('TaskActions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('креативщик на новой задаче видит только «Взять в работу»', () => {
    mockFetch({});
    renderActions(['take']);
    expect(buttons()).toEqual(['Взять в работу']);
  });

  it('байер на проверке: принять, на правки, редактировать, отменить', () => {
    mockFetch({});
    renderActions(['accept', 'request_revision', 'edit', 'cancel', 'add_reference'], 'review');
    expect(buttons()).toEqual(['Принять', 'На правки', 'Редактировать ТЗ', 'Отменить задачу']);
  });

  it('в «Правках» кнопка сдачи называется «Сдать исправленное»', () => {
    mockFetch({});
    renderActions(['submit', 'add_result'], 'revision');
    expect(buttons()).toEqual(['Сдать исправленное']);
  });

  it('без действий кнопок нет', () => {
    mockFetch({});
    renderActions([], 'done');
    expect(buttons()).toEqual([]);
  });

  it('на правки нельзя отправить без комментария', async () => {
    const fetch = mockFetch({ 'POST /api/tasks/7/request-revision': makeTask() });
    renderActions(['request_revision'], 'review');

    await userEvent.click(screen.getByRole('button', { name: 'На правки' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Отправить на правки' }));
    expect(screen.getByText('Обязательное поле')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Что исправить'), 'Крупнее логотип');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить на правки' }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      comment: 'Крупнее логотип',
    });
  });

  it('сдача без результата ведёт на вкладку файлов', async () => {
    mockFetch({
      'POST /api/tasks/7/submit': jsonError(400, 'result_required', 'Прикрепите результат'),
    });
    const { onResultRequired } = renderActions(['submit'], 'in_progress');

    await userEvent.click(screen.getByRole('button', { name: 'Сдать на проверку' }));

    await waitFor(() => expect(onResultRequired).toHaveBeenCalled());
    expect(await screen.findByText('Прикрепите результат')).toBeInTheDocument();
  });
});
