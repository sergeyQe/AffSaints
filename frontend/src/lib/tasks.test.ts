import { describe, expect, it } from 'vitest';

import { deadlineHint, formatDuration } from './tasks';

describe('formatDuration', () => {
  it.each([
    [0, '0 мин'],
    [30, 'меньше минуты'],
    [60, '1 мин'],
    [3600, '1 ч'],
    [3600 + 15 * 60, '1 ч 15 мин'],
    [86400, '1 д'],
    [86400 * 3 + 3600 * 4 + 59, '3 д 4 ч'],
  ])('%i сек → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('deadlineHint', () => {
  const now = new Date('2026-11-09T12:00:00Z');

  it('будущий срок', () => {
    expect(deadlineHint('2026-11-09T14:30:00Z', now)).toBe('через 2 ч 30 мин');
  });

  it('прошедший срок', () => {
    expect(deadlineHint('2026-11-08T12:00:00Z', now)).toBe('просрочено на 1 д');
  });
});
