import { LineChart } from '@mantine/charts';
import dayjs from 'dayjs';

import type { Analytics } from '../../api/analytics';
import { CHART_GRID, SERIES } from '../../lib/chartPalette';
import { EmptyState } from './ui';

export function TimelineChart({ data }: { data: Analytics }) {
  const points = data.timeline.map((p) => ({ ...p, label: dayjs(p.day).format('D MMM') }));
  if (!points.some((p) => p.created || p.completed))
    return <EmptyState>За период задач нет.</EmptyState>;
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
