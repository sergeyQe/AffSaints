import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, jsonError, mockFetch } from '../test/utils';
import { makeTask } from '../test/fixtures';
import { useRunTransition } from './useRunTransition';

function setup(onResultRequired = vi.fn()) {
  const qc = createTestQueryClient();
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <Notifications />
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => useRunTransition(onResultRequired), { wrapper });
  return { hook, invalidate, onResultRequired };
}

describe('useRunTransition', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('после 409 доска всё равно перечитывается (А5-2)', async () => {
    mockFetch({ 'POST /api/tasks/1/take': jsonError(409, 'task_already_taken', 'Уже взята') });
    const { hook, invalidate } = setup();

    act(() => hook.result.current.run({ id: 1, action: 'take' }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['tasks'] })),
    );
  });

  it('при двух быстрых сдачах result_required сообщается для своей задачи (А5-3)', async () => {
    mockFetch({
      'POST /api/tasks/1/submit': jsonError(400, 'result_required', 'Нет результата'),
      'POST /api/tasks/2/submit': makeTask({ id: 2, status: 'review' }),
    });
    const { hook, onResultRequired } = setup();

    act(() => {
      hook.result.current.run({ id: 1, action: 'submit' });
      hook.result.current.run({ id: 2, action: 'submit' });
    });

    // Окно «сдать без материала» открывается именно для задачи без результата
    await waitFor(() => expect(hook.result.current.noResult.taskId).toBe(1));
    act(() => hook.result.current.noResult.attach());
    expect(onResultRequired).toHaveBeenCalledWith(1);
    expect(onResultRequired).toHaveBeenCalledTimes(1);
  });
});
