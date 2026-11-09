import { describe, expect, it } from 'vitest';

import type { TaskAction, TaskStatus } from '../api/tasks';
import { makeTask } from '../test/fixtures';
import { allowedTargets, dropAction, groupByStatus } from './taskFlow';

const task = (status: TaskStatus, actions: TaskAction[]) => ({ status, actions });

describe('dropAction', () => {
  it('креативщик берёт новую задачу переносом в «В работе»', () => {
    expect(dropAction(task('new', ['take']), 'in_progress')).toBe('take');
  });

  it('руководитель переносом в «В работе» назначает исполнителя', () => {
    const head = task('new', ['assign', 'edit', 'cancel']);
    expect(dropAction(head, 'in_progress')).toBe('assign');
    expect(allowedTargets(head)).toEqual(['in_progress']);
    // Если доступны оба действия — «Взять» в приоритете, колонка в целях одна
    const both = task('new', ['take', 'assign']);
    expect(dropAction(both, 'in_progress')).toBe('take');
    expect(allowedTargets(both)).toEqual(['in_progress']);
  });

  it('руководитель возвращает задачу с проверки в пул', () => {
    const t = task('review', ['accept', 'request_revision', 'unassign', 'reassign']);
    expect(dropAction(t, 'new')).toBe('unassign');
    expect(allowedTargets(t)).toEqual(['done', 'revision', 'new']);
  });

  it('руководитель возвращает принятую работу на правки', () => {
    const t = task('done', ['reopen', 'manage_ai_usage']);
    expect(dropAction(t, 'revision')).toBe('reopen');
    expect(allowedTargets(t)).toEqual(['revision']);
    // Без права — из «Готово» никуда
    expect(allowedTargets(task('done', ['manage_ai_usage']))).toEqual([]);
  });

  it('без права на действие перенос запрещён', () => {
    // Байер видит новую задачу, но взять её не может
    expect(dropAction(task('new', ['edit', 'cancel']), 'in_progress')).toBeNull();
  });

  it('сдача из «В работе» и из «Правок»', () => {
    expect(dropAction(task('in_progress', ['submit']), 'review')).toBe('submit');
    expect(dropAction(task('revision', ['submit']), 'review')).toBe('submit');
  });

  it('проверка: принять или отправить на правки', () => {
    const t = task('review', ['accept', 'request_revision']);
    expect(dropAction(t, 'done')).toBe('accept');
    expect(dropAction(t, 'revision')).toBe('request_revision');
  });

  it('прыжки через статусы запрещены', () => {
    const t = task('new', ['take', 'accept', 'submit']);
    expect(dropAction(t, 'done')).toBeNull();
    expect(dropAction(t, 'review')).toBeNull();
  });

  it('руководитель возвращает задачу в пул', () => {
    expect(dropAction(task('in_progress', ['unassign']), 'new')).toBe('unassign');
  });
});

describe('groupByStatus', () => {
  it('«Готово» — по дате завершения, новые сверху; остальные колонки — в порядке backend', () => {
    const groups = groupByStatus([
      makeTask({ id: 1, status: 'done', completed_at: '2026-11-01T10:00:00Z' }),
      makeTask({ id: 2, status: 'new' }),
      makeTask({ id: 3, status: 'done', completed_at: '2026-11-08T10:00:00Z' }),
      makeTask({ id: 4, status: 'new' }),
    ]);
    expect(groups.done.map((t) => t.id)).toEqual([3, 1]);
    expect(groups.new.map((t) => t.id)).toEqual([2, 4]);
    expect(groups.cancelled).toBeUndefined();
  });
});

describe('allowedTargets', () => {
  it('для руководителя в «Правках» — сдать нельзя, вернуть в пул можно', () => {
    expect(allowedTargets(task('revision', ['unassign', 'reassign', 'edit']))).toEqual(['new']);
  });

  it('у закрытой задачи целей нет', () => {
    expect(allowedTargets(task('done', []))).toEqual([]);
  });
});
