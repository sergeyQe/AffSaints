import { SimpleGrid } from '@mantine/core';

import type { Analytics } from '../../api/analytics';
import { formatDurationOrDash } from '../../lib/format';
import { StatTile } from './ui';

export function SummaryTiles({ data }: { data: Analytics }) {
  const s = data.summary;
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
      <StatTile label="Создано" value={String(s.created)} hint="за период" />
      <StatTile label="Завершено" value={String(s.completed)} hint="принято за период" />
      <StatTile
        label="Среднее время"
        value={formatDurationOrDash(s.avg_work_seconds)}
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
