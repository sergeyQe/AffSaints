import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import type { ReactNode } from 'react';

import { theme } from './theme';

dayjs.locale('ru');

/**
 * Все провайдеры интерфейса в одном месте — их используют и приложение, и тесты,
 * поэтому тесты проверяют ту же конфигурацию (тема, русская локаль календарей).
 */
export function AppProviders({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <MantineProvider theme={theme} defaultColorScheme="light">
        {/* Календари Mantine: русские месяцы и дни, неделя с понедельника */}
        <DatesProvider settings={{ locale: 'ru', firstDayOfWeek: 1 }}>
          <ModalsProvider>
            <Notifications position="top-right" />
            {children}
          </ModalsProvider>
        </DatesProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
}
