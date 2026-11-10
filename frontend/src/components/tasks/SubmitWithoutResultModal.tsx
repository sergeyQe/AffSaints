import { Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core';
import { useState } from 'react';

/**
 * Сдача без материала: результат текущей версии не приложен. Исполнитель либо идёт
 * прикладывать файл/ссылку, либо явно подтверждает сдачу без него — галочка при каждом
 * открытии снята, без неё кнопка «Сдать» неактивна.
 */
export function SubmitWithoutResultModal({
  loading,
  onAttach,
  onConfirm,
  onClose,
}: {
  loading: boolean;
  onAttach: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Modal opened onClose={onClose} title="Материал не приложен" zIndex={400}>
      <Stack>
        <Text size="sm" c="dimmed">
          К текущей версии не прикреплён результат — файл или ссылка. Приложите его или сдайте
          задачу без материала: проверяющий увидит это в истории.
        </Text>
        <Checkbox
          label="Сдать без материала"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onAttach}>
            Приложить материал
          </Button>
          <Button color="yellow" disabled={!confirmed} loading={loading} onClick={onConfirm}>
            Сдать
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
