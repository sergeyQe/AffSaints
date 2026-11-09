import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { User } from '../api/types';
import { jsonError, mockFetch, renderWithProviders } from '../test/utils';
import { LoginPage } from './LoginPage';

const anna: User = { id: 1, login: 'anna', full_name: 'Анна', roles: ['buyer'], is_active: true };

function renderLogin() {
  return renderWithProviders(<LoginPage />, {
    route: '/login',
    path: '/login',
    extraRoutes: { '/': <div>Доска открыта</div> },
  });
}

describe('LoginPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('показывает кнопки демо-пользователей и входит по клику', async () => {
    const fetch = mockFetch({
      'GET /api/auth/me': jsonError(401, 'not_authenticated'),
      'GET /api/auth/demo-users': [
        { id: 1, full_name: 'Анна', roles: ['buyer'] },
        { id: 2, full_name: 'Олег', roles: ['head', 'creative'] },
      ],
      'POST /api/auth/demo-login': anna,
    });
    renderLogin();

    await userEvent.click(await screen.findByRole('button', { name: 'Войти как Анна' }));

    expect(await screen.findByText('Доска открыта')).toBeInTheDocument();
    const call = fetch.mock.calls.find(([url]) => String(url).endsWith('/demo-login'));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ user_id: 1 });
  });

  it('без демо-пользователей кнопок нет, форма остаётся', async () => {
    mockFetch({
      'GET /api/auth/me': jsonError(401, 'not_authenticated'),
      'GET /api/auth/demo-users': [],
    });
    renderLogin();

    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.queryByText(/Быстрый вход/)).not.toBeInTheDocument();
  });

  it('проверяет пустые поля и показывает ошибку backend', async () => {
    mockFetch({
      'GET /api/auth/me': jsonError(401, 'not_authenticated'),
      'GET /api/auth/demo-users': [],
      'POST /api/auth/login': jsonError(401, 'invalid_credentials', 'Неверный логин или пароль'),
    });
    renderLogin();

    await userEvent.click(await screen.findByRole('button', { name: 'Войти' }));
    expect(screen.getByText('Введите логин')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Логин'), 'anna');
    await userEvent.type(screen.getByLabelText('Пароль'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Неверный логин или пароль')).toBeInTheDocument();
  });

  it('авторизованного пользователя сразу уводит на доску', async () => {
    mockFetch({ 'GET /api/auth/me': anna, 'GET /api/auth/demo-users': [] });
    renderLogin();
    await waitFor(() => expect(screen.getByText('Доска открыта')).toBeInTheDocument());
  });
});
