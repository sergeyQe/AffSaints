import { SegmentedControl, Stack, Table, Text, Title } from '@mantine/core';
import { useState } from 'react';

import { useTasks, type TaskDetail } from '../api/tasks';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { useTaskDrawer } from '../hooks/useTaskDrawer';
import { CREATIVE_TYPE_LABELS, formatDateTime } from '../lib/tasks';

type ArchiveKind = 'done' | 'cancelled';

/** Архив: все завершённые (без ограничения 30 дней) и отменённые задачи. */
export function ArchivePage() {
  const [kind, setKind] = useState<ArchiveKind>('done');
  const tasks = useTasks({ status: kind }, { keepPrevious: false });
  const drawer = useTaskDrawer();
  const [editing, setEditing] = useState<TaskDetail | null>(null);
  const rows = tasks.data ?? [];

  return (
    <Stack>
      <Title order={3}>Архив</Title>
      <SegmentedControl
        w={320}
        value={kind}
        onChange={(v) => setKind(v as ArchiveKind)}
        data={[
          { value: 'done', label: 'Завершённые' },
          { value: 'cancelled', label: 'Отменённые' },
        ]}
      />
      <Table.ScrollContainer minWidth={720}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>Оффер</Table.Th>
              <Table.Th>GEO / тип</Table.Th>
              <Table.Th>Байер</Table.Th>
              <Table.Th>Исполнитель</Table.Th>
              <Table.Th>{kind === 'done' ? 'Завершена' : 'Отменена'}</Table.Th>
              {kind === 'cancelled' && <Table.Th>Причина</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((t) => (
              <Table.Tr
                key={t.id}
                style={{ cursor: 'pointer' }}
                tabIndex={0}
                aria-label={`Открыть задачу ${t.id}: ${t.offer}`}
                onClick={() => drawer.open(t.id)}
                onKeyDown={(e) => e.key === 'Enter' && drawer.open(t.id)}
              >
                <Table.Td>{t.id}</Table.Td>
                <Table.Td fw={500}>{t.offer}</Table.Td>
                <Table.Td>
                  {t.geo} · {CREATIVE_TYPE_LABELS[t.creative_type]}
                </Table.Td>
                <Table.Td>{t.author.full_name}</Table.Td>
                <Table.Td>{t.assignee?.full_name ?? '—'}</Table.Td>
                <Table.Td>
                  {formatDateTime(kind === 'done' ? t.completed_at : t.cancelled_at)}
                </Table.Td>
                {kind === 'cancelled' && (
                  <Table.Td>
                    <Text size="sm" lineClamp={2}>
                      {t.cancel_reason}
                    </Text>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {rows.length === 0 && !tasks.isPending && (
        <Text c="dimmed" ta="center">
          Здесь пока пусто.
        </Text>
      )}

      <TaskDrawer
        taskId={drawer.taskId}
        tab={drawer.tab}
        onTabChange={drawer.setTab}
        onClose={drawer.close}
        onEdit={setEditing}
      />
      {editing && <TaskFormModal task={editing} onClose={() => setEditing(null)} />}
    </Stack>
  );
}
