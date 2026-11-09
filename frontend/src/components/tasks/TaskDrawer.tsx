import {
  Alert,
  Badge,
  Center,
  Divider,
  Drawer,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconEdit,
  IconHistory,
  IconInfoCircle,
  IconPaperclip,
  IconRepeat,
  IconRobot,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { ApiError } from '../../api/client';
import { useTask, type TaskDetail } from '../../api/tasks';
import { errorMessage } from '../../lib/notify';
import {
  CREATIVE_TYPE_LABELS,
  formatDateTime,
  formatDuration,
  OVERDUE_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from '../../lib/tasks';
import { AiUsagePanel } from './AiUsagePanel';
import { AttachmentsPanel } from './AttachmentsPanel';
import { HistoryPanel } from './HistoryPanel';
import { TaskActions } from './TaskActions';

export type DrawerTab = 'details' | 'files' | 'ai' | 'history';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" component="div">
        {children}
      </Text>
    </div>
  );
}

function Details({ task }: { task: TaskDetail }) {
  return (
    <Stack>
      {task.status === 'revision' && task.revision_comment && (
        <Alert color="orange" variant="light" icon={<IconRepeat size={18} />} title="Правки">
          {task.revision_comment}
        </Alert>
      )}
      {task.brief_updated_at && task.assignee && (
        <Alert color="violet" variant="light" icon={<IconEdit size={18} />} title="ТЗ изменено">
          ТЗ меняли {formatDateTime(task.brief_updated_at)}, уже после взятия в работу. Что именно
          поменялось — во вкладке «История».
        </Alert>
      )}
      {task.status === 'cancelled' && (
        <Alert color="red" variant="light" title="Задача отменена">
          {task.cancel_reason}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md" verticalSpacing="sm">
        <Field label="GEO">{task.geo}</Field>
        <Field label="Тип креатива">{CREATIVE_TYPE_LABELS[task.creative_type]}</Field>
        <Field label="Количество">{task.quantity} шт.</Field>
        <Field label="Приоритет">
          <Badge size="sm" variant="light" color={PRIORITY_COLORS[task.priority]}>
            {PRIORITY_LABELS[task.priority]}
          </Badge>
        </Field>
        <Field label="Дедлайн">
          <Group gap={6}>
            {task.deadline ? formatDateTime(task.deadline) : 'Не указан'}
            {task.overdue !== 'none' && (
              <Badge
                size="xs"
                color={task.overdue === 'current' ? 'red' : 'orange'}
                leftSection={<IconAlertTriangle size={10} />}
              >
                {OVERDUE_LABELS[task.overdue]}
              </Badge>
            )}
          </Group>
        </Field>
        <Field label="Время работы">{formatDuration(task.work_seconds)}</Field>
        <Field label="Байер">{task.author.full_name}</Field>
        <Field label="Исполнитель">{task.assignee?.full_name ?? 'Не назначен'}</Field>
        <Field label="Кругов правок">{task.revision_count}</Field>
      </SimpleGrid>

      <Divider />
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <Field label="Создана">{formatDateTime(task.created_at)}</Field>
        <Field label="Взята в работу">{formatDateTime(task.taken_at)}</Field>
        <Field label="Первая сдача">{formatDateTime(task.first_submitted_at)}</Field>
        {/* После правок — когда сдали исправленное */}
        {task.last_submitted_at && task.last_submitted_at !== task.first_submitted_at && (
          <Field label="Последняя сдача">{formatDateTime(task.last_submitted_at)}</Field>
        )}
        <Field label="Завершена">{formatDateTime(task.completed_at)}</Field>
      </SimpleGrid>

      <Divider />
      <div>
        <Text size="xs" c="dimmed" mb={4}>
          Описание
        </Text>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {task.description || '—'}
        </Text>
      </div>
    </Stack>
  );
}

interface Props {
  taskId: number | null;
  tab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
  onEdit: (task: TaskDetail) => void;
}

export function TaskDrawer({ taskId, tab, onTabChange, onClose, onEdit }: Props) {
  const query = useTask(taskId);
  const task = query.data;
  const notFound = query.error instanceof ApiError && query.error.status === 404;

  return (
    <Drawer
      opened={taskId !== null}
      onClose={onClose}
      position="right"
      size="xl"
      title={
        task && (
          <Group gap="xs">
            <Badge color={STATUS_COLORS[task.status]} variant="light">
              {STATUS_LABELS[task.status]}
            </Badge>
            <Text c="dimmed" size="sm">
              #{task.id}
            </Text>
          </Group>
        )
      }
    >
      {!task && !query.isError && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {notFound && <Text c="dimmed">Задача не найдена.</Text>}
      {!task && query.isError && !notFound && (
        <Alert color="red" variant="light" title="Не удалось загрузить задачу">
          {errorMessage(query.error)}
        </Alert>
      )}
      {task && (
        <Stack>
          <Title order={3}>{task.offer}</Title>
          <TaskActions
            task={task}
            onEdit={() => onEdit(task)}
            onResultRequired={() => onTabChange('files')}
          />
          <Tabs value={tab} onChange={(v) => v && onTabChange(v as DrawerTab)} keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab value="details" leftSection={<IconInfoCircle size={16} />}>
                Детали
              </Tabs.Tab>
              <Tabs.Tab value="files" leftSection={<IconPaperclip size={16} />}>
                Файлы
              </Tabs.Tab>
              <Tabs.Tab value="ai" leftSection={<IconRobot size={16} />}>
                AI-расходы
              </Tabs.Tab>
              <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>
                История
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="details" pt="md">
              <Details task={task} />
            </Tabs.Panel>
            <Tabs.Panel value="files" pt="md">
              <AttachmentsPanel task={task} />
            </Tabs.Panel>
            <Tabs.Panel value="ai" pt="md">
              <AiUsagePanel task={task} />
            </Tabs.Panel>
            <Tabs.Panel value="history" pt="md">
              <HistoryPanel taskId={task.id} />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      )}
    </Drawer>
  );
}
