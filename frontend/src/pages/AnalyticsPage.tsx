import {
  Alert,
  Box,
  Center,
  Group,
  Loader,
  LoadingOverlay,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { IconClockHour4, IconRobot, IconSearch, IconUsers } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAnalyticsTab, type AnalyticsParams, type AnalyticsTab } from '../api/analytics';
import { useUsers } from '../api/users';
import { AiTab } from '../components/analytics/AiTab';
import { OverviewTab } from '../components/analytics/OverviewTab';
import { TimeTab } from '../components/analytics/TimeTab';
import { useIsMobile } from '../hooks/useIsMobile';
import { errorMessage } from '../lib/notify';
import {
  browserTimezone,
  presetPeriod,
  PRESET_LABELS,
  rangePeriod,
  type Period,
  type PeriodPreset,
} from '../lib/period';

// Подвкладки аналитики; на телефоне — короткие подписи, чтобы все три были видны
const TABS = [
  { value: 'overview', label: 'Пользователи и задачи', short: 'Задачи', icon: IconUsers },
  { value: 'ai', label: 'Учёт AI-расходов', short: 'AI-расходы', icon: IconRobot },
  { value: 'time', label: 'Учёт времени', short: 'Время', icon: IconClockHour4 },
] as const;

const isTab = (v: string | null): v is AnalyticsTab => TABS.some((t) => t.value === v);

const PERIOD_OPTIONS = [
  ...Object.entries(PRESET_LABELS).map(([value, label]) => ({ value, label })),
  { value: 'custom', label: 'Период…' },
];

export function AnalyticsPage() {
  // На телефоне пять вариантов периода не помещаются в переключатель — показываем список
  const isMobile = useIsMobile();
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

  // Фильтры общие для всех вкладок
  const params: AnalyticsParams = {
    date_from: period.from.toISOString(),
    date_to: period.to.toISOString(),
    buyer_id: buyerId ? Number(buyerId) : null,
    creative_id: creativeId ? Number(creativeId) : null,
    offer: debouncedOffer.trim() || undefined,
    tz: browserTimezone(),
  };
  // Открытая вкладка — в адресе (?tab=ai), ссылкой можно поделиться
  const [search, setSearch] = useSearchParams();
  const tabParam = search.get('tab');
  const tab: AnalyticsTab = isTab(tabParam) ? tabParam : 'overview';
  const setTab = (next: string | null) => {
    if (!isTab(next)) return;
    setSearch(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'overview') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  };
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
        {isMobile ? (
          <Select
            aria-label="Период"
            data={PERIOD_OPTIONS}
            value={preset}
            onChange={(v) => v && setPreset(v as PeriodPreset)}
            allowDeselect={false}
            w="100%"
          />
        ) : (
          <SegmentedControl
            value={preset}
            onChange={(v) => setPreset(v as PeriodPreset)}
            data={PERIOD_OPTIONS}
          />
        )}
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

      {/* Панель рисуется только у открытой вкладки — и запрос уходит только за ней */}
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        {/* Телефон: вкладки на всю ширину, без иконок, короткие подписи; имя вкладки = видимый текст */}
        <Tabs.List grow={isMobile}>
          {TABS.map((t) => (
            <Tabs.Tab
              key={t.value}
              value={t.value}
              leftSection={isMobile ? undefined : <t.icon size={16} />}
            >
              {isMobile ? t.short : t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="overview" pt="md">
          <TabContent tab="overview" params={params} render={(d) => <OverviewTab data={d} />} />
        </Tabs.Panel>
        <Tabs.Panel value="ai" pt="md">
          <TabContent tab="ai" params={params} render={(d) => <AiTab data={d} />} />
        </Tabs.Panel>
        <Tabs.Panel value="time" pt="md">
          <TabContent tab="time" params={params} render={(d) => <TimeTab data={d} />} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

/** Загрузка одной вкладки: ошибка, первичная загрузка и затемнение при смене фильтров. */
function TabContent<T extends AnalyticsTab>({
  tab,
  params,
  render,
}: {
  tab: T;
  params: AnalyticsParams;
  render: (data: NonNullable<ReturnType<typeof useAnalyticsTab<T>>['data']>) => ReactNode;
}) {
  const query = useAnalyticsTab(tab, params);
  // Ошибка не прячет уже загруженные данные: сбой фонового обновления — сообщение над ними
  const error = query.isError && (
    <Alert color="red" variant="light">
      Не удалось загрузить аналитику: {errorMessage(query.error)}
    </Alert>
  );
  if (!query.data) {
    return (
      error || (
        <Center py="xl">
          <Loader />
        </Center>
      )
    );
  }
  return (
    <Stack>
      {error}
      <Box pos="relative">
        <LoadingOverlay visible={query.isFetching && query.isPlaceholderData} />
        {render(query.data)}
      </Box>
    </Stack>
  );
}
