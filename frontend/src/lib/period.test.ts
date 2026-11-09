import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { presetPeriod, rangePeriod } from './period';

// Среда, 11 ноября 2026, 15:30 по местному времени
const now = dayjs('2026-11-11T15:30:00');
const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD HH:mm');

describe('presetPeriod', () => {
  it('сегодня', () => {
    const p = presetPeriod('today', now);
    expect([fmt(p.from), fmt(p.to)]).toEqual(['2026-11-11 00:00', '2026-11-12 00:00']);
  });

  it('неделя начинается с понедельника', () => {
    const p = presetPeriod('week', now);
    expect([fmt(p.from), fmt(p.to)]).toEqual(['2026-11-09 00:00', '2026-11-16 00:00']);
  });

  it('неделя в воскресенье — та же неделя', () => {
    const p = presetPeriod('week', dayjs('2026-11-15T10:00:00'));
    expect(fmt(p.from)).toBe('2026-11-09 00:00');
  });

  it('месяц', () => {
    const p = presetPeriod('month', now);
    expect([fmt(p.from), fmt(p.to)]).toEqual(['2026-11-01 00:00', '2026-12-01 00:00']);
  });

  it('квартал', () => {
    const p = presetPeriod('quarter', now);
    expect([fmt(p.from), fmt(p.to)]).toEqual(['2026-10-01 00:00', '2027-01-01 00:00']);
  });
});

describe('rangePeriod', () => {
  it('включает последний день целиком', () => {
    const p = rangePeriod('2026-11-03', '2026-11-17');
    expect([fmt(p.from), fmt(p.to)]).toEqual(['2026-11-03 00:00', '2026-11-18 00:00']);
  });
});
