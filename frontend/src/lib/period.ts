import dayjs, { type Dayjs } from 'dayjs';

export type PeriodPreset = 'today' | 'week' | 'month' | 'quarter' | 'custom';

export const PRESET_LABELS: Record<Exclude<PeriodPreset, 'custom'>, string> = {
  today: 'Сегодня',
  week: 'Неделя',
  month: 'Месяц',
  quarter: 'Квартал',
};

export interface Period {
  from: Dayjs;
  /** Граница не включается: [from, to). */
  to: Dayjs;
}

/** Текущие календарные периоды в местном времени (неделя — с понедельника). */
export function presetPeriod(preset: Exclude<PeriodPreset, 'custom'>, now = dayjs()): Period {
  const day = now.startOf('day');
  switch (preset) {
    case 'today':
      return { from: day, to: day.add(1, 'day') };
    case 'week': {
      const monday = day.subtract((day.day() + 6) % 7, 'day');
      return { from: monday, to: monday.add(7, 'day') };
    }
    case 'month':
      return { from: day.startOf('month'), to: day.startOf('month').add(1, 'month') };
    case 'quarter': {
      const start = day.startOf('month').month(Math.floor(day.month() / 3) * 3);
      return { from: start, to: start.add(3, 'month') };
    }
  }
}

/** Произвольный диапазон дат «с … по …» включительно → [начало первого дня, начало дня после последнего). */
export function rangePeriod(start: string, end: string): Period {
  const from = dayjs(start).startOf('day');
  const to = dayjs(end).startOf('day').add(1, 'day');
  return { from, to };
}

export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
