import { Table, Text } from '@mantine/core';
import { useMemo } from 'react';

import type { AiAnalytics } from '../../api/analytics';
import { formatCredits } from '../../lib/format';

type Cell = { credits: number; revisions: number };

/**
 * Исполнители × сервисы; в клетке — всего и сколько из этого на правки.
 * Без общих сумм по строке: кредиты разных сервисов несопоставимы.
 */
export function AiCreditsSection({ data }: { data: AiAnalytics }) {
  const { by_service, by_executor } = data;
  // Клетки — по id сервиса: имена могут совпасть после переименования
  const pivot = useMemo(() => {
    const rows = new Map<number, { id: number; name: string; cells: Map<number, Cell> }>();
    for (const r of by_executor) {
      const row = rows.get(r.user.id) ?? {
        id: r.user.id,
        name: r.user.full_name,
        cells: new Map(),
      };
      row.cells.set(r.service_id, { credits: r.credits, revisions: r.revisions });
      rows.set(r.user.id, row);
    }
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [by_executor]);

  return (
    <Table.ScrollContainer minWidth={Math.max(400, 160 + by_service.length * 120)}>
      <Table striped verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Исполнитель</Table.Th>
            {by_service.map((s) => (
              <Table.Th key={s.service_id} ta="right">
                {s.service}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pivot.map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td>{row.name}</Table.Td>
              {by_service.map((s) => {
                const cell = row.cells.get(s.service_id);
                return (
                  <Table.Td key={s.service_id} ta="right">
                    {cell ? formatCredits(cell.credits) : '—'}
                    {cell && cell.revisions > 0 && (
                      <Text size="xs" c="orange.8">
                        правки {formatCredits(cell.revisions)}
                      </Text>
                    )}
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
