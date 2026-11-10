import { BarChart } from '@mantine/charts';
import { Stack, Table, Text } from '@mantine/core';

import type { Overview } from '../../api/analytics';
import { CHART_GRID, SERIES } from '../../lib/chartPalette';
import { formatDurationOrDash } from '../../lib/format';
import { EmptyState } from './ui';

export function WorkloadSection({ data }: { data: Overview }) {
  if (!data.workload.length) return <EmptyState>Нет активных креативщиков.</EmptyState>;
  const chart = data.workload.map((w) => ({
    name: w.user.full_name,
    in_progress: w.in_progress,
    review: w.review,
    revision: w.revision,
  }));
  const anyActive = data.workload.some((w) => w.active_tasks > 0);
  return (
    <Stack>
      {anyActive && (
        <BarChart
          h={Math.max(140, chart.length * 44)}
          data={chart}
          dataKey="name"
          type="stacked"
          xAxisProps={{ allowDecimals: false }}
          orientation="vertical"
          withLegend
          legendProps={{ verticalAlign: 'top', height: 36 }}
          gridAxis="x"
          gridProps={{ stroke: CHART_GRID }}
          tickLine="none"
          yAxisProps={{ width: 140 }}
          series={[
            { name: 'in_progress', label: 'В работе', color: SERIES.blue },
            { name: 'review', label: 'На проверке', color: SERIES.orange },
            { name: 'revision', label: 'Правки', color: SERIES.aqua },
          ]}
        />
      )}
      <Table.ScrollContainer minWidth={640}>
        <Table striped verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Креативщик</Table.Th>
              <Table.Th ta="right">Активных задач</Table.Th>
              <Table.Th ta="right">Активных креативов</Table.Th>
              <Table.Th ta="right">Завершено за период</Table.Th>
              <Table.Th ta="right">Среднее время</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.workload.map((w) => (
              <Table.Tr key={w.user.id}>
                <Table.Td>{w.user.full_name}</Table.Td>
                <Table.Td ta="right">
                  {w.active_tasks}
                  {w.active_tasks > 0 && (
                    <Text span size="xs" c="dimmed">
                      {' '}
                      ({w.in_progress} / {w.review} / {w.revision})
                    </Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">{w.active_creatives}</Table.Td>
                <Table.Td ta="right">{w.completed_in_period}</Table.Td>
                <Table.Td ta="right">{formatDurationOrDash(w.avg_work_seconds)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed">
        В скобках: в работе / на проверке / правки. Время — по задачам, принятым за период.
      </Text>
    </Stack>
  );
}
