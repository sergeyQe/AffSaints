import { Button, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { useState } from 'react';

import type { TaskDetail } from '../../api/tasks';
import { useUsers } from '../../api/users';

/** Выбор нового исполнителя (только руководитель). */
export function ReassignModal({
  task,
  opened,
  loading,
  onClose,
  onSubmit,
}: {
  task: TaskDetail;
  opened: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (assigneeId: number) => void;
}) {
  const creatives = useUsers({ role: 'creative' });
  const [value, setValue] = useState<string | null>(null);
  // Автор и текущий исполнитель исключаются — backend их всё равно не примет
  const options = (creatives.data ?? [])
    .filter((u) => u.id !== task.author.id && u.id !== task.assignee?.id)
    .map((u) => ({ value: String(u.id), label: u.full_name }));
  return (
    <Modal opened={opened} onClose={onClose} title="Сменить исполнителя" zIndex={400}>
      <Stack>
        <Text size="sm" c="dimmed">
          Сейчас: {task.assignee?.full_name ?? '—'}. Время работы прежнего исполнителя сохранится за
          ним.
        </Text>
        <Select
          label="Новый исполнитель"
          data={options}
          value={value}
          onChange={setValue}
          searchable
          nothingFoundMessage="Нет подходящих креативщиков"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button
            disabled={!value}
            loading={loading}
            onClick={() => value && onSubmit(Number(value))}
          >
            Назначить
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
