import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Badge, Group, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';

import type { Task, TaskStatus } from '../../api/tasks';
import { allowedTargets } from '../../lib/taskFlow';
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/tasks';
import classes from './BoardColumn.module.css';
import { TaskCard } from './TaskCard';

function DraggableCard({ task, onOpen }: { task: Task; onOpen: (id: number) => void }) {
  const canDrag = allowedTargets(task).length > 0;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !canDrag,
  });
  // Без доступных переносов атрибуты dnd-kit не нужны: он пометил бы карточку aria-disabled,
  // и скринридер объявил бы её недоступной, хотя она открывается
  const dragProps = canDrag ? { ...attributes, ...listeners } : { role: 'button', tabIndex: 0 };
  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.35 : 1 }}>
      <TaskCard
        task={task}
        {...dragProps}
        onClick={() => onOpen(task.id)}
        // Enter открывает карточку, остальные клавиши (пробел — перенос) отдаём dnd-kit
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onOpen(task.id);
            return;
          }
          if (canDrag) listeners?.onKeyDown?.(e);
        }}
      />
    </div>
  );
}

interface Props {
  status: TaskStatus;
  tasks: Task[];
  /** Колонка — допустимая цель для перетаскиваемой сейчас карточки. */
  canDrop: boolean;
  isDragActive: boolean;
  onOpen: (id: number) => void;
}

export function BoardColumn({ status, tasks, canDrop, isDragActive, onOpen }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !canDrop });
  const creatives = tasks.reduce((sum, t) => sum + t.quantity, 0);

  return (
    <div
      ref={setNodeRef}
      className={classes.column}
      data-can-drop={(isDragActive && canDrop) || undefined}
      data-disabled={(isDragActive && !canDrop) || undefined}
      data-over={(isOver && canDrop) || undefined}
      aria-label={`Колонка ${STATUS_LABELS[status]}`}
    >
      {/* Шапка в одну строку: на планшете колонка узкая (210 px), счётчик не должен переноситься */}
      <Group justify="space-between" px="sm" pt="sm" pb={6} wrap="nowrap" gap={4}>
        <Group gap={6} wrap="nowrap">
          <Badge color={STATUS_COLORS[status]} variant="dot" size="md" radius="sm">
            {STATUS_LABELS[status]}
          </Badge>
          <Text size="sm" c="dimmed" fw={500}>
            {tasks.length}
          </Text>
        </Group>
        {tasks.length > 0 && (
          <Tooltip label="Креативов в колонке">
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {creatives} шт.
            </Text>
          </Tooltip>
        )}
      </Group>
      <ScrollArea.Autosize mah="calc(100vh - 230px)" type="auto" offsetScrollbars>
        <Stack gap="xs" p="xs" pt={4} mih={80}>
          {tasks.map((t) => (
            <DraggableCard key={t.id} task={t} onOpen={onOpen} />
          ))}
          {tasks.length === 0 && (
            <Text size="xs" c="dimmed" ta="center" py="md">
              Пусто
            </Text>
          )}
        </Stack>
      </ScrollArea.Autosize>
    </div>
  );
}
