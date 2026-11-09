import type { Task, TaskAction, TaskStatus } from '../api/tasks';
import { BOARD_COLUMNS } from './tasks';

/** Действие, которое выполняется при перетаскивании карточки в колонку. */
export type DropAction = Extract<
  TaskAction,
  'take' | 'assign' | 'submit' | 'accept' | 'request_revision' | 'reopen' | 'unassign'
>;

// Переходы доски: (из статуса, в колонку) → действие backend.
// В одну колонку может вести несколько действий — выигрывает первое разрешённое
const TRANSITIONS: { from: TaskStatus[]; to: TaskStatus; action: DropAction }[] = [
  { from: ['new'], to: 'in_progress', action: 'take' },
  // Руководитель переносом в «В работе» назначает исполнителя (выбор в окне)
  { from: ['new'], to: 'in_progress', action: 'assign' },
  { from: ['in_progress', 'revision'], to: 'review', action: 'submit' },
  { from: ['review'], to: 'done', action: 'accept' },
  { from: ['review'], to: 'revision', action: 'request_revision' },
  // Руководитель: принятую работу — обратно на правки (с комментарием), любую активную — в пул
  { from: ['done'], to: 'revision', action: 'reopen' },
  { from: ['in_progress', 'review', 'revision'], to: 'new', action: 'unassign' },
];

/**
 * Какое действие выполнит перенос карточки в колонку — или null, если перенос запрещён.
 * Права берутся из task.actions, которые прислал backend: фронт их не вычисляет.
 */
export function dropAction(task: Pick<Task, 'status' | 'actions'>, target: TaskStatus) {
  const transition = TRANSITIONS.find(
    (t) => t.from.includes(task.status) && t.to === target && task.actions.includes(t.action),
  );
  return transition?.action ?? null;
}

/** Колонки, куда эту карточку можно перетащить. */
export function allowedTargets(task: Pick<Task, 'status' | 'actions'>): TaskStatus[] {
  const targets = TRANSITIONS.filter((t) => dropAction(task, t.to) !== null).map((t) => t.to);
  return [...new Set(targets)];
}

/** Раскладка задач по колонкам доски; порядок внутри колонки задаёт backend. */
export function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const groups = Object.fromEntries(BOARD_COLUMNS.map((s) => [s, [] as Task[]])) as Record<
    TaskStatus,
    Task[]
  >;
  for (const t of tasks) groups[t.status]?.push(t);
  // В «Готово» важна свежесть, а не приоритет: последняя принятая работа — сверху
  groups.done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  return groups;
}
