import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api, buildUrl } from './client';

describe('buildUrl', () => {
  it('пропускает пустые значения фильтров', () => {
    expect(buildUrl('/tasks', { status: 'new', offer: '', assignee: null, page: 2 })).toBe(
      '/api/tasks?status=new&page=2',
    );
  });

  it('без параметров не добавляет "?"', () => {
    expect(buildUrl('/health')).toBe('/api/health');
  });
});

describe('api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('разбирает ошибку в формате backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'task_taken', message: 'Уже взята' } }), {
          status: 409,
        }),
      ),
    );

    await expect(api('/tasks/1/take', { method: 'POST' })).rejects.toMatchObject({
      status: 409,
      code: 'task_taken',
      message: 'Уже взята',
    });
  });

  it('при не-JSON ответе возвращает общую ошибку', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));

    const err = await api('/health').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(502);
  });

  it('204 возвращает undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});
