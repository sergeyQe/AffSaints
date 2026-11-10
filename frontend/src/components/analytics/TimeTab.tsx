import { Alert, Anchor, Badge, SimpleGrid, Stack, Table } from '@mantine/core';
import { IconHourglass } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

import type { TimeAnalytics } from '../../api/analytics';
import { taskUrl } from '../../hooks/useTaskDrawer';
import { formatDecimalOrDash, formatDurationOrDash } from '../../lib/format';
import { formatDateTime, formatDuration } from '../../lib/tasks';
import { OverdueSection } from './OverdueSection';
import { EmptyState, Section, StatTile, TaskCell, TruncatedNote } from './ui';

const DEADLINE: Record<
  TimeAnalytics['by_task'][number]['deadline'],
  { label: string; color: string }
> = {
  on_time: { label: 'вовремя', color: 'teal' },
  late: { label: 'с опозданием', color: 'red' },
  none: { label: 'без дедлайна', color: 'gray' },
};

function Tiles({ data }: { data: TimeAnalytics }) {
  const t = data.tiles;
  return (
    <SimpleGrid cols={{ base: 2, lg: 4 }}>
      <StatTile
        label="Первая версия"
        value={formatDurationOrDash(t.avg_work_seconds)}
        hint="чистая работа на задачу, в среднем"
      />
      <StatTile
        label="Правки"
        value={formatDurationOrDash(t.avg_revision_seconds)}
        hint="на задачу, в среднем"
      />
      <StatTile
        label="Ожидание проверки"
        value={formatDurationOrDash(t.avg_review_wait_seconds)}
        hint="на задачу, что была на проверке"
      />
      <StatTile
        label="Ожидание в пуле"
        value={formatDurationOrDash(t.avg_pool_wait_seconds)}
        hint="в «Новых» до взятия, включая возвраты в пул"
      />
    </SimpleGrid>
  );
}

function ByCreative({ data }: { data: TimeAnalytics }) {
  if (!data.by_creative.length) return <EmptyState>За период задачи не принимались.</EmptyState>;
  return (
    <Table.ScrollContainer minWidth={640}>
      <Table striped verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Креативщик</Table.Th>
            <Table.Th ta="right">Принято задач</Table.Th>
            <Table.Th ta="right">Первая версия</Table.Th>
            <Table.Th ta="right">Правки</Table.Th>
            <Table.Th ta="right">В среднем на задачу</Table.Th>
            <Table.Th ta="right">Кругов правок</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.by_creative.map((r) => (
            <Table.Tr key={r.user.id}>
              <Table.Td>{r.user.full_name}</Table.Td>
              <Table.Td ta="right">{r.completed}</Table.Td>
              <Table.Td ta="right">{formatDuration(r.work_seconds)}</Table.Td>
              <Table.Td ta="right">{formatDuration(r.revision_seconds)}</Table.Td>
              <Table.Td ta="right">{formatDurationOrDash(r.avg_task_seconds)}</Table.Td>
              <Table.Td ta="right">{formatDecimalOrDash(r.revisions_per_task)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function ByTask({ data }: { data: TimeAnalytics }) {
  if (!data.by_task.length) return <EmptyState>За период задачи не принимались.</EmptyState>;
  return (
    <Stack gap="xs">
      <Table.ScrollContainer minWidth={900}>
        <Table striped verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Задача</Table.Th>
              <Table.Th>Исполнитель</Table.Th>
              <Table.Th ta="right">Работа</Table.Th>
              <Table.Th ta="right">Правки</Table.Th>
              <Table.Th ta="right">Кругов</Table.Th>
              <Table.Th ta="right">Ожидание проверки</Table.Th>
              <Table.Th ta="right">В пуле</Table.Th>
              <Table.Th>Срок</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.by_task.map((r) => (
              <Table.Tr key={r.task_id}>
                <Table.Td>
                  <TaskCell
                    id={r.task_id}
                    offer={r.offer}
                    sub={`${r.geo} · принята ${formatDateTime(r.completed_at)}`}
                  />
                </Table.Td>
                <Table.Td>{r.user?.full_name ?? '—'}</Table.Td>
                <Table.Td ta="right">{formatDuration(r.work_seconds)}</Table.Td>
                <Table.Td ta="right">{formatDuration(r.revision_seconds)}</Table.Td>
                <Table.Td ta="right">{r.revision_count}</Table.Td>
                <Table.Td ta="right">{formatDuration(r.review_wait_seconds)}</Table.Td>
                <Table.Td ta="right">{formatDuration(r.pool_wait_seconds)}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={DEADLINE[r.deadline].color} tt="none">
                    {DEADLINE[r.deadline].label}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <TruncatedNote
        truncated={data.by_task_truncated}
        what={`последние ${data.by_task.length} принятых задач`}
      />
    </Stack>
  );
}

function ReviewWait({ data }: { data: TimeAnalytics }) {
  const now = data.waiting_now;
  return (
    <Stack>
      {/* Сейчас ждут проверки — без периода */}
      {now.count > 0 && now.oldest_task_id !== null && (
        <Alert variant="light" color="orange" icon={<IconHourglass size={18} />}>
          Сейчас ждут проверки: {now.count}. Дольше всех —{' '}
          <Anchor component={Link} to={taskUrl(now.oldest_task_id)} size="sm">
            #{now.oldest_task_id}
          </Anchor>
          , {formatDurationOrDash(now.oldest_seconds)}.
        </Alert>
      )}
      {data.review_wait_by_reviewer.length ? (
        <Table.ScrollContainer minWidth={480}>
          <Table striped verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Принял работу</Table.Th>
                <Table.Th ta="right">Задач</Table.Th>
                <Table.Th ta="right">Ожидание в среднем</Table.Th>
                <Table.Th ta="right">Дольше всего</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.review_wait_by_reviewer.map((r) => (
                <Table.Tr key={r.user?.id ?? 'none'}>
                  <Table.Td>{r.user?.full_name ?? '—'}</Table.Td>
                  <Table.Td ta="right">{r.tasks}</Table.Td>
                  <Table.Td ta="right">{formatDuration(r.avg_seconds)}</Table.Td>
                  <Table.Td ta="right">{formatDuration(r.max_seconds)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        <EmptyState>За период принятых после проверки задач нет.</EmptyState>
      )}
    </Stack>
  );
}

/** Вкладка «Учёт времени»: задачи, принятые в периоде; сроки — по дедлайну. */
export function TimeTab({ data }: { data: TimeAnalytics }) {
  return (
    <Stack>
      <Tiles data={data} />
      <Section
        title="По креативщикам"
        hint="Время — за тем, кто работал; принятые — за исполнителем"
      >
        <ByCreative data={data} />
      </Section>
      <Section title="По задачам" hint="Принятые за период, свежие сверху">
        <ByTask data={data} />
      </Section>
      <Section title="Ожидание проверки" hint="Засчитывается тому, кто фактически принял работу">
        <ReviewWait data={data} />
      </Section>
      <Section title="Сроки" hint="Дедлайны, попавшие в период">
        <OverdueSection data={data} />
      </Section>
    </Stack>
  );
}
