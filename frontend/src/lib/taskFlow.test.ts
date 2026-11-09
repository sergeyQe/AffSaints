import { describe, expect, it } from 'vitest';

import type { TaskAction, TaskStatus } from '../api/tasks';
import { allowedTargets, dropAction } from './taskFlow';

const task = (status: TaskStatus, actions: TaskAction[]) => ({ status, actions });

describe('dropAction', () => {
  it('креативщик берёт новую задачу переносом в «В работе»', () => {
    expect(dropAction(task('new', ['take']), 'in_progress')).toBe('take');
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

describe('allowedTargets', () => {
  it('для руководителя в «Правках» — сдать нельзя, вернуть в пул можно', () => {
    expect(allowedTargets(task('revision', ['unassign', 'reassign', 'edit']))).toEqual(['new']);
  });

  it('у закрытой задачи целей нет', () => {
    expect(allowedTargets(task('done', []))).toEqual([]);
  });
});
