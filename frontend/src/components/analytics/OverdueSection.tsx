import { SimpleGrid, Stack, Table, Text } from '@mantine/core';

import type { TimeAnalytics } from '../../api/analytics';
import { formatPercent } from '../../lib/format';
import { EmptyState, StatTile } from './ui';

const NOT_TAKEN = 'Не взята в работу';

export function OverdueSection({ data }: { data: Pick<TimeAnalytics, 'overdue'> }) {
  const o = data.overdue;
  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, sm: 5 }}>
        <StatTile label="Вовремя" value={String(o.on_time)} />
        <StatTile label="С опозданием" value={String(o.late)} hint="первая сдача после дедлайна" />
        <StatTile label="Не сдано" value={String(o.missed)} hint="дедлайн прошёл" />
        <StatTile label="Доля просрочек" value={formatPercent(o.late_rate)} />
        <StatTile label="Просрочено сейчас" value={String(o.current)} />
      </SimpleGrid>
      {o.by_executor.length > 0 ? (
        <Table.ScrollContainer minWidth={560}>
          <Table striped verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Исполнитель</Table.Th>
                <Table.Th ta="right">Вовремя</Table.Th>
                <Table.Th ta="right">С опозданием</Table.Th>
                <Table.Th ta="right">Не сдано</Table.Th>
                <Table.Th ta="right">Просрочено сейчас</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {o.by_executor.map((r) => (
                <Table.Tr key={r.user?.id ?? 'none'}>
                  <Table.Td>{r.user?.full_name ?? NOT_TAKEN}</Table.Td>
                  <Table.Td ta="right">{r.on_time}</Table.Td>
                  <Table.Td ta="right">{r.late}</Table.Td>
                  <Table.Td ta="right">{r.missed}</Table.Td>
                  <Table.Td ta="right">{r.current}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        <EmptyState>Дедлайнов в периоде нет.</EmptyState>
      )}
      <Text size="xs" c="dimmed">
        Просрочка считается по первой сдаче и дедлайну, действовавшему в тот момент. Задачи без
        дедлайна не учитываются.
      </Text>
    </Stack>
  );
}
