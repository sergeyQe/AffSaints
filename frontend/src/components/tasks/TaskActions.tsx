import { Button, Group, Modal, Select, Stack, Text, Textarea } from '@mantine/core';
import {
  IconArrowBackUp,
  IconCheck,
  IconEdit,
  IconHandGrab,
  IconRepeat,
  IconSend,
  IconUserShare,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';

import type { TaskDetail } from '../../api/tasks';
import { useUsers } from '../../api/users';
import { useRunTransition } from '../../hooks/useRunTransition';

/** Какое окно ввода открыто: комментарий правок, причина отмены, выбор исполнителя. */
export type PromptKind = 'revision' | 'cancel' | 'reassign' | null;

export function TextPromptModal({
  title,
  label,
  description,
  confirm,
  color,
  opened,
  loading,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  description?: string;
  confirm: string;
  color: string;
  opened: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const error = touched && !text.trim() ? 'Обязательное поле' : null;
  return (
    <Modal opened={opened} onClose={onClose} title={title} zIndex={400}>
      <Stack>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
        <Textarea
          label={label}
          autosize
          minRows={3}
          value={text}
          error={error}
          onChange={(e) => setText(e.currentTarget.value)}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button
            color={color}
            loading={loading}
            onClick={() => {
              setTouched(true);
              if (text.trim()) onSubmit(text.trim());
            }}
          >
            {confirm}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ReassignModal({
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

interface Props {
  task: TaskDetail;
  onEdit: () => void;
  onResultRequired: () => void;
}

/** Кнопки действий — строго по списку task.actions, который прислал backend. */
export function TaskActions({ task, onEdit, onResultRequired }: Props) {
  const { run, isPending } = useRunTransition(onResultRequired);
  const [prompt, setPrompt] = useState<PromptKind>(null);
  const can = (a: TaskDetail['actions'][number]) => task.actions.includes(a);
  const close = () => setPrompt(null);
  const isResubmit = task.status === 'revision';

  return (
    <>
      <Group gap="xs">
        {can('take') && (
          <Button
            leftSection={<IconHandGrab size={16} />}
            loading={isPending}
            onClick={() => run({ id: task.id, action: 'take' })}
          >
            Взять в работу
          </Button>
        )}
        {can('submit') && (
          <Button
            color="yellow"
            leftSection={<IconSend size={16} />}
            loading={isPending}
            onClick={() => run({ id: task.id, action: 'submit' })}
          >
            {isResubmit ? 'Сдать исправленное' : 'Сдать на проверку'}
          </Button>
        )}
        {can('accept') && (
          <Button
            color="teal"
            leftSection={<IconCheck size={16} />}
            loading={isPending}
            onClick={() => run({ id: task.id, action: 'accept' })}
          >
            Принять
          </Button>
        )}
        {can('request_revision') && (
          <Button
            color="orange"
            variant="light"
            leftSection={<IconRepeat size={16} />}
            onClick={() => setPrompt('revision')}
          >
            На правки
          </Button>
        )}
        {can('edit') && (
          <Button variant="default" leftSection={<IconEdit size={16} />} onClick={onEdit}>
            Редактировать ТЗ
          </Button>
        )}
        {can('reassign') && (
          <Button
            variant="default"
            leftSection={<IconUserShare size={16} />}
            onClick={() => setPrompt('reassign')}
          >
            Сменить исполнителя
          </Button>
        )}
        {can('unassign') && (
          <Button
            variant="default"
            leftSection={<IconArrowBackUp size={16} />}
            loading={isPending}
            onClick={() => run({ id: task.id, action: 'unassign' })}
          >
            Вернуть в пул
          </Button>
        )}
        {can('cancel') && (
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconX size={16} />}
            onClick={() => setPrompt('cancel')}
          >
            Отменить задачу
          </Button>
        )}
      </Group>

      <TextPromptModal
        key={`revision-${task.id}-${prompt === 'revision'}`}
        opened={prompt === 'revision'}
        title="Отправить на правки"
        label="Что исправить"
        description="Комментарий увидит исполнитель; он же сохранится в истории задачи."
        confirm="Отправить на правки"
        color="orange"
        loading={isPending}
        onClose={close}
        onSubmit={(comment) => run({ id: task.id, action: 'request-revision', comment }, close)}
      />
      <TextPromptModal
        key={`cancel-${task.id}-${prompt === 'cancel'}`}
        opened={prompt === 'cancel'}
        title="Отменить задачу"
        label="Причина отмены"
        description="Задача уйдёт с доски в архив. История и AI-расходы сохранятся."
        confirm="Отменить задачу"
        color="red"
        loading={isPending}
        onClose={close}
        onSubmit={(reason) => run({ id: task.id, action: 'cancel', reason }, close)}
      />
      {prompt === 'reassign' && (
        <ReassignModal
          task={task}
          opened
          loading={isPending}
          onClose={close}
          onSubmit={(assignee_id) => run({ id: task.id, action: 'reassign', assignee_id }, close)}
        />
      )}
    </>
  );
}
