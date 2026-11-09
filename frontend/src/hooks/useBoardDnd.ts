import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useState } from 'react';

import type { Task, TaskStatus } from '../api/tasks';
import { allowedTargets, dropAction } from '../lib/taskFlow';
import { useRunTransition } from './useRunTransition';

/**
 * Перетаскивание на доске: какая карточка в руке, куда её можно положить,
 * какое действие backend выполнить при сбросе. Страница доски только отображает.
 */
export function useBoardDnd(onResultRequired: (taskId: number) => void) {
  const [dragged, setDragged] = useState<Task | null>(null);
  // Правкам нужен комментарий — перенос в «Правки» открывает окно ввода
  const [revisionFor, setRevisionFor] = useState<Task | null>(null);
  const { run, isPending } = useRunTransition(onResultRequired);

  const sensors = useSensors(
    // Небольшой порог: простой клик открывает карточку, а не начинает перетаскивание
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (e: DragStartEvent) =>
    setDragged((e.active.data.current as { task: Task }).task);

  const onDragEnd = (e: DragEndEvent) => {
    const task = dragged;
    setDragged(null);
    if (!task || !e.over) return;
    const action = dropAction(task, e.over.id as TaskStatus);
    if (!action) return;
    if (action === 'request_revision') {
      setRevisionFor(task);
      return;
    }
    run({ id: task.id, action });
  };

  const submitRevision = (comment: string) =>
    revisionFor &&
    run({ id: revisionFor.id, action: 'request-revision', comment }, () => setRevisionFor(null));

  return {
    dragged,
    targets: dragged ? allowedTargets(dragged) : [],
    dndProps: { sensors, onDragStart, onDragEnd, onDragCancel: () => setDragged(null) },
    revision: {
      task: revisionFor,
      isPending,
      submit: submitRevision,
      cancel: () => setRevisionFor(null),
    },
  };
}
