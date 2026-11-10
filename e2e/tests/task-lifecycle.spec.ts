import { expect, test } from '@playwright/test';

import { addResultLink, clickAction, loginAs, openTask, statusBadge } from './helpers';

/**
 * Сквозной сценарий из ТЗ: байер ставит задачу → креативщик берёт и сдаёт →
 * правки → исправление → приёмка → руководитель видит результат в аналитике.
 */
test('полный цикл задачи от ТЗ до аналитики', async ({ browser }) => {
  const offer = `E2E оффер ${Date.now()}`;

  // 1. Байер создаёт ТЗ с дедлайном и референсом
  const buyer = await loginAs(browser, 'anna');
  await buyer.getByRole('button', { name: 'Новое ТЗ' }).click();
  const form = buyer.getByRole('dialog', { name: 'Новое ТЗ' });
  await form.getByLabel('Оффер').fill(offer);
  await form.getByLabel('GEO').fill('BR');
  await form.getByLabel('Количество').fill('3');
  await form.getByRole('button', { name: '+1 день' }).click();
  await form.getByLabel('Описание').fill('Вертикаль 15 секунд, сквозной тест');
  // Референс — прямо в форме ТЗ, как требует задание
  await form.getByLabel('Ссылка на референс').fill('https://www.tiktok.com/@ref/video/1');
  await form.getByRole('button', { name: 'Добавить ссылку' }).click();
  await form.getByRole('button', { name: 'Создать задачу' }).click();

  // После создания открывается карточка на вкладке «Файлы»
  await expect(buyer).toHaveURL(/task=\d+/);
  const taskId = Number(new URL(buyer.url()).searchParams.get('task'));
  // Референс из формы уже приложен — карточка открылась на вкладке «Файлы»
  const buyerDialog = buyer.getByRole('dialog');
  await expect(buyerDialog.getByRole('link', { name: 'https://www.tiktok.com/@ref/video/1' })).toBeVisible();

  // 2. Креативщик видит задачу на доске, берёт в работу, вносит AI-расход и сдаёт
  const creative = await loginAs(browser, 'ivan');
  await expect(creative.getByLabel(`Задача ${taskId}: ${offer}`)).toBeVisible();
  await openTask(creative, taskId);
  await clickAction(creative, 'Взять в работу', 'Задача взята в работу');
  await expect(await statusBadge(creative)).toContainText('В работе');

  // Сдать без результата нельзя — откроется вкладка файлов
  await clickAction(creative, 'Сдать на проверку', 'Прикрепите результат работы перед сдачей');
  await addResultLink(creative, 'https://drive.google.com/e2e-v1');

  const dialog = creative.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'AI-расходы' }).click();
  await dialog.getByLabel('Сервис').click();
  await creative.getByRole('option', { name: 'Midjourney' }).click();
  await dialog.getByLabel('Кредиты').fill('12,5');
  await dialog.getByRole('button', { name: 'Добавить' }).click();
  await expect(dialog.getByText('12,5 кр.')).toBeVisible();

  await clickAction(creative, 'Сдать на проверку', 'Работа сдана на проверку');

  // 3. Байер отправляет на правки с комментарием
  await openTask(buyer, taskId);
  await buyer.getByRole('dialog').getByRole('button', { name: 'На правки' }).click();
  await buyer.getByLabel('Что исправить').fill('Крупнее логотип');
  await buyer.getByRole('button', { name: 'Отправить на правки' }).click();
  await expect(buyer.getByText('Задача отправлена на правки')).toBeVisible();

  // 4. Креативщик видит комментарий, прикладывает версию 2 и сдаёт исправленное
  await openTask(creative, taskId);
  await expect(creative.getByRole('dialog').getByText('Крупнее логотип')).toBeVisible();
  await addResultLink(creative, 'https://drive.google.com/e2e-v2');
  await expect(creative.getByRole('dialog').getByText('Версия 2', { exact: true })).toBeVisible();
  await clickAction(creative, 'Сдать исправленное', 'Работа сдана на проверку');

  // 5. Байер принимает работу
  await openTask(buyer, taskId);
  await clickAction(buyer, 'Принять', 'Работа принята');
  await expect(await statusBadge(buyer)).toContainText('Готово');

  // История содержит все шаги
  await buyer.getByRole('dialog').getByRole('tab', { name: 'История' }).click();
  const history = buyer.getByRole('dialog');
  for (const step of [
    'Задача создана',
    'Взята в работу',
    'Сдана на проверку',
    'Отправлена на правки (круг 1)',
    'Исправления сданы на проверку',
    'Работа принята',
    'Указан расход AI',
  ]) {
    await expect(history.getByText(step, { exact: true })).toBeVisible();
  }

  // 6. Руководитель видит задачу и расход в аналитике (фильтр по офферу)
  const head = await loginAs(browser, 'head');
  await head.getByRole('link', { name: 'Аналитика' }).click();
  await head.getByLabel('Оффер').fill(offer);
  await expect(head.getByRole('group', { name: 'Создано' })).toContainText(/^Создано1/);
  await expect(head.getByRole('group', { name: 'Завершено' })).toContainText(/^Завершено1/);
  const ai = head.getByRole('region', { name: 'Расходы AI-кредитов' });
  await expect(ai.getByRole('cell', { name: '12,5' })).toBeVisible();
});

test('байер-креативщик не может взять собственную задачу, другой креативщик — может', async ({
  browser,
}) => {
  const offer = `E2E своя задача ${Date.now()}`;

  // Екатерина — байер и креативщик одновременно: создаёт задачу без дедлайна
  const kate = await loginAs(browser, 'kate');
  await kate.getByRole('button', { name: 'Новое ТЗ' }).click();
  const form = kate.getByRole('dialog', { name: 'Новое ТЗ' });
  await form.getByLabel('Оффер').fill(offer);
  await form.getByLabel('GEO').fill('KZ');
  await form.getByRole('button', { name: 'Создать задачу' }).click();
  // Без дедлайна — подтверждение с последствиями
  await expect(kate.getByText('не попадёт в метрику просрочек', { exact: false })).toBeVisible();
  await kate.getByRole('button', { name: 'Создать без дедлайна' }).click();
  await expect(kate).toHaveURL(/task=\d+/);
  const taskId = Number(new URL(kate.url()).searchParams.get('task'));

  // Своя задача: действия автора есть, «Взять в работу» — нет
  const own = kate.getByRole('dialog');
  await expect(own.getByRole('button', { name: 'Редактировать ТЗ' })).toBeVisible();
  await expect(own.getByRole('button', { name: 'Взять в работу' })).toHaveCount(0);

  // Другой креативщик видит кнопку и берёт задачу
  const ivan = await loginAs(browser, 'ivan');
  await openTask(ivan, taskId);
  await clickAction(ivan, 'Взять в работу', 'Задача взята в работу');
});
