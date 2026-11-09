import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';

import type { Role, User } from '../api/types';
import { useCreateUser, useUpdateUser, useUsers } from '../api/users';
import { RoleBadges } from '../components/RoleBadges';
import { notifyError, notifySuccess } from '../lib/notify';
import { ROLE_OPTIONS } from '../lib/roles';

interface FormValues {
  login: string;
  full_name: string;
  password: string;
  roles: Role[];
  is_active: boolean;
}

function UserFormModal({
  user,
  currentUserId,
  onClose,
}: {
  user: User | null;
  currentUserId: number;
  onClose: () => void;
}) {
  const isNew = user === null;
  const isSelf = user?.id === currentUserId;
  const create = useCreateUser();
  const update = useUpdateUser();

  const form = useForm<FormValues>({
    initialValues: {
      login: user?.login ?? '',
      full_name: user?.full_name ?? '',
      password: '',
      roles: user?.roles ?? [],
      is_active: user?.is_active ?? true,
    },
    validate: {
      login: (v) =>
        !isNew || /^[a-zA-Z0-9_.-]{3,64}$/.test(v)
          ? null
          : 'От 3 символов: латиница, цифры, точка, дефис, подчёркивание',
      full_name: (v) => (v.trim() ? null : 'Введите имя'),
      password: (v) =>
        (isNew && v.length < 8) || (!isNew && v && v.length < 8) ? 'Минимум 8 символов' : null,
      roles: (v) => (v.length ? null : 'Выберите хотя бы одну роль'),
    },
  });

  const submit = (values: FormValues) => {
    const done = {
      onSuccess: () => {
        notifySuccess(isNew ? 'Пользователь создан' : 'Изменения сохранены');
        onClose();
      },
      onError: (e: unknown) => notifyError(e),
    };
    if (isNew) {
      create.mutate(
        {
          login: values.login,
          full_name: values.full_name,
          password: values.password,
          roles: values.roles,
        },
        done,
      );
    } else {
      update.mutate(
        {
          id: user.id,
          full_name: values.full_name,
          roles: values.roles,
          is_active: values.is_active,
          password: values.password || undefined,
        },
        done,
      );
    }
  };

  return (
    <Modal opened onClose={onClose} title={isNew ? 'Новый пользователь' : 'Редактирование'}>
      <form onSubmit={form.onSubmit(submit)}>
        <Stack>
          <TextInput label="Логин" disabled={!isNew} {...form.getInputProps('login')} />
          <TextInput label="Имя" {...form.getInputProps('full_name')} />
          <PasswordInput
            label={isNew ? 'Пароль' : 'Новый пароль'}
            description={isNew ? undefined : 'Оставьте пустым, чтобы не менять'}
            autoComplete="new-password"
            {...form.getInputProps('password')}
          />
          <Checkbox.Group label="Роли" {...form.getInputProps('roles')}>
            <Group mt="xs">
              {ROLE_OPTIONS.map((o) => (
                <Checkbox
                  key={o.value}
                  value={o.value}
                  label={o.label}
                  disabled={isSelf && o.value === 'head'}
                />
              ))}
            </Group>
          </Checkbox.Group>
          {!isNew && (
            <Switch
              label="Активен"
              disabled={isSelf}
              {...form.getInputProps('is_active', { type: 'checkbox' })}
            />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function UsersPage({ currentUser }: { currentUser: User }) {
  const users = useUsers({ includeInactive: true });
  // undefined — модалка закрыта, null — создание, User — редактирование
  const [editing, setEditing] = useState<User | null | undefined>(undefined);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Пользователи</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing(null)}>
          Добавить
        </Button>
      </Group>

      <Table.ScrollContainer minWidth={600}>
        <Table striped highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Имя</Table.Th>
              <Table.Th>Логин</Table.Th>
              <Table.Th>Роли</Table.Th>
              <Table.Th>Статус</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.data?.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {u.full_name}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {u.login}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <RoleBadges roles={u.roles} />
                </Table.Td>
                <Table.Td>
                  {u.is_active ? (
                    <Badge color="teal" variant="dot">
                      Активен
                    </Badge>
                  ) : (
                    <Badge color="gray" variant="dot">
                      Отключён
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <Tooltip label="Редактировать">
                    <ActionIcon
                      variant="subtle"
                      onClick={() => setEditing(u)}
                      aria-label={`Редактировать ${u.full_name}`}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {editing !== undefined && (
        <UserFormModal
          user={editing}
          currentUserId={currentUser.id}
          onClose={() => setEditing(undefined)}
        />
      )}
    </Stack>
  );
}
