import { defineConfig, devices } from '@playwright/test';

// Стенд поднимается заранее: docker compose up --build (порт 8180 по умолчанию)
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8180';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // Локально можно использовать установленный Chrome: E2E_CHANNEL=chrome
      use: { ...devices['Desktop Chrome'], channel: process.env.E2E_CHANNEL || undefined },
    },
  ],
});
