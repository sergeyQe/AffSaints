import { SimpleGrid } from '@mantine/core';

import type { Overview } from '../../api/analytics';
import { formatDecimalOrDash } from '../../lib/format';
import { StatTile } from './ui';

export function SummaryTiles({ data }: { data: Overview }) {
  const s = data.summary;
  return (
    // Среднее время — на вкладке «Учёт времени»
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }}>
      <StatTile label="Создано" value={String(s.created)} hint="за период" />
      <StatTile label="Завершено" value={String(s.completed)} hint="принято за период" />
      <StatTile
        label="Правок на задачу"
        value={formatDecimalOrDash(s.revisions_per_task)}
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
