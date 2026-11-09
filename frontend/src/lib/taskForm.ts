import dayjs from 'dayjs';

import type { CreativeType, Priority, TaskBrief, TaskDetail } from '../api/tasks';

export interface TaskFormValues {
  offer: string;
  geo: string;
  creative_type: CreativeType;
  quantity: number | string;
  description: string;
  priority: Priority;
  /** Локальная строка «YYYY-MM-DD HH:mm:ss» от DateTimePicker или null. */
  deadline: string | null;
}

const PICKER_FORMAT = 'YYYY-MM-DD HH:mm:ss';

export const toPicker = (iso: string | null) => (iso ? dayjs(iso).format(PICKER_FORMAT) : null);
export const toIso = (local: string | null) => (local ? dayjs(local).toISOString() : null);

/** Быстрый дедлайн: через N дней в 18:00 по местному времени. */
export const quickDeadline = (days: number, now = dayjs()) =>
  now.add(days, 'day').hour(18).minute(0).second(0).format(PICKER_FORMAT);

export function initialValues(task: TaskDetail | null): TaskFormValues {
  return {
    offer: task?.offer ?? '',
    geo: task?.geo ?? '',
    creative_type: task?.creative_type ?? 'video',
    quantity: task?.quantity ?? 1,
    description: task?.description ?? '',
    priority: task?.priority ?? 'normal',
    deadline: toPicker(task?.deadline ?? null),
  };
}

export function toBrief(v: TaskFormValues): TaskBrief {
  return {
    offer: v.offer.trim(),
    geo: v.geo.trim(),
    creative_type: v.creative_type,
    quantity: Number(v.quantity),
    description: v.description.trim(),
    priority: v.priority,
    deadline: toIso(v.deadline),
  };
}

/** Только изменённые поля — чтобы в истории не появлялись пустые правки. */
export function diffBrief(task: TaskDetail, next: TaskBrief): Partial<TaskBrief> {
  const changes: Partial<TaskBrief> = {};
  for (const key of Object.keys(next) as (keyof TaskBrief)[]) {
    // Дедлайн сравниваем после того же преобразования, что прошла форма
    const before =
      key === 'deadline'
        ? toIso(toPicker(task.deadline))
        : typeof task[key] === 'string'
          ? (task[key] as string).trim()
          : task[key];
    if (before !== next[key]) Object.assign(changes, { [key]: next[key] });
  }
  return changes;
}

/** Нужно ли спросить подтверждение «без дедлайна» (решение №8). */
export function needsNoDeadlineConfirm(task: TaskDetail | null, brief: TaskBrief): boolean {
  return !brief.deadline && (task === null || task.deadline !== null);
}
