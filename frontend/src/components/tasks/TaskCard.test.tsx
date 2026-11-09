import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeTask } from '../../test/fixtures';
import { renderWithProviders } from '../../test/utils';
import { TaskCard } from './TaskCard';

describe('TaskCard', () => {
  it('показывает приоритет, оффер и параметры ТЗ', () => {
    renderWithProviders(<TaskCard task={makeTask({ priority: 'urgent' })} />);
    expect(screen.getByText('Срочный')).toBeInTheDocument();
    expect(screen.getByText('Vavada Casino')).toBeInTheDocument();
    expect(screen.getByText('BR · Видео · 5 шт.')).toBeInTheDocument();
    expect(screen.getByText('Без дедлайна')).toBeInTheDocument();
  });

  it('текущая просрочка выделена', () => {
    renderWithProviders(
      <TaskCard task={makeTask({ overdue: 'current', deadline: '2026-11-01T10:00:00Z' })} />,
    );
    expect(screen.getByText('Просрочена')).toBeInTheDocument();
    expect(screen.getByLabelText('Задача 7: Vavada Casino')).toHaveAttribute('data-overdue');
  });

  it('пометка «ТЗ изменено» — только когда есть исполнитель', () => {
    const changed = { brief_updated_at: '2026-11-09T10:00:00Z' };
    const { unmount } = renderWithProviders(<TaskCard task={makeTask(changed)} />);
    expect(screen.queryByText('ТЗ изменено')).not.toBeInTheDocument();
    unmount();

    renderWithProviders(
      <TaskCard
        task={makeTask({
          ...changed,
          status: 'in_progress',
          assignee: { id: 4, full_name: 'Иван Петров' },
        })}
      />,
    );
    expect(screen.getByText('ТЗ изменено')).toBeInTheDocument();
    expect(screen.getByText('ИП')).toBeInTheDocument();
  });

  it('показывает число кругов правок и опоздание сдачи', () => {
    renderWithProviders(<TaskCard task={makeTask({ revision_count: 2, overdue: 'late' })} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Сдана с опозданием')).toBeInTheDocument();
  });
});

describe('TaskCard — перетаскиваемость видна', () => {
  it('перетаскиваемая карточка помечена и показывает значок захвата', () => {
    renderWithProviders(<TaskCard task={makeTask()} draggable />);
    const card = screen.getByLabelText('Задача 7: Vavada Casino');
    expect(card).toHaveAttribute('data-draggable');
    expect(card.querySelector('.tabler-icon-grip-vertical')).not.toBeNull();
  });

  it('неперетаскиваемая — без пометки и значка', () => {
    renderWithProviders(<TaskCard task={makeTask()} />);
    const card = screen.getByLabelText('Задача 7: Vavada Casino');
    expect(card).not.toHaveAttribute('data-draggable');
    expect(card.querySelector('.tabler-icon-grip-vertical')).toBeNull();
  });
});
