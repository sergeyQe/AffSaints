import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useState } from 'react';

import type { Task, TaskStatus, TransitionVars } from '../api/tasks';
import { allowedTargets, dropAction, type DropAction } from '../lib/taskFlow';
import { useRunTransition } from './useRunTransition';

/** Перенос, которому нужен ввод в окне: карточка, колонка и действие backend. */
interface Pending {
  task: Task;
  target: TaskStatus;
  action: DropAction;
}

/**
 * Перетаскивание на доске: какая карточка в руке, куда её можно положить,
 * какое действие backend выполнить при сбросе. Страница доски только отображает.
 */
export function useBoardDnd(onResultRequired: (taskId: number) => void) {
  const [dragged, setDragged] = useState<Task | null>(null);
  // Правкам нужен комментарий — перенос в «Правки» (с проверки или из «Готово») открывает окно ввода
  const [revisionFor, setRevisionFor] = useState<Pending | null>(null);
  // Назначению нужен исполнитель — перенос руководителем из «Новых» открывает выбор креативщика
  const [assignFor, setAssignFor] = useState<Pending | null>(null);
  const { run, isPending } = useRunTransition(onResultRequired);

  const sensors = useSensors(
    // Мышь: небольшой порог — простой клик открывает карточку, а не начинает перетаскивание
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Палец: перетаскивание после удержания 250 мс; короткое движение остаётся прокруткой доски
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (e: DragStartEvent) =>
    setDragged((e.active.data.current as { task: Task }).task);

  const onDragEnd = (e: DragEndEvent) => {
    const task = dragged;
    setDragged(null);
    if (!task || !e.over) return;
    const target = e.over.id as TaskStatus;
    const action = dropAction(task, target);
    if (!action) return;
    const pending = { task, target, action };
    // Из «Новых» в любую колонку нужен исполнитель — сначала окно выбора
    if (action === 'assign' || (action === 'move' && task.status === 'new')) {
      setAssignFor(pending);
      return;
    }
    // Правкам нужен комментарий — сначала окно ввода
    if (action === 'request_revision' || action === 'reopen' || target === 'revision') {
      setRevisionFor(pending);
      return;
    }
    if (action === 'move') {
      run({ id: task.id, action, status: target });
      return;
    }
    run({ id: task.id, action });
  };

  // Из «Готово» — возврат принятой работы, с проверки — обычные правки, иначе — перенос
  const submitRevision = (comment: string) => {
    if (!revisionFor) return;
    const { task, target, action } = revisionFor;
    const vars: TransitionVars =
      action === 'move'
        ? { id: task.id, action, status: target, comment }
        : { id: task.id, action: action === 'reopen' ? 'reopen' : 'request-revision', comment };
    run(vars, () => setRevisionFor(null));
  };

  // В «В работе» — обычное назначение, в другие колонки — перенос с исполнителем
  const submitAssign = (assigneeId: number) => {
    if (!assignFor) return;
    const { task, target, action } = assignFor;
    const vars: TransitionVars =
      action === 'assign'
        ? { id: task.id, action, assignee_id: assigneeId }
        : { id: task.id, action: 'move', status: target, assignee_id: assigneeId };
    run(vars, () => setAssignFor(null));
  };

  return {
    dragged,
    targets: dragged ? allowedTargets(dragged) : [],
    dndProps: { sensors, onDragStart, onDragEnd, onDragCancel: () => setDragged(null) },
    revision: {
      task: revisionFor?.task ?? null,
      isPending,
      submit: submitRevision,
      cancel: () => setRevisionFor(null),
    },
    assign: {
      task: assignFor?.task ?? null,
      target: assignFor?.target ?? null,
      isPending,
      submit: submitAssign,
      cancel: () => setAssignFor(null),
    },
  };
}
