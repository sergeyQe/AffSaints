import { describe, expect, it } from 'vitest';

import type { TaskEvent } from '../api/tasks';
import { describeChanges, describeEvent } from './eventText';

const event = (type: string, payload: Record<string, unknown> = {}): TaskEvent => ({
  id: 1,
  type,
  payload,
  from_status: null,
  to_status: null,
  actor: null,
  created_at: '2026-11-09T10:00:00Z',
});

describe('describeChanges', () => {
  it('переводит значения справочников', () => {
    expect(
      describeChanges([
        { field: 'priority', old: 'normal', new: 'urgent' },
        { field: 'creative_type', old: 'video', new: 'ugc' },
        { field: 'quantity', old: 5, new: 7 },
        { field: 'deadline', old: null, new: null },
        { field: 'description', old: 'длинный текст', new: 'другой' },
      ]),
    ).toEqual([
      'Приоритет: Обычный → Срочный',
      'Тип: Видео → UGC',
      'Количество: 5 → 7',
      'Дедлайн: — → —',
      'Описание: изменено',
    ]);
  });
});

describe('describeEvent', () => {
  it('правки с комментарием и номером круга', () => {
    const text = describeEvent(event('revision_requested', { comment: 'Крупнее', round: 2 }));
    expect(text.title).toBe('Отправлена на правки (круг 2)');
    expect(text.details).toEqual(['«Крупнее»']);
  });

  it('переназначение', () => {
    const text = describeEvent(
      event('reassigned', { from: { full_name: 'Иван' }, to: { full_name: 'Мария' } }),
    );
    expect(text.details).toEqual(['Иван → Мария']);
  });

  it('вложение-результат', () => {
    expect(
      describeEvent(event('attachment_added', { kind: 'result', name: 'v2.mp4' })),
    ).toMatchObject({ title: 'Добавлен результат', details: ['v2.mp4'] });
  });

  it('неизвестный тип не ломает историю', () => {
    expect(describeEvent(event('something_new')).title).toBe('something_new');
  });
});
