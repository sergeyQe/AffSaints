/**
 * Регрессии ручной проверки через Playwright (П-1…П-5): русская локаль календарей
 * и доступные имена у элементов без текста.
 */
import { DndContext } from '@dnd-kit/core';
import { Drawer, Modal, PasswordInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { BoardColumn } from './components/tasks/BoardColumn';
import { TaskCard } from './components/tasks/TaskCard';
import { makeTask } from './test/fixtures';
import { renderWithProviders } from './test/utils';

describe('П-1: календари на русском', () => {
  it('месяц и дни недели по-русски, неделя с понедельника', async () => {
    renderWithProviders(<DatePickerInput label="Период" type="range" defaultDate="2026-11-01" />);
    await userEvent.click(screen.getByRole('button', { name: 'Период' }));

    expect(await screen.findByText(/ноябрь 2026/i)).toBeInTheDocument();
    const weekdays = [...document.querySelectorAll('thead th, thead td')].map((th) =>
      th.textContent?.trim(),
    );
    expect(weekdays[0]).toMatch(/^пн$/i);
    expect(weekdays[6]).toMatch(/^вс$/i);
  });
});

describe('П-2: карточка без переносов остаётся доступной кнопкой', () => {
  it('нет aria-disabled, есть role=button и фокус', () => {
    const task = makeTask({ status: 'done', actions: [] });
    renderWithProviders(
      <DndContext>
        <BoardColumn
          status="done"
          tasks={[task]}
          canDrop={false}
          isDragActive={false}
          onOpen={() => {}}
        />
      </DndContext>,
    );
    const card = screen.getByRole('button', { name: 'Задача 7: Vavada Casino' });
    expect(card).not.toHaveAttribute('aria-disabled');
    expect(card).toHaveAttribute('tabindex', '0');
    expect(card).toBeEnabled();
  });

  it('перетаскиваемая карточка помечена dnd-kit как draggable', () => {
    const task = makeTask({ status: 'new', actions: ['take'] });
    renderWithProviders(
      <DndContext>
        <BoardColumn
          status="new"
          tasks={[task]}
          canDrop={false}
          isDragActive={false}
          onOpen={() => {}}
        />
      </DndContext>,
    );
    expect(screen.getByRole('button', { name: 'Задача 7: Vavada Casino' })).toHaveAttribute(
      'aria-roledescription',
      'draggable',
    );
  });
});

describe('П-3, П-4: подписи кнопок без текста', () => {
  it('крестики Drawer и Modal называются «Закрыть»', () => {
    renderWithProviders(
      <>
        <Drawer opened onClose={() => {}} title="Карточка" />
        <Modal opened onClose={() => {}} title="Окно" />
      </>,
    );
    expect(screen.getAllByRole('button', { name: 'Закрыть' })).toHaveLength(2);
  });

  it('переключатель видимости пароля подписан по-русски', () => {
    renderWithProviders(<PasswordInput label="Пароль" />);
    expect(screen.getByRole('button', { name: 'Показать или скрыть пароль' })).toBeInTheDocument();
  });
});

describe('П-5: бейдж кругов правок', () => {
  it('имеет подпись для скринридера', () => {
    renderWithProviders(<TaskCard task={makeTask({ revision_count: 2 })} />);
    expect(screen.getByLabelText('Кругов правок: 2')).toBeInTheDocument();
  });
});
