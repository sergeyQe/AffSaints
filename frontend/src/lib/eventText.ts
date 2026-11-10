import type { CreativeType, Priority, TaskEvent } from '../api/tasks';
import { CREATIVE_TYPE_LABELS, formatDateTime, PRIORITY_LABELS, STATUS_LABELS } from './tasks';

const FIELD_NAMES: Record<string, string> = {
  offer: 'Оффер',
  geo: 'GEO',
  creative_type: 'Тип',
  quantity: 'Количество',
  description: 'Описание',
  priority: 'Приоритет',
  deadline: 'Дедлайн',
  service: 'Сервис',
  credits: 'Кредиты',
};

interface Change {
  field: string;
  old: unknown;
  new: unknown;
}

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'priority') return PRIORITY_LABELS[value as Priority] ?? String(value);
  if (field === 'creative_type')
    return CREATIVE_TYPE_LABELS[value as CreativeType] ?? String(value);
  if (field === 'deadline') return formatDateTime(String(value));
  return String(value);
}

/** Изменения полей в читаемом виде: «Количество: 5 → 7». Описание — без текста целиком. */
export function describeChanges(changes: Change[]): string[] {
  return changes.map((c) => {
    const name = FIELD_NAMES[c.field] ?? c.field;
    if (c.field === 'description') return `${name}: изменено`;
    return `${name}: ${formatValue(c.field, c.old)} → ${formatValue(c.field, c.new)}`;
  });
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const person = (v: unknown) =>
  v && typeof v === 'object' && 'full_name' in v ? String(v.full_name) : '—';

export interface EventText {
  title: string;
  details: string[];
  color: string;
}

type Payload = TaskEvent['payload'];
type Formatter = (p: Payload, e: TaskEvent) => EventText;

const kindName = (p: Payload) => (p.kind === 'result' ? 'результат' : 'референс');
const changes = (p: Payload) => describeChanges((p.changes as Change[]) ?? []);
const text = (title: string, color: string, details: string[] = []): EventText => ({
  title,
  details,
  color,
});

// Сдача, подтверждённая исполнителем без приложенного результата
const withoutResult = (p: Payload) => (p.without_result ? ['Без приложенного материала'] : []);

// Перенос руководителем: смена исполнителя, круг правок и комментарий — если были
const movedDetails = (p: Payload, e: TaskEvent) => {
  const details: string[] = [];
  // Откуда и куда перенесли — первой строкой
  if (e.from_status && e.to_status)
    details.push(`${STATUS_LABELS[e.from_status]} → ${STATUS_LABELS[e.to_status]}`);
  if (p.from && p.assignee) details.push(`Исполнитель: ${person(p.from)} → ${person(p.assignee)}`);
  else if (p.assignee) details.push(`Исполнитель: ${person(p.assignee)}`);
  else if (p.from) details.push(`Снят исполнитель: ${person(p.from)}`);
  if (p.round) details.push(`Круг правок ${String(p.round)}`);
  if (p.comment) details.push(`«${str(p.comment)}»`);
  return details;
};

/**
 * Реестр «тип события → как его показать». Новый тип события — новая строка здесь,
 * общая функция describeEvent не меняется.
 */
const FORMATTERS: Record<string, Formatter> = {
  created: () => text('Задача создана', 'gray'),
  updated: (p) => text('ТЗ изменено', 'violet', changes(p)),
  taken: () => text('Взята в работу', 'blue'),
  assigned: (p) => text('Назначен исполнитель', 'blue', [`Исполнитель: ${person(p.to)}`]),
  submitted: (p) => text('Сдана на проверку', 'yellow', withoutResult(p)),
  resubmitted: (p) => text('Исправления сданы на проверку', 'yellow', withoutResult(p)),
  accepted: () => text('Работа принята', 'teal'),
  revision_requested: (p) =>
    text(`Отправлена на правки (круг ${String(p.round ?? '')})`, 'orange', [`«${str(p.comment)}»`]),
  reopened: (p) =>
    text(`Принятая работа возвращена на правки (круг ${String(p.round ?? '')})`, 'orange', [
      `«${str(p.comment)}»`,
    ]),
  cancelled: (p) => text('Задача отменена', 'red', [`Причина: «${str(p.reason)}»`]),
  reassigned: (p) => text('Исполнитель заменён', 'grape', [`${person(p.from)} → ${person(p.to)}`]),
  unassigned: (p) =>
    text('Исполнитель снят, задача вернулась в пул', 'grape', [`Был: ${person(p.from)}`]),
  moved: (p, e) => text('Руководитель перенёс задачу', 'grape', movedDetails(p, e)),
  attachment_added: (p) => text(`Добавлен ${kindName(p)}`, 'cyan', [str(p.name)]),
  attachment_removed: (p) => text(`Удалён ${kindName(p)}`, 'gray', [str(p.name)]),
  ai_usage_added: (p) =>
    text('Указан расход AI', 'indigo', [
      `${str(p.service)}: ${str(p.credits)} кр. (${str(p.user)})`,
    ]),
  ai_usage_updated: (p) => text('Изменён расход AI', 'indigo', changes(p)),
  ai_usage_removed: (p) =>
    text('Удалён расход AI', 'gray', [`${str(p.service)}: ${str(p.credits)} кр.`]),
};

/** Текст события истории — нейтральный по форме (без «создал/создала»). */
export function describeEvent(event: TaskEvent): EventText {
  const format = FORMATTERS[event.type];
  // Неизвестный тип (например, добавили на backend раньше фронта) не ломает историю
  return format ? format(event.payload, event) : text(event.type, 'gray');
}
