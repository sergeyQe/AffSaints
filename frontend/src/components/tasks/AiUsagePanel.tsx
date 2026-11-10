import {
  ActionIcon,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconCheck, IconPencil, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';

import { useMe } from '../../api/auth';
import { useAiServices, useAiUsageMutation, useTaskAiUsage, type AiUsage } from '../../api/ai';
import type { TaskDetail } from '../../api/tasks';
import { formatCredits } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { hasRole } from '../../lib/roles';
import { formatDateTime } from '../../lib/tasks';

function UsageForm({
  taskId,
  initial,
  onDone,
}: {
  taskId: number;
  initial?: AiUsage;
  onDone: () => void;
}) {
  const services = useAiServices();
  const mutation = useAiUsageMutation(taskId);
  const [serviceId, setServiceId] = useState<string | null>(
    initial ? String(initial.service.id) : null,
  );
  const [credits, setCredits] = useState<number | string>(initial?.credits ?? '');
  const options = (services.data ?? []).map((s) => ({ value: String(s.id), label: s.name }));
  // Сервис отключили, а запись старая — оставляем его в списке, чтобы не потерять значение
  if (initial && !options.some((o) => o.value === String(initial.service.id))) {
    options.push({
      value: String(initial.service.id),
      label: `${initial.service.name} (отключён)`,
    });
  }
  const valid = serviceId !== null && Number(credits) > 0;

  const save = () => {
    if (!valid) return;
    const vars = initial
      ? {
          op: 'update' as const,
          id: initial.id,
          service_id: Number(serviceId),
          credits: Number(credits),
        }
      : { op: 'add' as const, service_id: Number(serviceId), credits: Number(credits) };
    mutation.mutate(vars, { onSuccess: onDone, onError: (e) => notifyError(e) });
  };

  return (
    <Group gap="xs" align="flex-end" wrap="wrap">
      <Select
        label="Сервис"
        placeholder="Выберите"
        data={options}
        value={serviceId}
        onChange={setServiceId}
        searchable
        w={200}
        nothingFoundMessage="Нет в справочнике"
      />
      <NumberInput
        label="Кредиты"
        value={credits}
        onChange={setCredits}
        min={0.01}
        decimalScale={2}
        decimalSeparator=","
        thousandSeparator=" "
        w={130}
      />
      <Button
        leftSection={initial ? <IconCheck size={16} /> : <IconPlus size={16} />}
        onClick={save}
        disabled={!valid}
        loading={mutation.isPending}
      >
        {initial ? 'Сохранить' : 'Добавить'}
      </Button>
      {initial && (
        <Button variant="default" leftSection={<IconX size={16} />} onClick={onDone}>
          Отмена
        </Button>
      )}
    </Group>
  );
}

export function AiUsagePanel({ task }: { task: TaskDetail }) {
  const usage = useTaskAiUsage(task.id);
  const me = useMe();
  const mutation = useAiUsageMutation(task.id);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Смена key пересоздаёт форму добавления — поля очищаются после успешного добавления
  const [addFormKey, setAddFormKey] = useState(0);
  const canManage = task.actions.includes('manage_ai_usage');
  const isHead = hasRole(me.data, 'head');
  // Креативщик правит только свои записи; руководитель — любые
  const canEdit = (u: AiUsage) => canManage && (isHead || u.user.id === me.data?.id);

  const items = usage.data?.items ?? [];
  const totals = usage.data?.totals ?? [];

  return (
    <Stack>
      {totals.length > 0 && (
        <Group gap="xs">
          {totals.map((t) => (
            <Paper key={t.service.id} withBorder px="sm" py={6} radius="md">
              <Text size="xs" c="dimmed">
                {t.service.name}
              </Text>
              <Text fw={700}>{formatCredits(t.credits)} кр.</Text>
            </Paper>
          ))}
        </Group>
      )}

      {items.length === 0 ? (
        <Text size="sm" c="dimmed">
          Расходов AI-кредитов по задаче пока нет.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={480}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Сервис</Table.Th>
                <Table.Th ta="right">Кредиты</Table.Th>
                <Table.Th>Исполнитель</Table.Th>
                <Table.Th>Когда</Table.Th>
                <Table.Th w={70} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((u) =>
                editingId === u.id ? (
                  <Table.Tr key={u.id}>
                    <Table.Td colSpan={5}>
                      <UsageForm taskId={task.id} initial={u} onDone={() => setEditingId(null)} />
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  <Table.Tr key={u.id}>
                    {/* Без переноса: метка круга не обрезается, таблица и так прокручивается */}
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      <Group gap={4} wrap="nowrap">
                        <Text size="sm">{u.service.name}</Text>
                        {!u.service.is_active && (
                          <Badge size="xs" color="gray">
                            отключён
                          </Badge>
                        )}
                      </Group>
                      {/* К какому кругу относится расход: первая версия или правки */}
                      <Badge
                        size="xs"
                        variant="light"
                        color={u.round > 0 ? 'orange' : 'blue'}
                        tt="none"
                        mt={2}
                        // Badge по умолчанию ужимается до ширины ячейки и режет текст многоточием
                        styles={{ root: { maxWidth: 'none' }, label: { overflow: 'visible' } }}
                      >
                        {u.round > 0 ? `Правки №${u.round}` : 'Первая версия'}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" fw={500}>
                        {formatCredits(u.credits)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{u.user.full_name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {formatDateTime(u.created_at)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {canEdit(u) && (
                        <Group gap={2} wrap="nowrap">
                          <Tooltip label="Изменить">
                            <ActionIcon
                              variant="subtle"
                              size="md"
                              onClick={() => setEditingId(u.id)}
                              aria-label="Изменить расход"
                            >
                              <IconPencil size={14} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Удалить">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size="md"
                              aria-label="Удалить расход"
                              onClick={() =>
                                mutation.mutate(
                                  { op: 'remove', id: u.id },
                                  { onError: (e) => notifyError(e) },
                                )
                              }
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ),
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {canManage && (
        <Paper withBorder p="sm" radius="md">
          <Text size="sm" fw={500} mb={6}>
            Добавить расход
          </Text>
          <UsageForm key={addFormKey} taskId={task.id} onDone={() => setAddFormKey((k) => k + 1)} />
          <Text size="xs" c="dimmed" mt={6}>
            Укажите каждый сервис отдельной строкой — включая работу над правками. Сервиса нет в
            списке — попросите руководителя добавить его в справочник.
          </Text>
        </Paper>
      )}
    </Stack>
  );
}
