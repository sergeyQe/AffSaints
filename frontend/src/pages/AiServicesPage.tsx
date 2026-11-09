import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconCheck, IconPencil, IconPlus, IconX } from '@tabler/icons-react';
import { useState } from 'react';

import { useAiServices, useSaveAiService, type AiService } from '../api/ai';
import { notifyError, notifySuccess } from '../lib/notify';

function ServiceRow({ service }: { service: AiService }) {
  const save = useSaveAiService();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);

  const submitName = () => {
    if (!name.trim() || name.trim() === service.name) {
      setEditing(false);
      setName(service.name);
      return;
    }
    save.mutate(
      { id: service.id, name: name.trim() },
      { onSuccess: () => setEditing(false), onError: (e) => notifyError(e) },
    );
  };

  return (
    <Table.Tr>
      <Table.Td>
        {editing ? (
          <Group gap="xs" wrap="nowrap">
            <TextInput
              size="xs"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitName()}
              aria-label="Название сервиса"
              autoFocus
            />
            <ActionIcon variant="subtle" color="teal" onClick={submitName} aria-label="Сохранить">
              <IconCheck size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => {
                setEditing(false);
                setName(service.name);
              }}
              aria-label="Отменить"
            >
              <IconX size={16} />
            </ActionIcon>
          </Group>
        ) : (
          <Group gap="xs">
            <Text size="sm" fw={500} c={service.is_active ? undefined : 'dimmed'}>
              {service.name}
            </Text>
            <Tooltip label="Переименовать">
              <ActionIcon
                variant="subtle"
                size="md"
                onClick={() => setEditing(true)}
                aria-label={`Переименовать ${service.name}`}
              >
                <IconPencil size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Table.Td>
      <Table.Td>
        {service.is_active ? (
          <Badge color="teal" variant="dot">
            Доступен
          </Badge>
        ) : (
          <Badge color="gray" variant="dot">
            Отключён
          </Badge>
        )}
      </Table.Td>
      <Table.Td>
        <Switch
          size="md"
          checked={service.is_active}
          disabled={save.isPending}
          aria-label={`Доступен ${service.name}`}
          onChange={(e) =>
            save.mutate(
              { id: service.id, is_active: e.currentTarget.checked },
              { onError: (err) => notifyError(err) },
            )
          }
        />
      </Table.Td>
    </Table.Tr>
  );
}

export function AiServicesPage() {
  const services = useAiServices(true);
  const save = useSaveAiService();
  const [name, setName] = useState('');

  const add = () => {
    if (!name.trim()) return;
    save.mutate(
      { name: name.trim() },
      {
        onSuccess: (s) => {
          notifySuccess(`Сервис «${s.name}» добавлен`);
          setName('');
        },
        onError: (e) => notifyError(e),
      },
    );
  };

  return (
    <Stack maw={720}>
      <div>
        <Title order={3}>AI-сервисы</Title>
        <Text c="dimmed" size="sm">
          Креативщики выбирают сервис из этого списка, когда указывают расход кредитов. Отключённый
          сервис нельзя выбрать для новых записей, но прошлые расходы по нему сохраняются.
        </Text>
      </div>

      <Paper withBorder p="sm">
        <Group align="flex-end">
          <TextInput
            label="Новый сервис"
            placeholder="Например, Midjourney"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            style={{ flex: 1 }}
          />
          <Button leftSection={<IconPlus size={16} />} onClick={add} loading={save.isPending}>
            Добавить
          </Button>
        </Group>
      </Paper>

      <Table striped verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Название</Table.Th>
            <Table.Th>Статус</Table.Th>
            <Table.Th w={80}>Вкл.</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {services.data?.map((s) => (
            <ServiceRow key={s.id} service={s} />
          ))}
        </Table.Tbody>
      </Table>
      {services.data?.length === 0 && (
        <Text c="dimmed" ta="center">
          Справочник пуст — добавьте первый сервис.
        </Text>
      )}
    </Stack>
  );
}
