import { SimpleGrid, Stack } from '@mantine/core';

import type { Overview } from '../../api/analytics';
import { StatusChart } from './StatusChart';
import { SummaryTiles } from './SummaryTiles';
import { TimelineChart } from './TimelineChart';
import { Section } from './ui';
import { WorkloadSection } from './WorkloadSection';

/** Вкладка «Пользователи и задачи». */
export function OverviewTab({ data }: { data: Overview }) {
  return (
    <Stack>
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
    </Stack>
  );
}
