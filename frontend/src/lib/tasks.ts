import dayjs from 'dayjs';

import type { CreativeType, OverdueState, Priority, TaskStatus } from '../api/tasks';

/** Колонки доски по порядку (отменённые — не колонка, а архив). */
export const BOARD_COLUMNS: TaskStatus[] = ['new', 'in_progress', 'review', 'revision', 'done'];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'Новые',
  in_progress: 'В работе',
  review: 'На проверке',
  revision: 'Правки',
  done: 'Готово',
  cancelled: 'Отменена',
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  new: 'gray',
  in_progress: 'blue',
  review: 'yellow',
  revision: 'orange',
  done: 'teal',
  cancelled: 'dark',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочный',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'gray',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
};

export const CREATIVE_TYPE_LABELS: Record<CreativeType, string> = {
  video: 'Видео',
  static: 'Статика',
  animation: 'Анимация / GIF',
  ugc: 'UGC',
  playable: 'Плейабл',
  other: 'Другое',
};

export const OVERDUE_LABELS: Record<Exclude<OverdueState, 'none'>, string> = {
  current: 'Просрочена',
  late: 'Сдана с опозданием',
};

export const toOptions = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

/** Длительность в секундах → «2 ч 15 мин» / «3 д 4 ч» / «12 мин». */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return seconds > 0 ? 'меньше минуты' : '0 мин';
  const minutes = Math.floor(seconds / 60);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours ? `${days} д ${hours} ч` : `${days} д`;
  if (hours > 0) return mins ? `${hours} ч ${mins} мин` : `${hours} ч`;
  return `${mins} мин`;
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dayjs(iso).format('D MMM YYYY, HH:mm') : '—';
}

/** Относительный срок для карточки: «через 2 ч», «просрочено на 1 д». */
export function deadlineHint(iso: string, now: Date = new Date()): string {
  const diff = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  return diff >= 0 ? `через ${formatDuration(diff)}` : `просрочено на ${formatDuration(-diff)}`;
}
