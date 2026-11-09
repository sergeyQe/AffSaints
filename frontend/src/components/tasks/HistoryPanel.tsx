import { Text, Timeline } from '@mantine/core';

import { useTaskEvents } from '../../api/tasks';
import { describeEvent } from '../../lib/eventText';
import { formatDateTime } from '../../lib/tasks';

export function HistoryPanel({ taskId }: { taskId: number }) {
  const events = useTaskEvents(taskId);
  // Свежие события сверху
  const items = [...(events.data ?? [])].reverse();

  if (events.isPending) return <Text c="dimmed">Загрузка…</Text>;

  return (
    <Timeline bulletSize={14} lineWidth={2}>
      {items.map((e) => {
        const text = describeEvent(e);
        return (
          <Timeline.Item key={e.id} title={text.title} color={text.color}>
            {text.details.map((line, i) => (
              <Text key={i} size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                {line}
              </Text>
            ))}
            <Text size="xs" c="dimmed" mt={2}>
              {e.actor?.full_name ?? 'Система'} · {formatDateTime(e.created_at)}
            </Text>
          </Timeline.Item>
        );
      })}
    </Timeline>
  );
}
