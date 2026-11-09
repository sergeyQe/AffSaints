import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Ошибка рендера не оставляет белый экран: показываем понятное сообщение и кнопку перезагрузки. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ошибка интерфейса', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Center h="100vh" p="md">
        <Stack align="center" gap="xs" maw={420}>
          <Title order={3}>Что-то пошло не так</Title>
          <Text c="dimmed" ta="center">
            Интерфейс столкнулся с ошибкой. Данные не потеряны — обновите страницу.
          </Text>
          <Button onClick={() => window.location.reload()}>Обновить страницу</Button>
        </Stack>
      </Center>
    );
  }
}
