import { Center, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';

import { api } from './api/client';

export function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ status: string }>('/health'),
  });

  return (
    <Center h="100vh">
      <Stack align="center" gap="xs">
        <Title order={2}>Креативный отдел</Title>
        <Text c="dimmed">
          Backend: {health.isPending ? 'проверка…' : health.isError ? 'недоступен' : 'работает'}
        </Text>
      </Stack>
    </Center>
  );
}
