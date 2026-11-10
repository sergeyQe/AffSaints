import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiUsage } from '../../api/ai';
import { makeTask } from '../../test/fixtures';
import { mockFetch, renderWithProviders } from '../../test/utils';
import { AiUsagePanel } from './AiUsagePanel';

const service = { id: 1, name: 'Midjourney', is_active: true };
const user = { id: 4, full_name: 'Иван Петров' };

const usage = (id: number, round: number, credits: number): AiUsage => ({
  id,
  task_id: 7,
  service,
  user,
  credits,
  round,
  created_at: '2026-11-02T10:00:00Z',
  updated_at: '2026-11-02T10:00:00Z',
});

describe('AiUsagePanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('у каждой записи видно, первая это версия или правки и какой круг', async () => {
    mockFetch({
      'GET /api/tasks/7/ai-usage': {
        items: [usage(1, 0, 20), usage(2, 1, 10), usage(3, 2, 5)],
        totals: [{ service, credits: 35 }],
      },
      'GET /api/ai-services': [service],
      'GET /api/auth/me': null,
    });
    renderWithProviders(<AiUsagePanel task={makeTask({ id: 7 })} />);

    expect(await screen.findByText('Первая версия')).toBeInTheDocument();
    expect(screen.getByText('Правки №1')).toBeInTheDocument();
    expect(screen.getByText('Правки №2')).toBeInTheDocument();
  });
});
