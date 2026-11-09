import type { CreativeType, Priority, TaskEvent } from '../api/tasks';
import { CREATIVE_TYPE_LABELS, formatDateTime, PRIORITY_LABELS } from './tasks';

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

/** Текст события истории — нейтральный по форме (без «создал/создала»). */
export function describeEvent(event: TaskEvent): EventText {
  const p = event.payload;
  const kindName = p.kind === 'result' ? 'результат' : 'референс';
  switch (event.type) {
    case 'created':
      return { title: 'Задача создана', details: [], color: 'gray' };
    case 'updated':
      return {
        title: 'ТЗ изменено',
        details: describeChanges((p.changes as Change[]) ?? []),
        color: 'violet',
      };
    case 'taken':
      return { title: 'Взята в работу', details: [], color: 'blue' };
    case 'submitted':
      return { title: 'Сдана на проверку', details: [], color: 'yellow' };
    case 'resubmitted':
      return { title: 'Исправления сданы на проверку', details: [], color: 'yellow' };
    case 'accepted':
      return { title: 'Работа принята', details: [], color: 'teal' };
    case 'revision_requested':
      return {
        title: `Отправлена на правки (круг ${String(p.round ?? '')})`,
        details: [`«${str(p.comment)}»`],
        color: 'orange',
      };
    case 'cancelled':
      return { title: 'Задача отменена', details: [`Причина: «${str(p.reason)}»`], color: 'red' };
    case 'reassigned':
      return {
        title: 'Исполнитель заменён',
        details: [`${person(p.from)} → ${person(p.to)}`],
        color: 'grape',
      };
    case 'unassigned':
      return {
        title: 'Исполнитель снят, задача вернулась в пул',
        details: [`Был: ${person(p.from)}`],
        color: 'grape',
      };
    case 'attachment_added':
      return { title: `Добавлен ${kindName}`, details: [str(p.name)], color: 'cyan' };
    case 'attachment_removed':
      return { title: `Удалён ${kindName}`, details: [str(p.name)], color: 'gray' };
    case 'ai_usage_added':
      return {
        title: 'Указан расход AI',
        details: [`${str(p.service)}: ${str(p.credits)} кр. (${str(p.user)})`],
        color: 'indigo',
      };
    case 'ai_usage_updated':
      return {
        title: 'Изменён расход AI',
        details: describeChanges((p.changes as Change[]) ?? []),
        color: 'indigo',
      };
    case 'ai_usage_removed':
      return {
        title: 'Удалён расход AI',
        details: [`${str(p.service)}: ${str(p.credits)} кр.`],
        color: 'gray',
      };
    default:
      return { title: event.type, details: [], color: 'gray' };
  }
}
