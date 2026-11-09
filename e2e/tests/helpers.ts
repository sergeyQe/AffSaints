import { expect, type Browser, type Page } from '@playwright/test';

/** Пароль тестовых пользователей из сида (он же указан в README). */
export const DEMO_PASSWORD = 'demo12345';

/** Новый контекст браузера (свои куки) и вход через форму — как настоящий пользователь. */
export async function loginAs(browser: Browser, login: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Логин').fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Доска задач' })).toBeVisible();
  return page;
}

export async function openTask(page: Page, taskId: number, tab?: string) {
  await page.goto(`/?task=${taskId}${tab ? `&tab=${tab}` : ''}`);
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** Нажать действие в карточке и дождаться уведомления об успехе. */
export async function clickAction(page: Page, name: string, success: string) {
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  await expect(page.getByText(success)).toBeVisible();
}

export async function addResultLink(page: Page, url: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Файлы' }).click();
  await dialog.getByLabel('Ссылка на результат').fill(url);
  await dialog.getByRole('button', { name: 'Добавить ссылку' }).click();
  await expect(dialog.getByRole('link', { name: url })).toBeVisible();
}

export async function statusBadge(page: Page) {
  return page.getByRole('dialog').locator('header');
}
