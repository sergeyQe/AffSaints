import { screen, waitFor, within } from '@testing-library/react';
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

  it('руководитель возвращает принятую работу на правки с комментарием', async () => {
    const fetch = mockFetch({ 'POST /api/tasks/7/reopen': makeTask({ status: 'revision' }) });
    renderActions(['reopen', 'manage_ai_usage'], 'done');
    expect(buttons().filter(Boolean)).toEqual(['Вернуть на правки']);

    await userEvent.click(screen.getByRole('button', { name: 'Вернуть на правки' }));
    const dialog = await screen.findByRole('dialog', { name: 'Вернуть принятую работу на правки' });
    expect(dialog).toHaveTextContent('перестанет считаться завершённой');
    await userEvent.type(screen.getByLabelText('Что исправить'), 'Другой хук');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Вернуть на правки' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/tasks/7/reopen');
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ comment: 'Другой хук' });
  });

  it('руководитель назначает исполнителя на новую задачу', async () => {
    const fetch = mockFetch({
      'GET /api/users': [
        { id: 4, full_name: 'Иван Петров', login: 'ivan', roles: ['creative'], is_active: true },
      ],
      'POST /api/tasks/7/assign': makeTask({ status: 'in_progress' }),
    });
    renderActions(['assign', 'edit', 'cancel'], 'new');
    // Пустые — крестики уведомлений из предыдущих тестов (общее хранилище Mantine)
    expect(buttons().filter(Boolean)).toEqual([
      'Назначить исполнителя',
      'Редактировать ТЗ',
      'Отменить задачу',
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Назначить исполнителя' }));
    const dialog = await screen.findByRole('dialog', { name: 'Назначить исполнителя' });
    expect(dialog).toHaveTextContent('сразу перейдёт в «В работе»');
    // Список креативщиков грузится при открытии окна — ждём его
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/users'))).toBe(true),
    );
    // Список вариантов Mantine рендерит в портале с анимацией — ищем по тексту
    await userEvent.click(screen.getByRole('combobox', { name: 'Исполнитель' }));
    await userEvent.click(await screen.findByText('Иван Петров'));
    await userEvent.click(screen.getByRole('button', { name: 'Назначить' }));

    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/tasks/7/assign'))).toBe(true),
    );
    const call = fetch.mock.calls.find(([url]) => String(url).endsWith('/tasks/7/assign'));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ assignee_id: 4 });
  });

  it('сдача без результата: окно с выключенной галочкой, «Приложить материал» ведёт к файлам', async () => {
    mockFetch({
      'POST /api/tasks/7/submit': jsonError(400, 'result_required', 'Прикрепите результат'),
    });
    const { onResultRequired } = renderActions(['submit'], 'in_progress');

    await userEvent.click(screen.getByRole('button', { name: 'Сдать на проверку' }));

    const dialog = await screen.findByRole('dialog', { name: 'Материал не приложен' });
    // Галочка по умолчанию снята — без неё сдать нельзя
    expect(within(dialog).getByRole('checkbox', { name: 'Сдать без материала' })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Сдать' })).toBeDisabled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Приложить материал' }));
    expect(onResultRequired).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Материал не приложен' })).toBeNull(),
    );
  });

  it('сдача без материала после подтверждения галочкой', async () => {
    const fetch = mockFetch({
      'POST /api/tasks/7/submit': (init?: RequestInit) =>
        init?.body
          ? makeTask({ id: 7, status: 'review' })
          : jsonError(400, 'result_required', 'Прикрепите результат'),
    });
    const { onResultRequired } = renderActions(['submit'], 'in_progress');

    await userEvent.click(screen.getByRole('button', { name: 'Сдать на проверку' }));
    const dialog = await screen.findByRole('dialog', { name: 'Материал не приложен' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Сдать без материала' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сдать' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({ without_result: true });
    expect(onResultRequired).not.toHaveBeenCalled();
  });
});
