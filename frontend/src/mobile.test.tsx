/** Регрессии проверки мобильной версии (М-2, М-4). */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsPage } from './pages/AnalyticsPage';
import { UsersPage } from './pages/UsersPage';
import { mockFetch, renderWithProviders } from './test/utils';

const anna = { id: 2, login: 'anna', full_name: 'Анна Козлова', roles: ['buyer'], is_active: true };
const head = { id: 1, login: 'head', full_name: 'Олег Смирнов', roles: ['head'], is_active: true };

/** Эмуляция узкого экрана: медиазапрос max-width совпадает. */
function emulatePhone(isPhone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: isPhone && query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe('мобильная версия', () => {
  beforeEach(() => emulatePhone(true));
  afterEach(() => {
    emulatePhone(false);
    vi.unstubAllGlobals();
  });

  it('аналитика на телефоне: период выбирается списком, а не обрезанным переключателем', async () => {
    mockFetch({ 'GET /api/users': [] });
    renderWithProviders(<AnalyticsPage />);

    const select = await screen.findByRole('combobox', { name: 'Период' });
    expect(select).toHaveValue('Месяц');
    expect(screen.queryByRole('radio', { name: 'Квартал' })).not.toBeInTheDocument();
  });

  it('пользователи: нажатие на строку открывает редактирование (кнопка за краем таблицы)', async () => {
    mockFetch({ 'GET /api/users': [anna, head] });
    renderWithProviders(<UsersPage currentUser={head as never} />);

    await userEvent.click(await screen.findByText('Анна Козлова'));

    expect(await screen.findByText('Редактирование')).toBeInTheDocument();
    expect(screen.getByLabelText('Имя')).toHaveValue('Анна Козлова');
  });
});
