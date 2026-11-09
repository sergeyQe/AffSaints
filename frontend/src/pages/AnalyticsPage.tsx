import { BarChart, LineChart } from '@mantine/charts';
import {
  Alert,
  Group,
  LoadingOverlay,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, useState, type ReactNode } from 'react';

import { useAnalytics, type Analytics } from '../api/analytics';
import { useUsers } from '../api/users';
import { CHART_GRID, SERIES } from '../lib/chartPalette';
import { formatCredits } from '../lib/format';
import { errorMessage } from '../lib/notify';
import {
  browserTimezone,
  presetPeriod,
  PRESET_LABELS,
  rangePeriod,
  type Period,
  type PeriodPreset,
} from '../lib/period';
import { formatDuration, STATUS_LABELS } from '../lib/tasks';

const NOT_TAKEN = 'Не взята в работу';

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md" component="section" aria-label={title}>
      <Stack gap="sm">
        <div>
          <Title order={5}>{title}</Title>
          {hint && (
            <Text size="xs" c="dimmed">
              {hint}
            </Text>
          )}
        </div>
        {children}
      </Stack>
    </Paper>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper withBorder p="md" radius="md" role="group" aria-label={label}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text fz={28} fw={700} lh={1.2} mt={4}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed" mt={2}>
          {hint}
        </Text>
      )}
    </Paper>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <Text size="sm" c="dimmed" py="md" ta="center">
    {children}
  </Text>
);

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const duration = (s: number | null) => (s === null ? '—' : formatDuration(s));

function Summary({ data }: { data: Analytics }) {
  const s = data.summary;
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
      <StatTile label="Создано" value={String(s.created)} hint="за период" />
      <StatTile label="Завершено" value={String(s.completed)} hint="принято за период" />
      <StatTile
        label="Среднее время"
        value={duration(s.avg_work_seconds)}
        hint="чистая работа креативщика"
      />
      <StatTile
        label="Правок на задачу"
        value={s.revisions_per_task === null ? '—' : s.revisions_per_task.toFixed(1)}
        hint="в завершённых"
      />
      <StatTile label="В работе сейчас" value={String(s.active_now)} hint="все активные задачи" />
      <StatTile
        label="Просрочено сейчас"
        value={String(s.overdue_now)}
        hint="дедлайн прошёл, не сдано"
      />
    </SimpleGrid>
  );
}

function Timeline({ data }: { data: Analytics }) {
  const points = data.timeline.map((p) => ({ ...p, label: dayjs(p.day).format('D MMM') }));
  if (!points.some((p) => p.created || p.completed)) return <Empty>За период задач нет.</Empty>;
  return (
    <LineChart
      h={240}
      data={points}
      dataKey="label"
      yAxisProps={{ allowDecimals: false }}
      withLegend
      legendProps={{ verticalAlign: 'top', height: 36 }}
      gridAxis="y"
      gridProps={{ stroke: CHART_GRID }}
      strokeWidth={2}
      curveType="monotone"
      withDots={points.length <= 31}
      tickLine="none"
      series={[
        { name: 'created', label: 'Создано', color: SERIES.blue },
        { name: 'completed', label: 'Завершено', color: SERIES.orange },
      ]}
    />
  );
}

function Statuses({ data }: { data: Analytics }) {
  const rows = data.by_status
    .filter((s) => s.count > 0)
    .map((s) => ({ status: STATUS_LABELS[s.status], count: s.count }));
  if (!rows.length) return <Empty>За период задач не создавали.</Empty>;
  return (
    <BarChart
      h={Math.max(120, rows.length * 40)}
      data={rows}
      dataKey="status"
      xAxisProps={{ allowDecimals: false }}
      orientation="vertical"
      gridAxis="none"
      tickLine="none"
      withBarValueLabel
      yAxisProps={{ width: 100 }}
      barProps={{ radius: [0, 4, 4, 0] }}
      series={[{ name: 'count', label: 'Задач', color: SERIES.blue }]}
    />
  );
}

