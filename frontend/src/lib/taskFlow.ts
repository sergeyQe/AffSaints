import type { Task, TaskAction, TaskStatus } from '../api/tasks';
import { BOARD_COLUMNS } from './tasks';

/** Действие, которое выполняется при перетаскивании карточки в колонку. */
export type DropAction = Extract<
  TaskAction,
  'take' | 'submit' | 'accept' | 'request_revision' | 'unassign'
>;

// Переходы доски: (из статуса, в колонку) → действие backend
const TRANSITIONS: { from: TaskStatus[]; to: TaskStatus; action: DropAction }[] = [
  { from: ['new'], to: 'in_progress', action: 'take' },
  { from: ['in_progress', 'revision'], to: 'review', action: 'submit' },
  { from: ['review'], to: 'done', action: 'accept' },
  { from: ['review'], to: 'revision', action: 'request_revision' },
  { from: ['in_progress', 'revision'], to: 'new', action: 'unassign' },
];

/**
 * Какое действие выполнит перенос карточки в колонку — или null, если перенос запрещён.
 * Права берутся из task.actions, которые прислал backend: фронт их не вычисляет.
 */
export function dropAction(task: Pick<Task, 'status' | 'actions'>, target: TaskStatus) {
  const transition = TRANSITIONS.find((t) => t.from.includes(task.status) && t.to === target);
  return transition && task.actions.includes(transition.action) ? transition.action : null;
}

/** Колонки, куда эту карточку можно перетащить. */
export function allowedTargets(task: Pick<Task, 'status' | 'actions'>): TaskStatus[] {
  return TRANSITIONS.filter((t) => dropAction(task, t.to) !== null).map((t) => t.to);
}

/** Раскладка задач по колонкам доски; порядок внутри колонки задаёт backend. */
export function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const groups = Object.fromEntries(BOARD_COLUMNS.map((s) => [s, [] as Task[]])) as Record<
    TaskStatus,
    Task[]
  >;
  for (const t of tasks) groups[t.status]?.push(t);
  return groups;
}
