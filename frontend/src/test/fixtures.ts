import type { TaskDetail } from '../api/tasks';

export function makeTask(patch: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: 7,
    offer: 'Vavada Casino',
    geo: 'BR',
    creative_type: 'video',
    quantity: 5,
    description: 'Вертикаль 15 сек',
    priority: 'normal',
    deadline: null,
    status: 'new',
    author: { id: 1, full_name: 'Анна Козлова' },
    assignee: null,
    created_at: '2026-11-09T09:00:00Z',
    updated_at: '2026-11-09T09:00:00Z',
    taken_at: null,
    first_submitted_at: null,
    last_submitted_at: null,
    completed_at: null,
    cancelled_at: null,
    cancel_reason: null,
    revision_count: 0,
    revision_comment: null,
    brief_updated_at: null,
    overdue: 'none',
    actions: [],
    work_seconds: 0,
    ...patch,
  };
}
