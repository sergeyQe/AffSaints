import { BarChart } from '@mantine/charts';
import { Stack, Table, Text } from '@mantine/core';
import { useMemo } from 'react';

import type { Analytics } from '../../api/analytics';
import { SERIES } from '../../lib/chartPalette';
import { formatCredits } from '../../lib/format';
import { EmptyState } from './ui';

export function AiCreditsSection({ data }: { data: Analytics }) {
  const { by_service, by_executor } = data.ai_credits;
  // Сводная таблица: исполнители × сервисы, без общих сумм (кредиты разных сервисов несопоставимы)
  const services = by_service.map((s) => s.service);
  const pivot = useMemo(() => {
    const rows = new Map<number, { name: string; cells: Record<string, number> }>();
    for (const r of by_executor) {
      const row = rows.get(r.user.id) ?? { name: r.user.full_name, cells: {} };
      row.cells[r.service] = r.credits;
      rows.set(r.user.id, row);
    }
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [by_executor]);

  if (!by_service.length) return <EmptyState>За период AI-кредиты не тратились.</EmptyState>;
  return (
    <Stack>
      <BarChart
        h={Math.max(120, by_service.length * 40)}
        data={by_service}
        dataKey="service"
        orientation="vertical"
        gridAxis="none"
        tickLine="none"
        withBarValueLabel
        valueFormatter={formatCredits}
        yAxisProps={{ width: 120 }}
        barProps={{ radius: [0, 4, 4, 0] }}
        series={[{ name: 'credits', label: 'Кредиты', color: SERIES.blue }]}
      />
      <Table.ScrollContainer minWidth={Math.max(400, 160 + services.length * 120)}>
        <Table striped verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Исполнитель</Table.Th>
              {services.map((s) => (
                <Table.Th key={s} ta="right">
                  {s}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pivot.map((row) => (
              <Table.Tr key={row.name}>
                <Table.Td>{row.name}</Table.Td>
                {services.map((s) => (
                  <Table.Td key={s} ta="right">
                    {row.cells[s] ? formatCredits(row.cells[s]) : '—'}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed">
        Кредиты у каждого сервиса свои, поэтому итоги — отдельно по сервисам, без общей суммы.
      </Text>
    </Stack>
  );
}
