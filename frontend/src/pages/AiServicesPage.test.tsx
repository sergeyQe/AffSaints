import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonError, mockFetch, renderWithProviders } from '../test/utils';
import { AiServicesPage } from './AiServicesPage';

const services = [
  { id: 1, name: 'Midjourney', is_active: true },
  { id: 2, name: 'Runway', is_active: false },
];

describe('AiServicesPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('показывает активные и отключённые сервисы', async () => {
    mockFetch({ 'GET /api/ai-services': services });
    renderWithProviders(<AiServicesPage />);

    expect(await screen.findByText('Midjourney')).toBeInTheDocument();
    expect(screen.getByText('Доступен')).toBeInTheDocument();
    expect(screen.getByText('Отключён')).toBeInTheDocument();
  });

  it('добавляет сервис и показывает ошибку дубля', async () => {
    const fetch = mockFetch({
      'GET /api/ai-services': services,
      'POST /api/ai-services': (init) => {
        const body = JSON.parse(String(init?.body)) as { name: string };
        return body.name === 'Midjourney'
          ? jsonError(409, 'ai_service_exists', 'Такой сервис уже есть в справочнике')
          : { id: 3, name: body.name, is_active: true };
      },
    });
    renderWithProviders(<AiServicesPage />);
    const input = await screen.findByLabelText('Новый сервис');

    await userEvent.type(input, 'Kling{Enter}');
    await waitFor(() =>
      expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
    expect(await screen.findByText('Сервис «Kling» добавлен')).toBeInTheDocument();

    await userEvent.type(input, 'Midjourney{Enter}');
    expect(await screen.findByText('Такой сервис уже есть в справочнике')).toBeInTheDocument();
  });

  it('переключатель отправляет PATCH с is_active', async () => {
    const fetch = mockFetch({
      'GET /api/ai-services': services,
      'PATCH /api/ai-services/2': { id: 2, name: 'Runway', is_active: true },
    });
    renderWithProviders(<AiServicesPage />);

    await userEvent.click(await screen.findByLabelText('Доступен Runway'));

    await waitFor(() => {
      const call = fetch.mock.calls.find(([url]) => String(url).endsWith('/ai-services/2'));
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ is_active: true });
    });
  });
});
