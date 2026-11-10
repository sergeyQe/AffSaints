import {
  createTheme,
  Drawer,
  Modal,
  Notification,
  PasswordInput,
  TableScrollContainer,
} from '@mantine/core';

// Кнопки-иконки без текста получают русскую подпись для скринридера по умолчанию
const closeLabel = { closeButtonProps: { 'aria-label': 'Закрыть' } };

export const theme = createTheme({
  primaryColor: 'violet',
  defaultRadius: 'md',
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  components: {
    Drawer: Drawer.extend({ defaultProps: closeLabel }),
    Modal: Modal.extend({ defaultProps: closeLabel }),
    Notification: Notification.extend({ defaultProps: closeLabel }),
    PasswordInput: PasswordInput.extend({
      defaultProps: { visibilityToggleButtonProps: { 'aria-label': 'Показать или скрыть пароль' } },
    }),
    // Широкая таблица на телефоне: полоса прокрутки видна сразу — иначе дальние колонки не найти
    TableScrollContainer: TableScrollContainer.extend({
      defaultProps: { scrollAreaProps: { type: 'always', offsetScrollbars: 'x' } },
    }),
  },
});
