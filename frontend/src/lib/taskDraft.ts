import { initialValues, type TaskFormValues } from './taskForm';

/** Черновик формы «Новое ТЗ» живёт 30 минут с последнего изменения. */
export const DRAFT_TTL_MS = 30 * 60 * 1000;

export interface TaskDraft {
  values: TaskFormValues;
  /** Ссылки-референсы; файлы в хранилище браузера не сохраняются. */
  links: string[];
  savedAt: number;
}

// Черновик у каждого пользователя свой: на одном компьютере могут работать разные люди
const key = (userId: number) => `affsaints:task-draft:${userId}`;

/** Форма в исходном состоянии — сохранять нечего. */
export function isDraftEmpty(values: TaskFormValues, links: string[]): boolean {
  const empty = initialValues(null);
  const same = (Object.keys(empty) as (keyof TaskFormValues)[]).every(
    (k) => String(values[k] ?? '') === String(empty[k] ?? ''),
  );
  return same && links.length === 0;
}

export function loadDraft(userId: number, now = Date.now()): TaskDraft | null {
  // Хранилище может быть недоступно (приватный режим, запрет сайта) — тогда черновика просто нет
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as TaskDraft;
    // Просроченный или повреждённый черновик удаляем
    if (!draft?.values || typeof draft.savedAt !== 'number' || now - draft.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key(userId));
      return null;
    }
    return {
      values: draft.values,
      links: Array.isArray(draft.links) ? draft.links : [],
      savedAt: draft.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveDraft(
  userId: number,
  values: TaskFormValues,
  links: string[],
  now = Date.now(),
): void {
  try {
    // Пустую форму не храним — иначе «черновик» предлагался бы после простого открытия формы
    if (isDraftEmpty(values, links)) {
      localStorage.removeItem(key(userId));
      return;
    }
    const draft: TaskDraft = { values, links, savedAt: now };
    localStorage.setItem(key(userId), JSON.stringify(draft));
  } catch {
    // Нет места или хранилище запрещено — форма работает и без черновика
  }
}

export function clearDraft(userId: number): void {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    // см. saveDraft
  }
}
