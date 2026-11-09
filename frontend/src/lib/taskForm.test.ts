import { describe, expect, it } from 'vitest';

import { makeTask } from '../test/fixtures';
import { diffBrief, initialValues, needsNoDeadlineConfirm, toBrief } from './taskForm';

describe('diffBrief', () => {
  it('без изменений — пустой объект (в том числе для дедлайна)', () => {
    const task = makeTask({ deadline: '2026-11-12T15:00:00Z' });
    expect(diffBrief(task, toBrief(initialValues(task)))).toEqual({});
  });

  it('снятие дедлайна передаётся явным null', () => {
    const task = makeTask({ deadline: '2026-11-12T15:00:00Z' });
    const values = { ...initialValues(task), deadline: null };
    expect(diffBrief(task, toBrief(values))).toEqual({ deadline: null });
  });

  it('обрезает пробелы и приводит количество к числу', () => {
    const task = makeTask();
    const values = { ...initialValues(task), offer: '  Vavada Casino ', quantity: '8' };
    expect(diffBrief(task, toBrief(values))).toEqual({ quantity: 8 });
  });
});

describe('needsNoDeadlineConfirm', () => {
  const brief = toBrief(initialValues(null));

  it('новая задача без дедлайна — спросить', () => {
    expect(needsNoDeadlineConfirm(null, brief)).toBe(true);
  });

  it('у задачи и так не было дедлайна — не спрашивать повторно', () => {
    expect(needsNoDeadlineConfirm(makeTask({ deadline: null }), brief)).toBe(false);
  });

  it('дедлайн снимают — спросить', () => {
    expect(needsNoDeadlineConfirm(makeTask({ deadline: '2026-11-12T15:00:00Z' }), brief)).toBe(
      true,
    );
  });
});
