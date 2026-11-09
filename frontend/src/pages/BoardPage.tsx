import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Alert, Box, Button, Center, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { useMe } from '../api/auth';
import {
  useTasks,
  type Task,
  type TaskDetail,
  type TaskFilters,
  type TaskStatus,
} from '../api/tasks';
import { BoardColumn } from '../components/tasks/BoardColumn';
import { BoardFilters } from '../components/tasks/BoardFilters';
import { TaskCard } from '../components/tasks/TaskCard';
import { TextPromptModal } from '../components/tasks/TaskActions';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { useRunTransition } from '../hooks/useRunTransition';
import { useTaskDrawer } from '../hooks/useTaskDrawer';
import { errorMessage } from '../lib/notify';
import { hasRole } from '../lib/roles';
import { allowedTargets, dropAction, groupByStatus } from '../lib/taskFlow';
import { BOARD_COLUMNS } from '../lib/tasks';

export function BoardPage() {
  const me = useMe();
  const [filters, setFilters] = useState<TaskFilters>({});
  const tasks = useTasks(filters);
  const drawer = useTaskDrawer();
  // undefined — форма закрыта, null — новая задача, TaskDetail — редактирование
  const [form, setForm] = useState<TaskDetail | null | undefined>(undefined);
  const [dragged, setDragged] = useState<Task | null>(null);
  const [revisionFor, setRevisionFor] = useState<Task | null>(null);
  // Сдать не дали без результата — открываем файлы именно этой задачи
  const { run, isPending } = useRunTransition((taskId) => drawer.open(taskId, 'files'));

  const sensors = useSensors(
    // Небольшой порог: простой клик открывает карточку, а не начинает перетаскивание
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const groups = useMemo(() => groupByStatus(tasks.data ?? []), [tasks.data]);
  const targets = dragged ? allowedTargets(dragged) : [];
  const canCreate = hasRole(me.data, 'buyer', 'head');

  const onDragStart = (e: DragStartEvent) =>
    setDragged((e.active.data.current as { task: Task }).task);

  const onDragEnd = (e: DragEndEvent) => {
    const task = dragged;
    setDragged(null);
    if (!task || !e.over) return;
    const action = dropAction(task, e.over.id as TaskStatus);
    if (!action) return;
    // Правкам нужен комментарий — спрашиваем
    if (action === 'request_revision') {
      setRevisionFor(task);
      return;
    }
    run({ id: task.id, action });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={3}>Доска задач</Title>
          <Text size="sm" c="dimmed">
            Перетащите карточку в соседнюю колонку или откройте её для всех действий.
          </Text>
        </div>
        {canCreate && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setForm(null)}>
            Новое ТЗ
          </Button>
        )}
      </Group>

      <BoardFilters value={filters} onChange={setFilters} />

      {tasks.isError && (
        <Alert color="red" variant="light">
          Не удалось загрузить задачи: {errorMessage(tasks.error)}
        </Alert>
      )}

      {tasks.isPending && (
        <Center py="xl">
          <Loader />
        </Center>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragged(null)}
      >
        <Box style={{ overflowX: 'auto' }} pb="xs">
          <Group align="flex-start" wrap="nowrap" gap="sm" miw={5 * 222}>
            {BOARD_COLUMNS.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                tasks={groups[status]}
                canDrop={targets.includes(status)}
                isDragActive={dragged !== null}
                onOpen={(id) => drawer.open(id)}
              />
            ))}
          </Group>
        </Box>
        <DragOverlay dropAnimation={null}>
          {dragged && <TaskCard task={dragged} dragging />}
        </DragOverlay>
      </DndContext>

      <Text size="xs" c="dimmed">
        В «Готово» — задачи, завершённые за последние 30 дней. Доска обновляется автоматически.
      </Text>

      <TaskDrawer
        taskId={drawer.taskId}
        tab={drawer.tab}
        onTabChange={drawer.setTab}
        onClose={drawer.close}
        onEdit={(t) => setForm(t)}
      />

      {form !== undefined && (
        <TaskFormModal
          task={form}
          onClose={() => setForm(undefined)}
          onCreated={(t) => drawer.open(t.id, 'files')}
        />
      )}

      <TextPromptModal
        key={`board-revision-${revisionFor?.id ?? 0}`}
        opened={revisionFor !== null}
        title={`Отправить на правки: ${revisionFor?.offer ?? ''}`}
        label="Что исправить"
        description="Комментарий увидит исполнитель; он же сохранится в истории задачи."
        confirm="Отправить на правки"
        color="orange"
        loading={isPending}
        onClose={() => setRevisionFor(null)}
        onSubmit={(comment) =>
          revisionFor &&
          run({ id: revisionFor.id, action: 'request-revision', comment }, () =>
            setRevisionFor(null),
          )
        }
      />
    </Stack>
  );
}
