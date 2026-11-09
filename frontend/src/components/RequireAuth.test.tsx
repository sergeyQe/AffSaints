import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { User } from '../api/types';
import { jsonError, mockFetch, renderWithProviders } from '../test/utils';
import { RequireAuth } from './RequireAuth';

const buyer: User = { id: 1, login: 'b', full_name: 'Байер', roles: ['buyer'], is_active: true };

describe('RequireAuth', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('неавторизованного отправляет на /login', async () => {
    mockFetch({ 'GET /api/auth/me': jsonError(401, 'not_authenticated') });
    renderWithProviders(<RequireAuth>{() => <div>секрет</div>}</RequireAuth>, {
      extraRoutes: { '/login': <div>страница входа</div> },
      path: '/',
    });
    expect(await screen.findByText('страница входа')).toBeInTheDocument();
  });

  it('без нужной роли показывает «Нет доступа»', async () => {
    mockFetch({ 'GET /api/auth/me': buyer });
    renderWithProviders(<RequireAuth roles={['head']}>{() => <div>секрет</div>}</RequireAuth>);
    expect(await screen.findByText('Нет доступа')).toBeInTheDocument();
    expect(screen.queryByText('секрет')).not.toBeInTheDocument();
  });

  it('с нужной ролью рендерит содержимое и передаёт пользователя', async () => {
    mockFetch({ 'GET /api/auth/me': { ...buyer, roles: ['buyer', 'head'] } });
    renderWithProviders(
      <RequireAuth roles={['head']}>{(u) => <div>привет, {u.full_name}</div>}</RequireAuth>,
    );
    expect(await screen.findByText('привет, Байер')).toBeInTheDocument();
  });
});
