import { BarChart } from '@mantine/charts';

import type { Analytics } from '../../api/analytics';
import { SERIES } from '../../lib/chartPalette';
import { STATUS_LABELS } from '../../lib/tasks';
import { EmptyState } from './ui';

export function StatusChart({ data }: { data: Analytics }) {
  const rows = data.by_status
    .filter((s) => s.count > 0)
    .map((s) => ({ status: STATUS_LABELS[s.status], count: s.count }));
  if (!rows.length) return <EmptyState>За период задач не создавали.</EmptyState>;
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
