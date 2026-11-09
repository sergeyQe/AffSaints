import {
  Alert,
  Group,
  LoadingOverlay,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState } from 'react';

import { useAnalytics } from '../api/analytics';
import { useUsers } from '../api/users';
import { AiCreditsSection } from '../components/analytics/AiCreditsSection';
import { OverdueSection } from '../components/analytics/OverdueSection';
import { StatusChart } from '../components/analytics/StatusChart';
import { SummaryTiles } from '../components/analytics/SummaryTiles';
import { TimelineChart } from '../components/analytics/TimelineChart';
import { Section } from '../components/analytics/ui';
import { WorkloadSection } from '../components/analytics/WorkloadSection';
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

      {analytics.isError && (
        <Alert color="red" variant="light">
          Не удалось загрузить аналитику: {errorMessage(analytics.error)}
        </Alert>
      )}

      {data && (
        <Stack pos="relative">
          <LoadingOverlay visible={analytics.isFetching && analytics.isPlaceholderData} />
          <SummaryTiles data={data} />
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Section title="Динамика" hint="Созданные и завершённые задачи по дням">
              <TimelineChart data={data} />
            </Section>
            <Section title="Задачи по статусам" hint="Созданные за период — по текущему статусу">
              <StatusChart data={data} />
            </Section>
          </SimpleGrid>
          <Section title="Загрузка креативщиков" hint="Активные задачи — на текущий момент">
            <WorkloadSection data={data} />
          </Section>
          <Section title="Сроки" hint="Дедлайны, попавшие в период">
            <OverdueSection data={data} />
          </Section>
          <Section title="Расходы AI-кредитов" hint="По дате записи расхода">
            <AiCreditsSection data={data} />
          </Section>
        </Stack>
      )}
    </Stack>
  );
}
