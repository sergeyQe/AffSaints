import { afterEach, describe, expect, it } from 'vitest';

import { DRAFT_TTL_MS, clearDraft, isDraftEmpty, loadDraft, saveDraft } from './taskDraft';
import { initialValues } from './taskForm';

const filled = { ...initialValues(null), offer: 'Pin-Up', geo: 'KZ' };

describe('taskDraft', () => {
  afterEach(() => localStorage.clear());

  it('сохраняет и возвращает черновик пользователя', () => {
    saveDraft(1, filled, ['https://ref'], 1000);
    expect(loadDraft(1, 2000)).toEqual({ values: filled, links: ['https://ref'], savedAt: 1000 });
  });

  it('у каждого пользователя свой черновик', () => {
    saveDraft(1, filled, [], 1000);
    expect(loadDraft(2, 1000)).toBeNull();
  });

  it('живёт 30 минут, просроченный удаляется', () => {
    saveDraft(1, filled, [], 0);
    expect(loadDraft(1, DRAFT_TTL_MS)).not.toBeNull();
    expect(loadDraft(1, DRAFT_TTL_MS + 1)).toBeNull();
    // Удалён насовсем — даже со «старым» временем не вернётся
    expect(loadDraft(1, 0)).toBeNull();
  });

  it('пустую форму не хранит, сброс удаляет черновик', () => {
    expect(isDraftEmpty(initialValues(null), [])).toBe(true);
    saveDraft(1, initialValues(null), [], 0);
    expect(loadDraft(1, 0)).toBeNull();
    saveDraft(1, filled, [], 0);
    clearDraft(1);
    expect(loadDraft(1, 0)).toBeNull();
  });

  it('повреждённые данные не ломают форму', () => {
    localStorage.setItem('affsaints:task-draft:1', '{не json');
    expect(loadDraft(1)).toBeNull();
  });
});
