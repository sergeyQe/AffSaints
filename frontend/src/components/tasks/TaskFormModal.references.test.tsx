import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeTask } from '../../test/fixtures';
import { jsonError, mockFetch, renderWithProviders } from '../../test/utils';
import { TaskFormModal } from './TaskFormModal';

const png = (name: string) =>
  new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

async function fillBrief() {
  await userEvent.type(screen.getByLabelText(/Оффер/), 'Pin-Up');
  await userEvent.type(screen.getByLabelText(/GEO/), 'KZ');
  await userEvent.click(screen.getByRole('button', { name: '+1 день' }));
}

const calls = (fetch: ReturnType<typeof mockFetch>, suffix: string) =>
  fetch.mock.calls.filter(([url]) => String(url).endsWith(suffix));

describe('TaskFormModal — референсы в форме создания (С-1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ссылки и файлы прикладываются сразу после создания задачи', async () => {
    const onCreated = vi.fn();
    const fetch = mockFetch({
      'POST /api/tasks': makeTask({ id: 42 }),
      'POST /api/tasks/42/attachments/link': { id: 1 },
      'POST /api/tasks/42/attachments/file': { id: 2 },
    });
    renderWithProviders(<TaskFormModal task={null} onClose={() => {}} onCreated={onCreated} />);
    await fillBrief();

    await userEvent.type(
      screen.getByLabelText('Ссылка на референс'),
      'https://tiktok.com/@ref/1{Enter}',
    );
    expect(screen.getByText('https://tiktok.com/@ref/1')).toBeInTheDocument();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, png('пример.png'));
    expect(screen.getByText('пример.png')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(JSON.parse(String(calls(fetch, '/attachments/link')[0]?.[1]?.body))).toEqual({
      kind: 'reference',
      url: 'https://tiktok.com/@ref/1',
    });
    const form = calls(fetch, '/attachments/file')[0]?.[1]?.body as FormData;
    expect(form.get('kind')).toBe('reference');
    expect((form.get('file') as File).name).toBe('пример.png');
  });

  it('небезопасную ссылку не принимает, убрать добавленную можно', async () => {
    mockFetch({});
    renderWithProviders(<TaskFormModal task={null} onClose={() => {}} />);

    const link = screen.getByLabelText('Ссылка на референс');
    await userEvent.type(link, 'javascript:alert(1){Enter}');
    expect(screen.getByText('Ссылка должна начинаться с http:// или https://')).toBeInTheDocument();

    await userEvent.clear(link);
    await userEvent.type(link, 'https://drive.google.com/x{Enter}');
    await userEvent.click(
      screen.getByRole('button', { name: 'Убрать https://drive.google.com/x' }),
    );
    expect(screen.queryByText('https://drive.google.com/x')).not.toBeInTheDocument();
  });

  it('Enter в поле ссылки не отправляет форму', async () => {
    const fetch = mockFetch({});
    renderWithProviders(<TaskFormModal task={null} onClose={() => {}} />);
    await fillBrief();

    await userEvent.type(screen.getByLabelText('Ссылка на референс'), 'https://a.com/ref{Enter}');

    expect(calls(fetch, '/api/tasks')).toHaveLength(0);
  });

  it('сбой одного референса не отменяет создание и остальные вложения', async () => {
    const onCreated = vi.fn();
    const fetch = mockFetch({
      'POST /api/tasks': makeTask({ id: 42 }),
      'POST /api/tasks/42/attachments/link': jsonError(422, 'validation_error', 'Неверная ссылка'),
      'POST /api/tasks/42/attachments/file': { id: 2 },
    });
    renderWithProviders(<TaskFormModal task={null} onClose={() => {}} onCreated={onCreated} />);
    await fillBrief();
    await userEvent.type(
      screen.getByLabelText('Ссылка на референс'),
      'https://bad.example/x{Enter}',
    );
    await userEvent.upload(
      document.querySelector<HTMLInputElement>('input[type="file"]')!,
      png('ok.png'),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(calls(fetch, '/attachments/file')).toHaveLength(1);
    expect(
      await screen.findByText('Референс «https://bad.example/x» не приложен'),
    ).toBeInTheDocument();
  });

  it('в редактировании блока референсов нет — они в карточке', () => {
    mockFetch({});
    renderWithProviders(<TaskFormModal task={makeTask()} onClose={() => {}} />);
    expect(screen.queryByLabelText('Ссылка на референс')).not.toBeInTheDocument();
  });
});
