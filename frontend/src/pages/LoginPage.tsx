import {
  Alert,
  Button,
  Center,
  Divider,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useDemoLogin, useDemoUsers, useLogin, useMe } from '../api/auth';
import { RoleBadges } from '../components/RoleBadges';
import { errorMessage } from '../lib/notify';
import classes from './LoginPage.module.css';

export function LoginPage() {
  const me = useMe();
  const demoUsers = useDemoUsers();
  const login = useLogin();
  const demoLogin = useDemoLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  const form = useForm({
    initialValues: { login: '', password: '' },
    validate: {
      login: (v) => (v.trim() ? null : 'Введите логин'),
      password: (v) => (v ? null : 'Введите пароль'),
    },
  });

  // Уже вошли — сразу на рабочую страницу
  if (me.data) return <Navigate to={redirectTo} replace />;

  const error = login.error ?? demoLogin.error;
  const busy = login.isPending || demoLogin.isPending;
  const onSuccess = () => navigate(redirectTo, { replace: true });

  return (
    <Center mih="100vh" p="md" className={classes.page}>
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={560}>
        <Stack gap="lg">
          <div>
            <Title order={2}>Креативный отдел</Title>
            <Text c="dimmed" size="sm">
              Задачи между медиабайерами и креативщиками
            </Text>
          </div>

          {error && (
            <Alert color="red" variant="light">
              {errorMessage(error)}
            </Alert>
          )}

          {!!demoUsers.data?.length && (
            <Stack gap="xs">
              <Text fw={500} size="sm">
                Быстрый вход — тестовые пользователи
              </Text>
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
                {demoUsers.data.map((u) => (
                  <UnstyledButton
                    key={u.id}
                    className={classes.demoButton}
                    disabled={busy}
                    onClick={() => demoLogin.mutate(u.id, { onSuccess })}
                    aria-label={`Войти как ${u.full_name}`}
                  >
                    <Text size="sm" fw={500} mb={4}>
                      {u.full_name}
                    </Text>
                    <RoleBadges roles={u.roles} size="xs" />
                  </UnstyledButton>
                ))}
              </SimpleGrid>
              <Divider label="или по логину и паролю" labelPosition="center" mt="xs" />
            </Stack>
          )}

          <form onSubmit={form.onSubmit((values) => login.mutate(values, { onSuccess }))}>
            <Stack gap="sm">
              <TextInput label="Логин" autoComplete="username" {...form.getInputProps('login')} />
              <PasswordInput
                label="Пароль"
                autoComplete="current-password"
                {...form.getInputProps('password')}
              />
              <Button type="submit" loading={login.isPending} disabled={busy}>
                Войти
              </Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Center>
  );
}