function Workload({ data }: { data: Analytics }) {
  if (!data.workload.length) return <Empty>Нет активных креативщиков.</Empty>;
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
                <Table.Td ta="right">{duration(w.avg_work_seconds)}</Table.Td>
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

function Overdue({ data }: { data: Analytics }) {
  const o = data.overdue;
  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, sm: 5 }}>
        <StatTile label="Вовремя" value={String(o.on_time)} />
        <StatTile label="С опозданием" value={String(o.late)} hint="первая сдача после дедлайна" />
        <StatTile label="Не сдано" value={String(o.missed)} hint="дедлайн прошёл" />
        <StatTile label="Доля просрочек" value={pct(o.late_rate)} />
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
        <Empty>Дедлайнов в периоде нет.</Empty>
      )}
      <Text size="xs" c="dimmed">
        Просрочка считается по первой сдаче и дедлайну, действовавшему в тот момент. Задачи без
        дедлайна не учитываются.
      </Text>
    </Stack>
  );
}

function AiCredits({ data }: { data: Analytics }) {
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

  if (!by_service.length) return <Empty>За период AI-кредиты не тратились.</Empty>;
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

export function AnalyticsPage() {
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [range, setRange] = useState<[string | null, string | null]>([null, null]);
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [creativeId, setCreativeId] = useState<string | null>(null);
  const [offer, setOffer] = useState('');
  const [debouncedOffer] = useDebouncedValue(offer, 400);
  const buyers = useUsers({ role: 'buyer' });
  const creatives = useUsers({ role: 'creative' });

  // Произвольный диапазон применяется, когда выбраны обе даты; до этого — текущий месяц
  const period: Period =
    preset === 'custom' && range[0] && range[1]
      ? rangePeriod(range[0], range[1])
      : presetPeriod(preset === 'custom' ? 'month' : preset);

  const analytics = useAnalytics({
    date_from: period.from.toISOString(),
    date_to: period.to.toISOString(),
    buyer_id: buyerId ? Number(buyerId) : null,
    creative_id: creativeId ? Number(creativeId) : null,
    offer: debouncedOffer.trim() || undefined,
    tz: browserTimezone(),
  });
  const data = analytics.data;
  const options = (list?: { id: number; full_name: string }[]) =>
    (list ?? []).map((u) => ({ value: String(u.id), label: u.full_name }));

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={3}>Аналитика</Title>
          <Text size="sm" c="dimmed">
            {period.from.format('D MMMM YYYY')} —{' '}
            {period.to.subtract(1, 'day').format('D MMMM YYYY')}
          </Text>
        </div>
      </Group>

      <Group gap="xs" wrap="wrap">
        <SegmentedControl
          value={preset}
          onChange={(v) => setPreset(v as PeriodPreset)}
          data={[
            ...Object.entries(PRESET_LABELS).map(([value, label]) => ({ value, label })),
            { value: 'custom', label: 'Период…' },
          ]}
        />
        {preset === 'custom' && (
          <DatePickerInput
            type="range"
            placeholder="С … по …"
            aria-label="Произвольный период"
            value={range}
            onChange={setRange}
            valueFormat="D MMM YYYY"
            maxDate={dayjs().add(1, 'year').format('YYYY-MM-DD')}
            w={240}
          />
        )}
        <Select
          placeholder="Байер"
          aria-label="Байер"
          data={options(buyers.data)}
          value={buyerId}
          onChange={setBuyerId}
          clearable
          searchable
          w={180}
        />
        <Select
          placeholder="Креативщик"
          aria-label="Креативщик"
          data={options(creatives.data)}
          value={creativeId}
          onChange={setCreativeId}
          clearable
          searchable
          w={180}
        />
        <TextInput
          placeholder="Оффер"
          aria-label="Оффер"
          leftSection={<IconSearch size={14} />}
          value={offer}
          onChange={(e) => setOffer(e.currentTarget.value)}
          w={170}
        />
      </Group>

      {analytics.isError && (
        <Alert color="red" variant="light">
          Не удалось загрузить аналитику: {errorMessage(analytics.error)}
        </Alert>
      )}

      {data && (
        <Stack pos="relative">
          <LoadingOverlay visible={analytics.isFetching && analytics.isPlaceholderData} />
          <Summary data={data} />
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Section title="Динамика" hint="Созданные и завершённые задачи по дням">
              <Timeline data={data} />
            </Section>
            <Section title="Задачи по статусам" hint="Созданные за период — по текущему статусу">
              <Statuses data={data} />
            </Section>
          </SimpleGrid>
          <Section title="Загрузка креативщиков" hint="Активные задачи — на текущий момент">
            <Workload data={data} />
          </Section>
          <Section title="Сроки" hint="Дедлайны, попавшие в период">
            <Overdue data={data} />
          </Section>
          <Section title="Расходы AI-кредитов" hint="По дате записи расхода">
            <AiCredits data={data} />
          </Section>
        </Stack>
      )}
    </Stack>
  );
}
