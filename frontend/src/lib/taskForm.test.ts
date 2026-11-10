import { describe, expect, it } from 'vitest';

import dayjs from 'dayjs';

import { makeTask } from '../test/fixtures';
import {
  diffBrief,
  initialValues,
  needsNoDeadlineConfirm,
  shiftDeadline,
  toBrief,
} from './taskForm';

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

describe('shiftDeadline', () => {
  const now = dayjs('2026-11-10T10:25:00');

  it('каждое нажатие сдвигает текущее значение на день или час', () => {
    const value = '2026-11-12 18:00:00';
    expect(shiftDeadline(value, 1, 'day', now)).toBe('2026-11-13 18:00:00');
    expect(shiftDeadline(value, -1, 'day', now)).toBe('2026-11-11 18:00:00');
    expect(shiftDeadline(value, 1, 'hour', now)).toBe('2026-11-12 19:00:00');
    expect(shiftDeadline(value, -1, 'hour', now)).toBe('2026-11-12 17:00:00');
    expect(shiftDeadline(value, 1, 'week', now)).toBe('2026-11-19 18:00:00');
    expect(shiftDeadline('2026-11-20 18:00:00', -1, 'week', now)).toBe('2026-11-13 18:00:00');
  });

  it('пустой дедлайн: «плюс» — от начала текущего часа, «минус» недоступен', () => {
    expect(shiftDeadline(null, 1, 'hour', now)).toBe('2026-11-10 11:00:00');
    expect(shiftDeadline(null, 1, 'day', now)).toBe('2026-11-11 10:00:00');
    expect(shiftDeadline(null, -1, 'hour', now)).toBeNull();
  });

  it('в прошлое не уходит', () => {
    const value7 = '2026-11-16 18:00:00';
    expect(shiftDeadline('2026-11-10 11:00:00', -1, 'hour', now)).toBeNull();
    expect(shiftDeadline('2026-11-11 09:00:00', -1, 'day', now)).toBeNull();
    expect(shiftDeadline(value7, -1, 'week', now)).toBeNull();
    expect(shiftDeadline('2026-11-11 11:00:00', -1, 'day', now)).toBe('2026-11-10 11:00:00');
  });
});
