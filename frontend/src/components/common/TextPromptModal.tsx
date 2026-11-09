import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';

/** Общее окно «введите текст и подтвердите»: комментарий правок, причина отмены и т.п. */
export function TextPromptModal({
  title,
  label,
  description,
  confirm,
  color,
  opened,
  loading,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  description?: string;
  confirm: string;
  color: string;
  opened: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const error = touched && !text.trim() ? 'Обязательное поле' : null;
  return (
    <Modal opened={opened} onClose={onClose} title={title} zIndex={400}>
      <Stack>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
        <Textarea
          label={label}
          autosize
          minRows={3}
          value={text}
          error={error}
          onChange={(e) => setText(e.currentTarget.value)}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button
            color={color}
            loading={loading}
            onClick={() => {
              setTouched(true);
              if (text.trim()) onSubmit(text.trim());
            }}
          >
            {confirm}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
