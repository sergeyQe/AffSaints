import { DndContext, DragOverlay } from '@dnd-kit/core';
import { Alert, Box, Button, Center, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { useMe } from '../api/auth';
import { useTasks, type TaskDetail, type TaskFilters } from '../api/tasks';
import { BoardColumn } from '../components/tasks/BoardColumn';
import { BoardFilters } from '../components/tasks/BoardFilters';
import { TaskCard } from '../components/tasks/TaskCard';
import { TextPromptModal } from '../components/common/TextPromptModal';
import { ReassignModal } from '../components/tasks/ReassignModal';
import { SubmitWithoutResultModal } from '../components/tasks/SubmitWithoutResultModal';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { useBoardDnd } from '../hooks/useBoardDnd';
import { useTaskDrawer } from '../hooks/useTaskDrawer';
import { errorMessage } from '../lib/notify';
import { hasRole } from '../lib/roles';
import { groupByStatus } from '../lib/taskFlow';
import { BOARD_COLUMNS } from '../lib/tasks';

export function BoardPage() {
  const me = useMe();
  const [filters, setFilters] = useState<TaskFilters>({});
  const tasks = useTasks(filters);
  const drawer = useTaskDrawer();
  // undefined — форма закрыта, null — новая задача, TaskDetail — редактирование
  const [form, setForm] = useState<TaskDetail | null | undefined>(undefined);
  // Сдать не дали без результата — открываем файлы именно этой задачи
  const { dragged, targets, dndProps, revision, assign, noResult } = useBoardDnd((taskId) =>
    drawer.open(taskId, 'files'),
  );

  const groups = useMemo(() => groupByStatus(tasks.data ?? []), [tasks.data]);
  const canCreate = hasRole(me.data, 'buyer', 'head');

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={3}>Доска задач</Title>
          <Text size="sm" c="dimmed">
            Перетащите карточку со значком ⋮⋮ в соседнюю колонку (на телефоне — нажмите и
            удерживайте) или откройте её для всех действий.
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

      <DndContext {...dndProps}>
        <Box style={{ overflowX: 'auto' }} pb="xs">
          {/* Колонки одной высоты: бросить карточку можно в любом месте колонки, а не только на карточки */}
          <Group align="stretch" wrap="nowrap" gap="sm" miw={5 * 222}>
            {BOARD_COLUMNS.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                tasks={groups[status]}
                canDrop={targets.includes(status)}
                isDragActive={dragged !== null}
                isDragSource={dragged?.status === status}
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
        key={`board-revision-${revision.task?.id ?? 0}`}
        opened={revision.task !== null}
        title={`Отправить на правки: ${revision.task?.offer ?? ''}`}
        label="Что исправить"
        description={
          revision.task?.status === 'done'
            ? 'Работа уже принята. Задача вернётся исполнителю новым кругом правок и перестанет считаться завершённой.'
            : 'Комментарий увидит исполнитель; он же сохранится в истории задачи.'
        }
        confirm="Отправить на правки"
        color="orange"
        loading={revision.isPending}
        onClose={revision.cancel}
        onSubmit={revision.submit}
      />

      {assign.task && (
        <ReassignModal
          key={`board-assign-${assign.task.id}`}
          task={assign.task}
          target={assign.target ?? undefined}
          opened
          loading={assign.isPending}
          onClose={assign.cancel}
          onSubmit={assign.submit}
        />
      )}

      {noResult.taskId !== null && (
        <SubmitWithoutResultModal
          loading={noResult.loading}
          onAttach={noResult.attach}
          onConfirm={noResult.confirm}
          onClose={noResult.cancel}
        />
      )}
    </Stack>
  );
}
