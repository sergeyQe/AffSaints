import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../test/utils';
import { ErrorBoundary } from './ErrorBoundary';

function Broken(): never {
  throw new Error('сломалось');
}

describe('ErrorBoundary', () => {
  it('вместо белого экрана показывает сообщение и кнопку обновления', () => {
    // React логирует пойманную ошибку — в тесте это шум
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithProviders(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить страницу' })).toBeInTheDocument();
    spy.mockRestore();
  });
});
