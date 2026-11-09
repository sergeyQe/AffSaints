import { Button, Group } from '@mantine/core';
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
import { useRunTransition } from '../../hooks/useRunTransition';
import { TextPromptModal } from '../common/TextPromptModal';
import { ReassignModal } from './ReassignModal';

/** Какое окно ввода открыто: комментарий правок, причина отмены, выбор исполнителя. */
export type PromptKind = 'revision' | 'cancel' | 'reassign' | null;

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
