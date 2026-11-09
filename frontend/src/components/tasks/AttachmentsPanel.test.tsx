import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Attachment } from '../../api/attachments';
import { makeTask } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { AttachmentsPanel } from './AttachmentsPanel';

const base = {
  type: 'link' as const,
  filename: null,
  content_type: null,
  size: null,
  created_by: { id: 4, full_name: 'Иван Петров' },
  created_at: '2026-11-09T10:00:00Z',
};

const items: Attachment[] = [
  { ...base, id: 1, kind: 'reference', round: 0, url: 'https://ref.example/1' },
  { ...base, id: 2, kind: 'result', round: 0, url: 'https://drive.example/v1' },
  { ...base, id: 3, kind: 'result', round: 1, url: 'https://drive.example/v2' },
  { ...base, id: 4, kind: 'result', round: 1, url: 'javascript:alert(1)' },
];

describe('AttachmentsPanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('исполнитель в правках удаляет только результаты текущей версии', async () => {
    mockFetch({ 'GET /api/tasks/7/attachments': items });
    renderWithProviders(
      <AttachmentsPanel
        task={makeTask({
          status: 'revision',
          revision_count: 1,
          actions: ['submit', 'add_result'],
        })}
      />,
    );

    expect(await screen.findByText('Версия 2')).toBeInTheDocument();
    expect(screen.getByText('Версия 1')).toBeInTheDocument();
    // Референс без права add_reference — без кнопки удаления; v1 сдана — тоже без кнопки
    expect(screen.queryByLabelText('Удалить https://ref.example/1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Удалить https://drive.example/v1')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Удалить https://drive.example/v2')).toBeInTheDocument();
    // Форма добавления — только для результатов
    expect(screen.getByLabelText('Ссылка на результат')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ссылка на референс')).not.toBeInTheDocument();
  });

  it('без прав — только просмотр', async () => {
    mockFetch({ 'GET /api/tasks/7/attachments': items });
    renderWithProviders(<AttachmentsPanel task={makeTask({ status: 'review', actions: [] })} />);

    await screen.findByText('Версия 1');
    expect(screen.queryAllByRole('button', { name: /^Удалить/ })).toHaveLength(0);
    expect(screen.queryByText(/Перетащите файлы/)).not.toBeInTheDocument();
  });

  it('небезопасная ссылка не попадает в href (А5-11)', async () => {
    mockFetch({ 'GET /api/tasks/7/attachments': items });
    renderWithProviders(<AttachmentsPanel task={makeTask({ status: 'review' })} />);

    const unsafe = await screen.findByText('javascript:alert(1)');
    expect(unsafe.closest('a')).not.toHaveAttribute('href');
    const safe = screen.getByText('https://drive.example/v2');
    expect(
      within(safe.parentElement!).getByText('https://drive.example/v2').closest('a'),
    ).toHaveAttribute('href', 'https://drive.example/v2');
  });
});
