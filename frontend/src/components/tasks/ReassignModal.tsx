import { Button, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { useState } from 'react';

import type { Task } from '../../api/tasks';
import { useUsers } from '../../api/users';

/**
 * Выбор исполнителя (только руководитель): назначение на новую задачу
 * или смена исполнителя у задачи в работе.
 */
export function ReassignModal({
  task,
  opened,
  loading,
  onClose,
  onSubmit,
}: {
  task: Task;
  opened: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (assigneeId: number) => void;
}) {
  const creatives = useUsers({ role: 'creative' });
  const [value, setValue] = useState<string | null>(null);
  // У новой задачи исполнителя ещё нет — это назначение, а не замена
  const isAssign = task.assignee === null;
  // Автор и текущий исполнитель исключаются — backend их всё равно не примет
  const options = (creatives.data ?? [])
    .filter((u) => u.id !== task.author.id && u.id !== task.assignee?.id)
    .map((u) => ({ value: String(u.id), label: u.full_name }));
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isAssign ? 'Назначить исполнителя' : 'Сменить исполнителя'}
      zIndex={400}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {isAssign
            ? 'Задача сразу перейдёт в «В работе» к выбранному креативщику.'
            : `Сейчас: ${task.assignee?.full_name ?? '—'}. Время работы прежнего исполнителя сохранится за ним.`}
        </Text>
        <Select
          label={isAssign ? 'Исполнитель' : 'Новый исполнитель'}
          data={options}
          value={value}
          onChange={setValue}
          searchable
          nothingFoundMessage="Нет подходящих креативщиков"
          // Окно поднято над карточкой (zIndex 400) — список вариантов должен быть ещё выше
          comboboxProps={{ zIndex: 500 }}
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
