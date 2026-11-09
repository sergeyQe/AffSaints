import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import { theme } from '../theme';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

interface Options {
  route?: string;
  /** Дополнительные маршруты рядом с тестируемым (чтобы проверять переходы). */
  extraRoutes?: Record<string, ReactElement>;
  path?: string;
  queryClient?: QueryClient;
}

export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const {
    route = '/',
    path = '*',
    extraRoutes = {},
    queryClient = createTestQueryClient(),
  } = options;
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme}>
        <ModalsProvider>
          <Notifications />
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={path} element={ui} />
              {Object.entries(extraRoutes).map(([p, el]) => (
                <Route key={p} path={p} element={el} />
              ))}
            </Routes>
          </MemoryRouter>
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

type Handler = (init: RequestInit | undefined, url: URL) => unknown;

/**
 * Мок fetch по таблице "МЕТОД /api/путь" → ответ.
 * Ответ-функция может вернуть Response (для ошибок) или данные для JSON 200.
 */
export function mockFetch(routes: Record<string, Handler | Response | object | null | undefined>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    if (!(key in routes)) {
      return new Response(JSON.stringify({ error: { code: 'not_mocked', message: key } }), {
        status: 404,
      });
    }
    const route = routes[key];
    const value = typeof route === 'function' ? (route as Handler)(init, url) : route;
    if (value instanceof Response) return value;
    if (value === undefined) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(value), { status: 200 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function jsonError(status: number, code: string, message = code) {
  return new Response(JSON.stringify({ error: { code, message } }), { status });
}
