import { BarChart } from '@mantine/charts';
import { Badge, Group, Paper, SimpleGrid, Stack, Table, Text, Tooltip } from '@mantine/core';

import type { AiAnalytics } from '../../api/analytics';
import { SERIES } from '../../lib/chartPalette';
import { formatCredits, formatPercent } from '../../lib/format';
import { AiCreditsSection } from './AiCreditsSection';
import { EmptyState, Section, StatTile, TaskCell, TruncatedNote } from './ui';

function ShareTiles({ data }: { data: AiAnalytics }) {
  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <StatTile label="Записей о расходах" value={String(data.records)} hint="за период" />
        <StatTile
          label="Доля на правки"
          value={formatPercent(data.revision_share)}
          hint="по всем сервисам вместе; кредиты сервисов несопоставимы — смотрите долю по сервису"
        />
      </SimpleGrid>
      {/* Своя доля у каждого сервиса — отдельной полосой во всю ширину, плашки переносятся */}
      <Paper withBorder p="md" radius="md" role="group" aria-label="Доля на правки по сервисам">
        <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={8}>
          Доля на правки по сервисам
        </Text>
        <Group gap={6}>
          {data.by_service.map((s) => (
            <Badge key={s.service_id} variant="light" color="orange" size="lg" tt="none">
              {s.service} — {formatPercent(s.revision_share)}
            </Badge>
          ))}
        </Group>
      </Paper>
    </Stack>
  );
}

function ServicesSection({ data }: { data: AiAnalytics }) {
  const rows = data.by_service;
  return (
    <Stack>
      <BarChart
        h={Math.max(120, rows.length * 44)}
        data={rows}
        dataKey="service"
        type="stacked"
        orientation="vertical"
        withLegend
        legendProps={{ verticalAlign: 'top', height: 36 }}
        gridAxis="none"
        tickLine="none"
        valueFormatter={formatCredits}
        yAxisProps={{ width: 120 }}
        series={[
          { name: 'first_version', label: 'Первая версия', color: SERIES.blue },
          { name: 'revisions', label: 'Правки', color: SERIES.orange },
        ]}
      />
      <Table.ScrollContainer minWidth={520}>
        <Table striped verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Сервис</Table.Th>
              <Table.Th ta="right">Первая версия</Table.Th>
              <Table.Th ta="right">Правки</Table.Th>
              <Table.Th ta="right">Всего по сервису</Table.Th>
              <Table.Th ta="right">Доля правок</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((s) => (
              <Table.Tr key={s.service_id}>
                <Table.Td>{s.service}</Table.Td>
                <Table.Td ta="right">{formatCredits(s.first_version)}</Table.Td>
                <Table.Td ta="right">{formatCredits(s.revisions)}</Table.Td>
                <Table.Td ta="right" fw={500}>
                  {formatCredits(s.credits)}
                </Table.Td>
                <Table.Td ta="right">{formatPercent(s.revision_share)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}

function ByTaskTable({ data }: { data: AiAnalytics }) {
  return (
    <Stack gap="xs">
      <Table.ScrollContainer minWidth={720}>
        <Table striped verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Задача</Table.Th>
              <Table.Th>Исполнитель</Table.Th>
              <Table.Th>Сервис</Table.Th>
              <Table.Th ta="right">Первая версия</Table.Th>
              <Table.Th ta="right">Правки</Table.Th>
              <Table.Th ta="right">Всего</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.by_task.map((r) => (
              <Table.Tr key={`${r.task_id}-${r.user.id}-${r.service_id}`}>
                <Table.Td>
                  <TaskCell id={r.task_id} offer={r.offer} sub={r.geo} tab="ai" />
                </Table.Td>
                <Table.Td>{r.user.full_name}</Table.Td>
                <Table.Td>{r.service}</Table.Td>
                <Table.Td ta="right">{formatCredits(r.first_version)}</Table.Td>
                <Table.Td ta="right">
                  {/* Правки по кругам — в подсказке */}
                  {r.rounds.length > 0 ? (
                    <Tooltip
                      label={r.rounds
                        .map((x) => `№${x.round}: ${formatCredits(x.credits)}`)
                        .join(', ')}
                    >
                      <Text span size="sm" td="underline" style={{ textDecorationStyle: 'dotted' }}>
                        {formatCredits(r.revisions)}
                      </Text>
                    </Tooltip>
                  ) : (
                    formatCredits(r.revisions)
                  )}
                </Table.Td>
                <Table.Td ta="right" fw={500}>
                  {formatCredits(r.credits)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <TruncatedNote
        truncated={data.by_task_truncated}
        what={`самые затратные ${data.by_task.length} строк`}
      />
    </Stack>
  );
}

/** Вкладка «Учёт AI-расходов»: период — по дате записи расхода. */
export function AiTab({ data }: { data: AiAnalytics }) {
  if (!data.records) return <EmptyState>За период AI-кредиты не тратились.</EmptyState>;
  return (
    <Stack>
      <ShareTiles data={data} />
      <Section title="По сервисам" hint="Первая версия и правки; итоги — внутри сервиса">
        <ServicesSection data={data} />
      </Section>
      <Section title="По исполнителям" hint="Кредиты у каждого сервиса свои — без общей суммы">
        <AiCreditsSection data={data} />
      </Section>
      <Section title="По задачам" hint="Самые затратные сверху; правки по кругам — в подсказке">
        <ByTaskTable data={data} />
      </Section>
    </Stack>
  );
}
