import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dropzone/styles.css';
import '@mantine/charts/styles.css';

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { ME_KEY } from './api/auth';
import { ApiError } from './api/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProviders } from './providers';

// Любой 401 (истекла сессия, пользователя отключили) — сбрасываем текущего пользователя,
// RequireAuth сам уведёт на страницу входа
const onAuthError = (error: unknown) => {
  if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(ME_KEY, null);
};

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 5_000,
      // На 4xx повтор бессмысленен
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders client={queryClient}>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </AppProviders>
  </StrictMode>,
);
