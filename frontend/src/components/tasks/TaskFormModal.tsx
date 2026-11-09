import {
  Alert,
  Button,
  Group,
  List,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { IconAlertTriangle } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState } from 'react';

import { uploadReferences } from '../../api/attachments';
import { useCreateTask, useUpdateTask, type TaskBrief, type TaskDetail } from '../../api/tasks';
import { notifyError, notifySuccess } from '../../lib/notify';
import {
  diffBrief,
  initialValues,
  needsNoDeadlineConfirm,
  quickDeadline,
  toBrief,
  type TaskFormValues,
} from '../../lib/taskForm';
import { CREATIVE_TYPE_LABELS, PRIORITY_LABELS, toOptions } from '../../lib/tasks';
import { ReferencesInput, type ReferencesValue } from './ReferencesInput';

const QUICK_DEADLINES = [
  { label: '+1 день', days: 1 },
  { label: '+3 дня', days: 3 },
  { label: '+1 неделя', days: 7 },
];

interface Props {
  /** null — создание новой задачи. */
  task: TaskDetail | null;
  onClose: () => void;
  onCreated?: (task: TaskDetail) => void;
}

export function TaskFormModal({ task, onClose, onCreated }: Props) {
  const isNew = task === null;
  const create = useCreateTask();
  const update = useUpdateTask();
  const [confirmNoDeadline, setConfirmNoDeadline] = useState<TaskBrief | null>(null);
  // Референсы из формы создания — прикладываются сразу после создания задачи
  const [references, setReferences] = useState<ReferencesValue>({ links: [], files: [] });
  const [uploading, setUploading] = useState(false);

  const form = useForm<TaskFormValues>({
    initialValues: initialValues(task),
    validate: {
      offer: (v) => (v.trim() ? null : 'Укажите оффер'),
      geo: (v) => (v.trim() ? null : 'Укажите GEO'),
      quantity: (v) =>
        Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 1000 ? null : 'От 1 до 1000',
      deadline: (v) =>
        v && v !== initialValues(task).deadline && dayjs(v).isBefore(dayjs().subtract(1, 'minute'))
          ? 'Дедлайн не может быть в прошлом'
          : null,
    },
  });

  const save = (brief: TaskBrief) => {
    const onError = (e: unknown) => notifyError(e);
    if (isNew) {
      create.mutate(brief, {
        onSuccess: async (created) => {
          // Задача создана — прикладываем референсы; сбой одного не отменяет остальные
          setUploading(true);
          const failed = await uploadReferences(created.id, references.links, references.files);
          setUploading(false);
          failed.forEach((f) => notifyError(f.error, `Референс «${f.name}» не приложен`));
          notifySuccess('Задача создана');
          onClose();
          onCreated?.(created);
        },
        onError,
      });
      return;
    }
    const changes = diffBrief(task, brief);
    if (!Object.keys(changes).length) {
      onClose();
      return;
    }
    update.mutate(
      { id: task.id, ...changes },
      {
        onSuccess: () => {
          notifySuccess('ТЗ обновлено');
          onClose();
        },
        onError,
      },
    );
  };

  const submit = (values: TaskFormValues) => {
    const brief = toBrief(values);
    // Без дедлайна — сначала объясняем последствия и просим подтверждение (решение №8)
    if (needsNoDeadlineConfirm(task, brief)) {
      setConfirmNoDeadline(brief);
      return;
    }
    save(brief);
  };

  const busy = create.isPending || update.isPending || uploading;

  return (
    <>
      <Modal
        opened
        onClose={onClose}
        title={isNew ? 'Новое ТЗ' : `Редактирование ТЗ #${task.id}`}
        size="lg"
      >
        <form onSubmit={form.onSubmit(submit)}>
          <Stack>
            {!isNew && task.assignee && (
              <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />}>
                Задача уже в работе у {task.assignee.full_name}. Исполнитель увидит пометку «ТЗ
                изменено», все правки сохраняются в истории.
              </Alert>
            )}
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="Оффер" withAsterisk {...form.getInputProps('offer')} />
              <TextInput
                label="GEO"
                withAsterisk
                placeholder="BR, MX, KZ…"
                {...form.getInputProps('geo')}
              />
              <Select
                label="Тип креатива"
                data={toOptions(CREATIVE_TYPE_LABELS)}
                allowDeselect={false}
                {...form.getInputProps('creative_type')}
              />
              <NumberInput
                label="Количество"
                min={1}
                max={1000}
                allowDecimal={false}
                {...form.getInputProps('quantity')}
              />
            </SimpleGrid>

            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Приоритет
              </Text>
              <SegmentedControl
                fullWidth
                data={toOptions(PRIORITY_LABELS)}
                {...form.getInputProps('priority')}
              />
            </Stack>

            <Stack gap={4}>
              <DateTimePicker
                label="Дедлайн"
                placeholder="Не указан"
                clearable
                clearButtonProps={{ 'aria-label': 'Очистить дедлайн' }}
                valueFormat="D MMMM YYYY, HH:mm"
                minDate={dayjs().format('YYYY-MM-DD')}
                {...form.getInputProps('deadline')}
              />
              <Group gap="xs">
                {QUICK_DEADLINES.map((q) => (
                  <Button
                    key={q.label}
                    size="compact-xs"
                    variant="light"
                    onClick={() => form.setFieldValue('deadline', quickDeadline(q.days))}
                  >
                    {q.label}
                  </Button>
                ))}
              </Group>
            </Stack>

            <Textarea
              label="Описание"
              autosize
              minRows={3}
              maxRows={10}
              placeholder="Формат, хронометраж, текст на креативе, подход…"
              {...form.getInputProps('description')}
            />
            {isNew && <ReferencesInput value={references} onChange={setReferences} />}

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Отмена
              </Button>
              <Button type="submit" loading={busy}>
                {isNew ? 'Создать задачу' : 'Сохранить'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={confirmNoDeadline !== null}
        onClose={() => setConfirmNoDeadline(null)}
        title="Дедлайн не указан"
        zIndex={400}
      >
        <Stack>
          <Text size="sm">Без дедлайна задача:</Text>
          <List size="sm" spacing={4}>
            <List.Item>не попадёт в метрику просрочек в аналитике;</List.Item>
            <List.Item>не будет подсвечиваться на доске при задержке;</List.Item>
            <List.Item>
              в колонке встанет после задач того же приоритета, у которых срок указан.
            </List.Item>
          </List>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmNoDeadline(null)}>
              Указать дедлайн
            </Button>
            <Button
              color="orange"
              loading={busy}
              onClick={() => {
                if (confirmNoDeadline) save(confirmNoDeadline);
                setConfirmNoDeadline(null);
              }}
            >
              {isNew ? 'Создать без дедлайна' : 'Сохранить без дедлайна'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
