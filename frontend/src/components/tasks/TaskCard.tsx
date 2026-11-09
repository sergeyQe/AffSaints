import { Avatar, Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import {
  IconAlertTriangle,
  IconClock,
  IconEdit,
  IconGripVertical,
  IconRepeat,
} from '@tabler/icons-react';
import type { CSSProperties, HTMLAttributes } from 'react';

import type { Task } from '../../api/tasks';
import { initials } from '../../lib/format';
import {
  CREATIVE_TYPE_LABELS,
  deadlineHint,
  formatDateTime,
  OVERDUE_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
} from '../../lib/tasks';
import classes from './TaskCard.module.css';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'draggable'> {
  task: Task;
  dragging?: boolean;
  /** Карточку можно перетащить — показываем курсор «рука» и значок захвата. */
  draggable?: boolean;
  style?: CSSProperties;
}

export function TaskCard({ task, dragging, draggable, style, ...rest }: Props) {
  // ТЗ правили после взятия в работу — показываем исполнителю пометку
  const briefChanged = task.brief_updated_at !== null && task.assignee !== null;
  const deadlineColor = task.overdue === 'current' ? 'red' : 'dimmed';

  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      className={classes.card}
      data-overdue={task.overdue === 'current' || undefined}
      data-dragging={dragging || undefined}
      data-draggable={draggable || undefined}
      style={style}
      aria-label={`Задача ${task.id}: ${task.offer}`}
      {...rest}
    >
      <Stack gap={6}>
        <Group justify="space-between" gap={4} wrap="nowrap">
          <Badge size="xs" color={PRIORITY_COLORS[task.priority]} variant="light">
            {PRIORITY_LABELS[task.priority]}
          </Badge>
          <Group gap={2} wrap="nowrap">
            <Text size="xs" c="dimmed">
              #{task.id}
            </Text>
            {draggable && (
              <Tooltip label="Можно перетащить в другую колонку">
                <IconGripVertical size={14} className={classes.grip} aria-hidden />
              </Tooltip>
            )}
          </Group>
        </Group>

        <Text fw={600} size="sm" lineClamp={2}>
          {task.offer}
        </Text>
        <Text size="xs" c="dimmed">
          {task.geo} · {CREATIVE_TYPE_LABELS[task.creative_type]} · {task.quantity} шт.
        </Text>

        <Group gap={4}>
          {task.overdue !== 'none' && (
            <Badge
              size="xs"
              color={task.overdue === 'current' ? 'red' : 'orange'}
              leftSection={<IconAlertTriangle size={10} />}
            >
              {OVERDUE_LABELS[task.overdue]}
            </Badge>
          )}
          {briefChanged && (
            <Badge size="xs" color="violet" variant="outline" leftSection={<IconEdit size={10} />}>
              ТЗ изменено
            </Badge>
          )}
          {task.revision_count > 0 && (
            <Tooltip label="Кругов правок">
              <Badge
                size="xs"
                color="orange"
                variant="light"
                aria-label={`Кругов правок: ${task.revision_count}`}
                leftSection={<IconRepeat size={10} />}
              >
                {task.revision_count}
              </Badge>
            </Tooltip>
          )}
        </Group>

        <Group justify="space-between" gap={4} wrap="nowrap">
          {task.deadline ? (
            <Tooltip label={formatDateTime(task.deadline)}>
              <Group gap={4} wrap="nowrap">
                <IconClock
                  size={12}
                  color={`var(--mantine-color-${task.overdue === 'current' ? 'red-6' : 'gray-6'})`}
                />
                <Text size="xs" c={deadlineColor}>
                  {task.status === 'done' || task.first_submitted_at
                    ? formatDateTime(task.deadline)
                    : deadlineHint(task.deadline)}
                </Text>
              </Group>
            </Tooltip>
          ) : (
            <Text size="xs" c="dimmed">
              Без дедлайна
            </Text>
          )}
          {task.assignee && (
            <Tooltip label={task.assignee.full_name}>
              <Avatar size={22} radius="xl" color="grape">
                {initials(task.assignee.full_name)}
              </Avatar>
            </Tooltip>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}
