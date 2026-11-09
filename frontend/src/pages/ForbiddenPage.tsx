import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs">
        <Title order={3}>Нет доступа</Title>
        <Text c="dimmed">Этот раздел доступен только руководителю.</Text>
        <Button component={Link} to="/" variant="light">
          На доску задач
        </Button>
      </Stack>
    </Center>
  );
}

export function NotFoundPage() {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs">
        <Title order={3}>Страница не найдена</Title>
        <Button component={Link} to="/" variant="light">
          На доску задач
        </Button>
      </Stack>
    </Center>
  );
}
