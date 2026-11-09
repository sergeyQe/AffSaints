import { notifications } from '@mantine/notifications';

import { ApiError } from '../api/client';

// Человеческие названия полей для ошибок валидации backend
const FIELD_LABELS: Record<string, string> = {
  login: 'Логин',
  password: 'Пароль',
  full_name: 'Имя',
  roles: 'Роли',
  offer: 'Оффер',
  geo: 'GEO',
  creative_type: 'Тип креатива',
  quantity: 'Количество',
  description: 'Описание',
  priority: 'Приоритет',
  deadline: 'Дедлайн',
  comment: 'Комментарий',
  reason: 'Причина',
  url: 'Ссылка',
  credits: 'Кредиты',
  name: 'Название',
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    // Для ошибок валидации показываем первое конкретное сообщение
    const first = e.details?.[0];
    if (!first) return e.message;
    const field = FIELD_LABELS[first.field] ?? first.field;
    return field ? `${field}: ${first.message}` : first.message;
  }
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}

export function notifyError(e: unknown, title = 'Ошибка') {
  notifications.show({ color: 'red', title, message: errorMessage(e) });
}

export function notifySuccess(message: string) {
  notifications.show({ color: 'teal', message });
}
